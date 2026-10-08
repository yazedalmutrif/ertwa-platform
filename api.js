/* Supabase backend: Auth + Postgres + database-enforced permissions. */
(function (global) {
    'use strict';
    let client;
    function getClient() {
        if (client) return client;
        const config = global.ERTWA_CONFIG || {};
        if (!config.supabaseUrl || !config.supabasePublishableKey) {
            throw new Error('لم يتم إعداد الاتصال بالمنصة بعد. يرجى التواصل مع إدارة المنصة.');
        }
        if (!global.supabase?.createClient) {
            throw new Error('تعذر تحميل الاتصال بالمنصة. تحقق من اتصال الإنترنت وأعد المحاولة.');
        }
        client = global.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return client;
    }
    async function result(query) {
        const response = await query;
        if (response.error) throw response.error;
        return response.data;
    }
    function text(value, label, max = 5000) {
        const trimmed = String(value ?? '').trim();
        if (!trimmed || trimmed.length > max) throw new Error(`يرجى إدخال ${label} بشكل صحيح.`);
        return trimmed;
    }
    function email(value) {
        const normalized = text(value, 'البريد الإلكتروني', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('البريد الإلكتروني غير صحيح.');
        return normalized;
    }
    function number(value, label, min, max) {
        const parsed = Number(value);
        if (String(value ?? '').trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max) {
            throw new Error(`يرجى إدخال ${label} بشكل صحيح.`);
        }
        return parsed;
    }
    async function getUser() {
        const sdk = getClient();
        const session = await result(sdk.auth.getSession());
        if (!session.session) return null;
        return (await result(sdk.auth.getUser())).user;
    }
    async function requireUser() {
        const user = await getUser();
        if (!user) throw new Error('يجب تسجيل الدخول أولاً.');
        return user;
    }
    async function getProfile() {
        const user = await requireUser();
        return result(getClient().from('profiles').select('*').eq('id', user.id).single());
    }
    async function requireAdmin() {
        const profile = await getProfile();
        if (profile.role !== 'admin') throw new Error('صلاحيات الإدارة مطلوبة.');
        return profile;
    }
    async function signUp(input) {
        const age = number(input.age, 'العمر', 1, 120);
        if (!Number.isInteger(age)) throw new Error('يرجى إدخال العمر بالسنوات.');
        if (!input.password || input.password.length < 8) throw new Error('كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.');
        if (!['tech', 'design', 'events', 'quality', 'media', 'content'].includes(input.department_slug)) throw new Error('يرجى اختيار اللجنة.');
        if (!Array.isArray(input.answers) || !input.answers.length || JSON.stringify(input.answers).length > 10000) throw new Error('يرجى مراجعة إجابات الأسئلة.');
        const data = await result(getClient().auth.signUp({
            email: email(input.email), password: input.password,
            options: {
                emailRedirectTo: new URL('dashboard.html', global.location.href).href,
                data: {
                    full_name: text(input.full_name, 'الاسم الكامل', 150),
                    city: text(input.city, 'المدينة', 100), age,
                    specialization: text(input.specialization, 'التخصص', 200),
                    department_slug: input.department_slug, answers: input.answers
                }
            }
        }));
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            throw new Error('تعذر إنشاء حساب جديد. إذا كان لديك حساب بالفعل، يرجى تسجيل الدخول.');
        }
        if (!data.user) throw new Error('تعذر إنشاء الحساب. يرجى المحاولة مرة أخرى.');
        return data;
    }
    async function signIn(address, password) {
        return result(getClient().auth.signInWithPassword({ email: email(address), password }));
    }
    async function signOut() {
        await result(getClient().auth.signOut());
        ['userToken', 'userRole', 'userName'].forEach(key => global.localStorage.removeItem(key));
    }
    async function listEvents(upcoming = false, limit = 100) {
        return result(getClient().rpc('list_events', { p_upcoming: upcoming, p_limit: limit }));
    }
    async function registeredEventIds() {
        const user = await getUser();
        if (!user) return [];
        const rows = await result(getClient().from('event_registrations').select('event_id').eq('user_id', user.id));
        return rows.map(row => row.event_id);
    }
    async function registerForEvent(eventId) {
        await requireUser();
        return result(getClient().rpc('register_for_event', { p_event_id: eventId }));
    }
    async function addEvent(input) {
        await requireAdmin();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new Error('يرجى إدخال التاريخ والوقت بشكل صحيح.');
        return result(getClient().from('events').insert({
            title: text(input.title, 'عنوان الفعالية', 200), description: text(input.description, 'وصف الفعالية'),
            date: input.date, time: input.time, location: text(input.location, 'المكان', 500),
            image: input.image || 'images/web-dev-event.png',
            capacity: input.capacity === '' || input.capacity == null ? null : number(input.capacity, 'عدد المقاعد', 1, 100000)
        }).select().single());
    }
    async function deleteEvent(eventId) {
        await requireAdmin();
        return result(getClient().from('events').delete().eq('id', eventId).select('id').single());
    }
    async function submitServiceRequest(input) {
        if (!['web', 'games', 'branding'].includes(input.service_type)) throw new Error('يرجى اختيار نوع الخدمة.');
        // No .select(): anonymous visitors have INSERT access only.
        return result(getClient().from('service_requests').insert({
            client_name: text(input.client_name, 'الاسم', 150), email: email(input.email),
            service_type: input.service_type, description: text(input.description, 'وصف المشروع'),
            budget: number(input.budget, 'الميزانية', 0, 9999999999.99), timeline: text(input.timeline, 'المدة الزمنية', 200)
        }));
    }
    async function submitContribution(input) {
        await requireUser();
        return result(getClient().from('contributions').insert({
            description: text(input.description, 'وصف المساهمة'), hours: number(input.hours, 'عدد الساعات', 0.01, 1000)
        }));
    }
    async function dashboardData() {
        const profile = await getProfile();
        const sdk = getClient();
        const [registrations, applications, contributions, requests] = await Promise.all([
            result(sdk.from('event_registrations').select('id, events(title, date, time, published)').eq('user_id', profile.id)),
            result(sdk.from('membership_applications').select('*, departments(name)').eq('user_id', profile.id)),
            result(sdk.from('contributions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })),
            result(sdk.from('service_requests').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }))
        ]);
        return { profile, registrations, applications, contributions, requests,
            hours: contributions.filter(item => item.status === 'approved').reduce((sum, item) => sum + Number(item.hours), 0) };
    }
    async function adminData() {
        await requireAdmin();
        const sdk = getClient();
        const [events, applications, requests, contributions] = await Promise.all([
            listEvents(),
            result(sdk.from('membership_applications').select('*, profiles!membership_applications_user_id_fkey(full_name, email), departments(name)').order('created_at', { ascending: false })),
            result(sdk.from('service_requests').select('*').order('created_at', { ascending: false })),
            result(sdk.from('contributions').select('*, profiles!contributions_user_id_fkey(full_name)').order('created_at', { ascending: false }))
        ]);
        return { events, applications, requests, contributions };
    }
    async function reviewApplication(id, status) {
        await requireAdmin();
        return result(getClient().rpc('review_application', { p_application_id: id, p_status: status }));
    }
    async function updateStatus(table, id, status) {
        await requireAdmin();
        const allowed = { service_requests: ['pending', 'in_progress', 'completed', 'rejected'], contributions: ['approved', 'rejected'] };
        if (!allowed[table]?.includes(status)) throw new Error('حالة الطلب غير صحيحة.');
        return result(getClient().from(table).update({ status }).eq('id', id).select('id').single());
    }
    async function structureData() {
        return Promise.all([
            result(getClient().from('platform_settings').select('leader_name, deputy_name').eq('id', true).single()),
            result(getClient().from('departments').select('*').order('sort_order'))
        ]);
    }
    function errorMessage(error) {
        if (error?.code === 'invalid_credentials') return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        if (error?.code === 'email_not_confirmed') return 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول.';
        if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) return 'تم تجاوز عدد المحاولات. يرجى الانتظار والمحاولة لاحقاً.';
        if (error?.code === 'user_already_exists') return 'يوجد حساب بهذا البريد. يرجى تسجيل الدخول.';
        if (error?.code === 'signup_disabled') return 'إنشاء الحسابات غير متاح حالياً.';
        if (error?.code === 'weak_password') return 'كلمة المرور ضعيفة. اختر كلمة مرور أقوى.';
        if (error?.code === '42501') return 'ليست لديك صلاحية لتنفيذ هذا الإجراء.';
        if (['23514', '22003', '22007'].includes(error?.code)) return 'بعض البيانات غير صحيحة. يرجى مراجعة الحقول.';
        if (error?.code === '23505') return 'هذا الطلب مسجل بالفعل.';
        if (error?.code === 'P0001' || /[\u0600-\u06ff]/.test(error?.message || '')) return error.message;
        return 'تعذر إتمام الطلب. تحقق من اتصال الإنترنت وحاول مرة أخرى.';
    }
    global.ErtwaAPI = {
        getUser, getProfile, signUp, signIn, signOut, listEvents, registeredEventIds,
        registerForEvent, addEvent, deleteEvent, submitServiceRequest, submitContribution,
        dashboardData, adminData, reviewApplication, updateStatus, structureData, errorMessage
    };
})(window);
