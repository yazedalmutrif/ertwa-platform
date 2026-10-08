(function () {
    'use strict';
    const api = window.ErtwaAPI;
    const services = { web: 'تطوير المواقع', games: 'تطوير الألعاب', branding: 'تصميم الهوية البصرية' };
    const statuses = { pending: 'قيد المراجعة', active: 'عضوية معتمدة', approved: 'معتمد', rejected: 'غير مقبول', in_progress: 'قيد التنفيذ', completed: 'مكتمل' };

    // All database content is rendered through textContent, never HTML strings.
    function node(tag, content, className) {
        const element = document.createElement(tag);
        if (content != null) element.textContent = content;
        if (className) element.className = className;
        return element;
    }
    function message(container, content, error = false) {
        let element = container.querySelector('.form-message');
        if (!element) {
            element = node('p', '', 'form-message');
            container.append(element);
        }
        element.setAttribute('role', error ? 'alert' : 'status');
        element.classList.toggle('is-error', error);
        element.textContent = content;
    }
    async function busy(button, work) {
        if (button.disabled) return;
        const previous = button.textContent;
        button.disabled = true;
        button.textContent = 'جارِ التنفيذ...';
        try { return await work(); }
        finally { button.disabled = false; button.textContent = previous; }
    }
    function list(container, values, empty) {
        container.replaceChildren(...(values.length ? values.map(value => node('li', value)) : [node('li', empty)]));
    }
    function safeImage(value) {
        try {
            const url = new URL(value, window.location.href);
            if (url.protocol === 'https:' || (url.origin === window.location.origin && url.protocol === 'http:')) return url.href;
        } catch (_) { /* use local default */ }
        return 'images/web-dev-event.png';
    }
    // Database text replaces the published HTML only when it is non-empty.
    function fill(element, value) {
        if (element && typeof value === 'string' && value.trim()) element.textContent = value;
    }
    const bySlug = items => new Map((items || []).map(item => [item.slug, item]));
    const dateLabel = value => new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', calendar: 'gregory' }).format(new Date(`${value}T12:00:00+03:00`));
    window.ErtwaUI = { node, message, busy, services, statuses };

    async function loadEvents() {
        const container = document.querySelector('.events-grid');
        if (!container) return;
        try {
            const home = container.id === 'homeEventsGrid';
            const [events, registrations] = await Promise.all([api.listEvents(home, home ? 3 : 100), api.registeredEventIds()]);
            container.replaceChildren();
            if (!events.length) container.append(node('p', 'لا توجد فعاليات متاحة حالياً.', 'data-message'));
            events.filter(event => event.published).forEach(event => {
                const card = node('article', null, 'event-card');
                const picture = node('div', null, 'card-image');
                const img = node('img');
                img.src = safeImage(event.image);
                img.alt = event.title;
                img.loading = 'lazy';
                img.addEventListener('error', () => { img.src = 'images/web-dev-event.png'; }, { once: true });
                picture.append(img, node('span', 'فعالية', 'category-tag'));
                const content = node('div', null, 'card-content');
                content.append(node('h3', event.title), node('p', event.description));
                const meta = node('div', null, 'event-meta');
                meta.append(node('span', `📅 ${dateLabel(event.date)}`), node('span', `🕒 ${event.time.slice(0, 5)} (بتوقيت الرياض)`), node('span', `📍 ${event.location}`));
                const footer = node('div', null, 'card-footer');
                const registered = registrations.includes(event.id);
                const past = new Date(`${event.date}T${event.time}+03:00`).getTime() <= Date.now();
                const full = event.capacity != null && Number(event.participants) >= event.capacity;
                const button = node('button', registered ? 'تم التسجيل ✓' : past ? 'انتهت الفعالية' : full ? 'اكتملت المقاعد' : 'سجل الآن', 'btn-register');
                button.type = 'button';
                button.disabled = registered || past || full;
                const participants = node('span', `${event.participants} مشارك`, 'participants');
                button.addEventListener('click', async () => {
                    try {
                        const registeredNow = await busy(button, async () => {
                            if (!await api.getUser()) { window.location.href = 'login.html'; return false; }
                            await api.registerForEvent(event.id);
                            return true;
                        });
                        if (!registeredNow) return;
                        button.textContent = 'تم التسجيل ✓';
                        button.disabled = true;
                        message(card, 'تم حفظ تسجيلك بنجاح.');
                        const fresh = (await api.listEvents()).find(item => item.id === event.id);
                        if (fresh) participants.textContent = `${fresh.participants} مشارك`;
                    } catch (error) { message(card, api.errorMessage(error), true); }
                });
                footer.append(button, participants);
                content.append(meta, footer);
                card.append(picture, content);
                container.append(card);
            });
        } catch (error) {
            container.replaceChildren(node('p', api.errorMessage(error), 'data-message is-error'));
            const retry = node('button', 'إعادة المحاولة', 'btn-secondary');
            retry.addEventListener('click', loadEvents);
            container.append(retry);
        }
    }

    function setupLogin() {
        const form = document.getElementById('loginForm');
        form?.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                await busy(form.querySelector('[type="submit"]'), async () => {
                    await api.signIn(document.getElementById('email').value, document.getElementById('password').value);
                    window.location.href = 'dashboard.html';
                });
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
    }

    function setupRegistration() {
        const personal = document.getElementById('personalInfoForm');
        if (!personal) return;
        const password = document.getElementById('userPassword');
        const confirm = document.getElementById('confirmPassword');
        const validatePasswords = () => confirm.setCustomValidity(confirm.value !== password.value ? 'كلمتا المرور غير متطابقتين.' : '');
        password.addEventListener('input', validatePasswords);
        confirm.addEventListener('input', validatePasswords);
        const form = document.getElementById('questionsForm');
        const slugs = { 'التقنية': 'tech', 'التصميم': 'design', 'الفعاليات والعلاقات': 'events', 'المتابعة والتطوير': 'quality', 'الإعلام': 'media', 'المحتوى': 'content' };
        form.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                const answers = Array.from(form.querySelectorAll('.question-row')).map(row => {
                    const controls = Array.from(row.querySelectorAll('input, textarea'));
                    const choice = controls[0]?.type === 'checkbox' || controls[0]?.type === 'radio';
                    const value = choice ? controls.filter(input => input.checked).map(input => input.value) : controls[0]?.value.trim();
                    if (row.dataset.required === 'true' && (!value || value.length === 0)) throw new Error('يرجى الإجابة على جميع الأسئلة المطلوبة.');
                    return { question: row.querySelector('.q-text').textContent.replace(/\s*\*$/, '').trim(), answer: value };
                });
                const data = await busy(form.querySelector('[type="submit"]'), () => api.signUp({
                    full_name: document.getElementById('fullName').value, email: document.getElementById('userEmail').value,
                    password: password.value, city: document.getElementById('userCity').value, age: document.getElementById('userAge').value,
                    specialization: document.getElementById('specializationSelect').value === 'other' ? document.getElementById('otherSpecializationInput').value : document.getElementById('specializationSelect').selectedOptions[0].textContent,
                    department_slug: slugs[document.getElementById('committeeQuestionTitle').textContent.trim()], answers
                }));
                if (!data) return;
                password.value = confirm.value = '';
                document.getElementById('step3Container').style.display = 'none';
                document.querySelector('.stepper').style.display = 'none';
                document.getElementById('successContainer').style.display = 'block';
                document.getElementById('registration-success-message').textContent = data.session
                    ? 'تم إنشاء حسابك وحفظ طلب الانضمام. يمكنك متابعة حالة الطلب من لوحة التحكم.'
                    : 'تم إنشاء حسابك وحفظ طلب الانضمام. افتح رسالة التأكيد في بريدك الإلكتروني ثم سجل الدخول لمتابعة حالة الطلب.';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
    }

    function setupOrders() {
        const form = document.getElementById('digitalServiceForm');
        form?.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                const saved = await busy(form.querySelector('[type="submit"]'), async () => {
                    await api.submitServiceRequest({
                        client_name: document.getElementById('clientName').value, email: document.getElementById('clientEmail').value,
                        service_type: document.getElementById('serviceType').value, description: document.getElementById('serviceDesc').value,
                        budget: document.getElementById('serviceBudget').value, timeline: document.getElementById('serviceTimeline').value
                    });
                    return true;
                });
                if (!saved) return;
                document.getElementById('formFields').style.display = 'none';
                document.getElementById('orderSuccess').style.display = 'block';
                message(form, '');
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
    }

    async function loadDashboard() {
        const welcome = document.getElementById('welcome-name');
        if (!welcome) return;
        const status = document.getElementById('dashboard-message');
        try {
            if (!await api.getUser()) { window.location.replace('login.html'); return; }
            const data = await api.dashboardData();
            welcome.textContent = `مرحباً بك، ${data.profile.full_name}`;
            const admin = data.profile.role === 'admin';
            document.getElementById('admin-controls').style.display = admin ? 'block' : 'none';
            document.getElementById('member-card-section').style.display = admin ? 'none' : 'block';
            document.getElementById('user-role-title').textContent = admin ? 'مدير المنصة' : 'حساب عضو في منصة ارتواء';
            document.getElementById('membership-status').textContent = statuses[data.profile.membership_status];
            document.getElementById('membership-description').textContent = data.applications.length
                ? `اللجنة: ${data.applications[0].departments?.name || ''} — الطلب ${statuses[data.applications[0].status]}`
                : 'لم يتم تقديم طلب انضمام للجنة.';
            document.getElementById('verified-hours').textContent = String(data.hours);
            document.getElementById('registered-events-count').textContent = String(data.registrations.length);
            list(document.getElementById('courses-list'), data.registrations.map(item => item.events?.title || 'فعالية غير متاحة'), 'لم تسجل في أي فعالية بعد.');
            list(document.getElementById('my-requests-list'), data.requests.map(item => `${services[item.service_type]} — ${statuses[item.status]}`), 'لا توجد طلبات خدمات مرتبطة بحسابك.');
            list(document.getElementById('contributions-list'), data.contributions.map(item => `${item.description} — ${item.hours} ساعة — ${statuses[item.status]}`), 'لم تقدم أي تقارير مساهمة بعد.');
            status.textContent = '';
            if (admin) await window.ErtwaAdmin.initialize();
        } catch (error) {
            status.textContent = api.errorMessage(error);
            status.classList.add('is-error');
        }
    }

    function setupDashboard() {
        document.getElementById('logout-button')?.addEventListener('click', async event => {
            try { await busy(event.currentTarget, async () => { await api.signOut(); window.location.href = 'index.html'; }); }
            catch (error) { message(document.querySelector('main'), api.errorMessage(error), true); }
        });
        const form = document.getElementById('contribution-form');
        document.getElementById('show-contribution-form')?.addEventListener('click', () => {
            form.hidden = !form.hidden;
            if (!form.hidden) document.getElementById('contribution-description').focus();
        });
        form?.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                const saved = await busy(form.querySelector('[type="submit"]'), async () => {
                    await api.submitContribution({ description: document.getElementById('contribution-description').value, hours: document.getElementById('contribution-hours').value });
                    return true;
                });
                if (!saved) return;
                form.reset();
                message(form, 'تم حفظ تقريرك وإرساله للمراجعة.');
                await loadDashboard();
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
    }

    async function loadStructure() {
        if (!document.getElementById('departments-list')) return;
        try {
            const { settings, departments } = await api.siteContent();
            document.getElementById('platform-leader-name').textContent = settings.leader_name || 'غير محدد';
            document.getElementById('platform-deputy-name').textContent = settings.deputy_name || 'غير محدد';
            document.querySelectorAll('[data-title]').forEach(element => fill(element, settings[element.dataset.title]));
            const saved = bySlug(departments);
            document.querySelectorAll('#departments-list .dept-card-box[data-dept]').forEach(card => {
                const department = saved.get(card.dataset.dept);
                if (!department) return;
                card.querySelector('.dept-person-name').textContent = department.leader || 'غير محدد';
                card.querySelector('.dept-deputy-name').textContent = department.deputy || 'غير محدد';
                fill(card.querySelector('.dept-leader-tag'), department.leader_title);
                fill(card.querySelector('.dept-deputy-tag'), department.deputy_title);
            });
        } catch (error) { message(document.getElementById('departments-list'), api.errorMessage(error), true); }
    }

    // On any failure the homepage keeps the text already in its HTML.
    async function loadHomeContent() {
        if (!document.querySelector('[data-stat]')) return;
        let content;
        try { content = await api.siteContent(); } catch (_) { return; }
        document.querySelectorAll('[data-content]').forEach(element => fill(element, content.settings?.[element.dataset.content]));
        const departments = bySlug(content.departments);
        document.querySelectorAll('.spec-card[data-dept]').forEach(card => fill(card.querySelector('p'), departments.get(card.dataset.dept)?.description));
        const stats = bySlug(content.stats);
        document.querySelectorAll('[data-stat]').forEach(card => {
            const stat = stats.get(card.dataset.stat);
            if (!stat) return;
            const number = card.querySelector('.stat-number');
            if (stat.value?.trim()) { number.dataset.final = stat.value; number.textContent = stat.value; }
            fill(card.querySelector('.stat-label'), stat.label);
            fill(card.querySelector('.stat-sub'), stat.caption);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupLogin(); setupRegistration(); setupOrders(); setupDashboard();
        loadEvents(); loadDashboard(); loadStructure(); loadHomeContent();
    });
})();
