import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

// Extra scripts run after main.js (they read window.ErtwaUI); setup runs once the HTML is in place.
async function page(name, api, { scripts = [], setup } = {}) {
    const window = new Window({ url: `http://localhost:5500/${name}`, settings: {
        enableJavaScriptEvaluation: true, disableCSSFileLoading: true,
        disableJavaScriptFileLoading: true, disableComputedStyleRendering: true,
        suppressInsecureJavaScriptEnvironmentWarning: true
    } });
    window.document.write(await read(name));
    setup?.(window);
    window.ErtwaAPI = { errorMessage: error => error.message, ...api };
    for (const script of ['main.js', ...scripts]) window.eval(await read(script));
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await flush();
    return window;
}
const submit = (window, id) => window.document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const fill = (window, values) => Object.entries(values).forEach(([id, value]) => { window.document.getElementById(id).value = value; });

test('missing configuration fails explicitly; legacy demo tokens cannot log in', async () => {
    const context = vm.createContext({ window: { localStorage: { getItem: () => 'admin-demo-token' } }, URL });
    vm.runInContext(await read('api.js'), context);
    await assert.rejects(context.window.ErtwaAPI.getUser(), /لم يتم إعداد/);
});

test('failed login stays on the form and restores the submit button', async () => {
    const window = await page('login.html', { signIn: async () => { throw new Error('بيانات غير صحيحة'); } });
    fill(window, { email: 'admin@example.com', password: 'incorrect-password' });
    submit(window, 'loginForm'); await flush();
    assert.ok(window.location.href.endsWith('login.html'));
    assert.match(window.document.querySelector('.form-message').textContent, /بيانات غير صحيحة/);
    assert.equal(window.document.querySelector('[type="submit"]').disabled, false);
    assert.equal(window.localStorage.getItem('userRole'), null);
    await window.happyDOM.close();
});

test('service requests preserve the selected service and show success only after a write succeeds', async () => {
    let fail = true, submitted;
    const window = await page('order.html', { submitServiceRequest: async input => {
        submitted = input; if (fail) throw new Error('فشل الحفظ');
    } });
    fill(window, { clientName: 'عميل', clientEmail: 'client@example.com', serviceType: 'branding', serviceDesc: 'هوية بصرية', serviceBudget: '4500', serviceTimeline: 'شهر' });
    submit(window, 'digitalServiceForm'); await flush();
    assert.equal(submitted.service_type, 'branding');
    assert.notEqual(window.document.getElementById('formFields').style.display, 'none');
    assert.notEqual(window.document.getElementById('orderSuccess').style.display, 'block');
    fail = false;
    submit(window, 'digitalServiceForm'); await flush();
    assert.equal(window.document.getElementById('formFields').style.display, 'none');
    assert.equal(window.document.getElementById('orderSuccess').style.display, 'block');
    await window.happyDOM.close();
});

test('event content is rendered as text and failed registration never displays success', async () => {
    const event = { id: 'uuid', title: '<img src=x onerror=alert(1)>', description: '<script>bad()</script>',
        image: 'javascript:alert(1)', date: '2099-01-01', time: '12:00:00', location: 'الرياض', published: true, participants: 3, capacity: 10 };
    const window = await page('events.html', { listEvents: async () => [event], registeredEventIds: async () => [],
        getUser: async () => ({ id: 'member' }), registerForEvent: async () => { throw new Error('اكتملت المقاعد'); } });
    const card = window.document.querySelector('.event-card');
    assert.equal(card.querySelector('h3').textContent, event.title);
    assert.equal(card.querySelector('h3 img'), null);
    assert.equal(card.querySelector('p script'), null);
    assert.ok(card.querySelector('img').src.endsWith('images/web-dev-event.png'));
    card.querySelector('.btn-register').click(); await flush();
    card.querySelector('.event-phone [name="phone"]').value = '0551234567';
    card.querySelector('.event-phone').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush();
    assert.equal(card.querySelector('.btn-register').textContent, 'سجل الآن');
    assert.equal(card.querySelector('.btn-register').disabled, false);
    assert.match(card.querySelector('.form-message').textContent, /اكتملت المقاعد/);
    await window.happyDOM.close();
});

test('registration retains answers on failure and handles email confirmation without a session', async () => {
    let fail = true, submitted;
    const window = await page('register.html', { signUp: async input => {
        submitted = input; if (fail) throw new Error('فشل إنشاء الحساب');
        return { user: { id: 'member' }, session: null };
    } });
    fill(window, { fullName: 'عضو', userEmail: 'member@example.com', userPassword: 'UniquePassword123', confirmPassword: 'UniquePassword123', userCity: 'الرياض', userAge: '25', specializationSelect: 'cs' });
    window.document.getElementById('committeeQuestionTitle').textContent = 'التقنية';
    window.document.getElementById('committeeQuestionTitle').dataset.slug = 'tech';
    window.document.getElementById('dynamicQuestions').innerHTML = '<div class="question-row" data-required="true"><span class="q-text">مشروعك *</span><textarea>مشروعي التقني</textarea></div>';
    submit(window, 'questionsForm'); await flush();
    assert.equal(submitted.department_slug, 'tech');
    assert.equal(submitted.answers[0].answer, 'مشروعي التقني');
    assert.notEqual(window.document.getElementById('successContainer').style.display, 'block');
    assert.equal(window.document.getElementById('userPassword').value, 'UniquePassword123');
    fail = false;
    submit(window, 'questionsForm'); await flush();
    assert.equal(window.document.getElementById('successContainer').style.display, 'block');
    assert.match(window.document.getElementById('registration-success-message').textContent, /رسالة التأكيد/);
    assert.equal(window.document.getElementById('userPassword').value, '');
    await window.happyDOM.close();
});

test('required checkbox answers prevent signup when no choice is selected', async () => {
    let calls = 0;
    const window = await page('register.html', { signUp: async () => { calls++; } });
    window.document.getElementById('dynamicQuestions').innerHTML = '<div class="question-row" data-required="true"><span class="q-text">لغات البرمجة *</span><input type="checkbox" value="JavaScript"></div>';
    submit(window, 'questionsForm'); await flush();
    assert.equal(calls, 0);
    assert.match(window.document.querySelector('.form-message').textContent, /جميع الأسئلة/);
    await window.happyDOM.close();
});

test('member dashboard displays database values and ignores local admin flags', async () => {
    const window = await page('dashboard.html', {
        getUser: async () => ({ id: 'member' }),
        dashboardData: async () => ({ profile: { full_name: 'اسم حقيقي', role: 'member', membership_status: 'pending' },
            applications: [{ departments: { name: 'التقنية' }, status: 'pending' }], registrations: [], contributions: [], requests: [], hours: 0 })
    });
    window.localStorage.setItem('userRole', 'admin');
    assert.equal(window.document.getElementById('admin-controls').style.display, 'none');
    assert.match(window.document.getElementById('welcome-name').textContent, /اسم حقيقي/);
    assert.equal(window.document.getElementById('verified-hours').textContent, '0');
    assert.equal(window.document.getElementById('membership-status').textContent, 'قيد المراجعة');
    await window.happyDOM.close();
});

test('homepage shows database content as text and keeps its own text when loading fails', async () => {
    const content = { settings: { hero_text: '<img src=x onerror=alert(1)>', mission_text: '', vision_text: 'رؤية جديدة' },
        departments: [{ slug: 'media', description: 'وصف الإعلام' }], stats: [{ slug: 'members', value: '60+', label: 'عضو', caption: '' }] };
    const ok = await page('index.html', { siteContent: async () => content, listEvents: async () => [], registeredEventIds: async () => [] }, { scripts: ['departments.js'] });
    const doc = ok.document;
    assert.equal(doc.querySelector('[data-content="hero_text"]').textContent, content.settings.hero_text);
    assert.equal(doc.querySelector('[data-content="hero_text"] img'), null);
    assert.match(doc.querySelector('[data-content="mission_text"]').textContent, /المعرفة حق للجميع/);
    assert.equal(doc.querySelector('[data-content="vision_text"]').textContent, 'رؤية جديدة');
    assert.equal(doc.querySelector('[data-dept="media"] p').textContent, 'وصف الإعلام');
    assert.equal(doc.querySelector('[data-stat="members"] .stat-number').textContent, '60+');
    assert.equal(doc.querySelector('[data-stat="members"] .stat-sub').textContent, 'من مختلف التخصصات التقنية');
    await ok.happyDOM.close();
    const failed = await page('index.html', { siteContent: async () => { throw new Error('offline'); }, listEvents: async () => [], registeredEventIds: async () => [] });
    assert.equal(failed.document.querySelector('[data-stat="followers"] .stat-number').textContent, '10K+');
    await failed.happyDOM.close();
});

test('stat counters show text values as-is and finish on a late database value', async () => {
    const setup = w => {
        w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } unobserve() {} };
        w.document.querySelector('[data-stat="events"] .stat-number').textContent = 'قريباً';
    };
    const window = await page('index.html', { siteContent: () => new Promise(() => {}), listEvents: async () => [], registeredEventIds: async () => [] },
        { scripts: ['script.js'], setup });
    const late = window.document.querySelector('[data-stat="members"] .stat-number');
    late.dataset.final = '75+'; late.textContent = '75+';
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(window.document.querySelector('[data-stat="events"] .stat-number').textContent, 'قريباً');
    assert.equal(late.textContent, '75+');
    await window.happyDOM.close();
});

test('structure page fills leaders and titles by department slug', async () => {
    const window = await page('structure.html', { siteContent: async () => ({
        settings: { leader_name: 'قائد', deputy_name: 'نائبة', leader_title: 'قائدة المنصة', deputy_title: 'نائبة القائد' },
        departments: [{ slug: 'tech', leader: '', deputy: 'سامي', leader_title: 'قائد القسم', deputy_title: 'نائب القسم' }], stats: [] }) }, { scripts: ['departments.js'] });
    const tech = window.document.querySelector('[data-dept="tech"]');
    assert.equal(tech.querySelector('.dept-person-name').textContent, 'غير محدد');
    assert.equal(tech.querySelector('.dept-leader-tag').textContent, 'قائد القسم');
    assert.equal(window.document.querySelector('[data-title="leader_title"]').textContent, 'قائدة المنصة');
    assert.ok(window.document.querySelector('.leader-label i'));
    await window.happyDOM.close();
});

const adminPage = ({ events = [], members = [], ...api } = {}) => page('dashboard.html', {
    getUser: async () => ({ id: 'self' }),
    getProfile: async () => ({ id: 'self' }),
    dashboardData: async () => ({ profile: { full_name: 'المشرف', role: 'admin', membership_status: 'active' },
        applications: [], registrations: [], contributions: [], requests: [], hours: 0 }),
    adminData: async () => ({ events, applications: [], requests: [], contributions: [] }),
    listMembers: async () => members,
    siteContent: async () => ({ settings: {}, departments: [], stats: [] }),
    ...api
}, { scripts: ['admin-content.js', 'admin.js'] });

test('admins edit an existing event without re-entering it', async () => {
    const calls = [];
    const event = { id: 'e1', title: 'ورشة', description: 'تفاصيل', date: '2099-05-01', time: '18:30:00', location: 'الطائف', image: 'images/web-dev-event.png', capacity: 20, published: true, participants: 3 };
    const window = await adminPage({ events: [event], members: [],
        updateEvent: async (id, input) => calls.push(['update', id, { ...input }]), // copied out of the page's realm addEvent: async () => calls.push(['add']),
        setEventPublished: async (id, published) => calls.push(['publish', id, published]) });
    const row = window.document.querySelector('#admin-events-list tr');
    [...row.querySelectorAll('button')].find(button => button.textContent === 'تعديل').click(); await flush();
    const value = id => window.document.getElementById(id).value;
    assert.deepEqual([value('event-title'), value('event-time'), value('event-image'), value('event-capacity')], ['ورشة', '18:30', '', '20']);
    assert.equal(window.document.getElementById('event-form-title').textContent.trim(), 'تعديل الفعالية');
    window.document.getElementById('event-loc').value = 'أونلاين';
    submit(window, 'add-event-form'); await flush();
    assert.deepEqual(calls[0], ['update', 'e1', { title: 'ورشة', description: 'تفاصيل', date: '2099-05-01', time: '18:30', location: 'أونلاين', image: '', capacity: '20' }]);
    assert.equal(window.document.getElementById('event-submit').textContent.trim(), 'إضافة الفعالية للمنصة +');
    [...window.document.querySelectorAll('#admin-events-list button')].find(button => button.textContent === 'إخفاء').click(); await flush();
    assert.deepEqual(calls.at(-1), ['publish', 'e1', false]);
    await window.happyDOM.close();
});

test('members table offers role changes except on the signed-in admin', async () => {
    const changes = [];
    const window = await adminPage({ events: [], members: [
        { id: 'self', full_name: 'أنا', email: 'me@x.co', role: 'admin', membership_status: 'active' },
        { id: 'u2', full_name: 'عضو', email: 'u2@x.co', role: 'member', membership_status: 'pending' }],
        setMemberRole: async (id, role) => changes.push([id, role]) });
    window.confirm = () => true;
    const rows = window.document.querySelectorAll('#admin-members-list tr');
    assert.equal(rows[0].querySelector('button'), null);
    assert.equal(rows[1].querySelector('button').textContent, 'ترقية لمشرف');
    rows[1].querySelector('button').click(); await flush();
    assert.deepEqual(changes, [['u2', 'admin']]);
    await window.happyDOM.close();
});

const content = () => ({
    settings: { leader_name: 'رواء المالكي', deputy_name: 'رياض المالكي', leader_title: 'قائد المنصة', deputy_title: 'نائب القائد',
        hero_text: 'مقدمة', mission_text: 'رسالة', vision_text: 'رؤية' },
    departments: [{ slug: 'design', display_name: 'لجنة التصميم', leader: 'شهد بخاري', deputy: 'رغد',
        leader_title: 'قائدة القسم', deputy_title: 'نائبة القسم', description: 'وصف التصميم' }],
    stats: [{ slug: 'volunteer_hours', value: '400+', label: 'ساعة تطوعية معتمدة', caption: 'من منصة العمل التطوعي' },
        { slug: 'followers', value: '10K+', label: 'متابع', caption: 'عبر منصات التواصل الاجتماعي' }]
});

test('admins save a department leader and title from the dashboard', async () => {
    const saved = [];
    const window = await adminPage({ siteContent: async () => content(),
        saveDepartment: async (slug, input) => saved.push([slug, { ...input }]) });
    const form = window.document.querySelector('#admin-structure-list [data-row="design"]');
    form.querySelector('[name="leader"]').value = 'اسم جديد';
    form.querySelector('[name="leader_title"]').value = 'قائد القسم';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush();
    assert.deepEqual(saved, [['design', { leader: 'اسم جديد', leader_title: 'قائد القسم', deputy: 'رغد', deputy_title: 'نائبة القسم', description: 'وصف التصميم' }]]);
    assert.match(form.querySelector('.form-message').textContent, /تم الحفظ/);
    await window.happyDOM.close();
});

test('home content saves texts then each stat and reports the first error, keeping the input', async () => {
    const calls = [];
    const window = await adminPage({ siteContent: async () => content(),
        saveSettings: async input => calls.push(['settings', { ...input }]),
        saveStat: async (slug, input) => { calls.push([slug, { ...input }]); if (slug === 'followers') throw new Error('بعض البيانات غير صحيحة. يرجى مراجعة الحقول.'); } });
    window.document.getElementById('content-vision').value = 'رؤية طويلة';
    submit(window, 'home-content-form'); await flush();
    assert.deepEqual(calls[0], ['settings', { hero_text: 'مقدمة', mission_text: 'رسالة', vision_text: 'رؤية طويلة' }]);
    assert.deepEqual(calls.slice(1).map(call => call[0]), ['volunteer_hours', 'followers']);
    assert.match(window.document.querySelector('#home-content-form .form-message').textContent, /غير صحيحة/);
    assert.equal(window.document.getElementById('content-vision').value, 'رؤية طويلة');
    await window.happyDOM.close();
});

test('stat counters end on exactly the value that was entered', async () => {
    const setup = w => {
        w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } unobserve() {} };
        // Runs the counters' short intervals back to back (capped); the 2s typing effect never starts.
        w.setInterval = (callback, delay) => {
            const handle = { stopped: delay >= 1000, ticks: 0 };
            const tick = () => { if (!handle.stopped && handle.ticks++ < 5000) { callback(); setImmediate(tick); } };
            setImmediate(tick);
            return handle;
        };
        w.clearInterval = handle => { if (handle) handle.stopped = true; };
        w.document.querySelector('[data-stat="members"] .stat-number').textContent = '1,200+';
        w.document.querySelector('[data-stat="events"] .stat-number').textContent = '+50';
    };
    const window = await page('index.html', { siteContent: () => new Promise(() => {}), listEvents: async () => [], registeredEventIds: async () => [] },
        { scripts: ['script.js'], setup });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(window.document.querySelector('[data-stat="members"] .stat-number').textContent, '1,200+');
    assert.equal(window.document.querySelector('[data-stat="events"] .stat-number').textContent, '+50');
    await window.happyDOM.close();
});

test('the homepage content form stays closed when its content fails to load', async () => {
    let saves = 0;
    const window = await adminPage({ siteContent: async () => { throw new Error('انقطع الاتصال'); },
        saveSettings: async () => { saves++; }, saveStat: async () => { saves++; } });
    const form = window.document.getElementById('home-content-form');
    assert.equal(form.hidden, true);
    submit(window, 'home-content-form'); await flush();
    assert.equal(saves, 0);
    assert.match(window.document.getElementById('admin-structure-list').textContent, /انقطع الاتصال/);
    await window.happyDOM.close();
});

test('headers show the dashboard and logout once signed in', async () => {
    let signedOut = false;
    const signedIn = await page('events.html', { getUser: async () => ({ id: 'u1' }), signOut: async () => { signedOut = true; }, listEvents: async () => [], registeredEventIds: async () => [] });
    const header = signedIn.document.querySelector('.main-header');
    assert.equal(header.querySelector('a.btn-login').textContent, 'لوحة التحكم');
    header.querySelector('.btn-logout').click(); await flush();
    assert.equal(signedOut, true);
    await signedIn.happyDOM.close();
    const guest = await page('events.html', { getUser: async () => null, listEvents: async () => [], registeredEventIds: async () => [] });
    assert.equal(guest.document.querySelector('.main-header .btn-login').textContent.trim(), 'تسجيل الدخول');
    await guest.happyDOM.close();
});

test('the login page sends signed-in visitors to the dashboard', async () => {
    const window = await page('login.html', { getUser: async () => ({ id: 'u1' }) });
    assert.ok(window.location.href.endsWith('dashboard.html'));
    await window.happyDOM.close();
});

const departmentsFixture = () => [
    { slug: 'tech', name: 'التقنية', display_name: 'القسم التقني', page_title: 'القسم التقني (Technology Department)', description: 'تطوير', details: 'تفاصيل التقنية',
        tasks: 'مهمة', icon: 'fa-code', image: 'images/Overlay(6).svg', active: true, sort_order: 1, leader: 'منار', deputy: 'سامي', leader_title: 'قائدة القسم', deputy_title: 'نائب القسم' },
    { slug: 'dept-ai', name: '<img src=x onerror=1>', display_name: 'لجنة الذكاء', page_title: 'قسم الذكاء', description: 'وصف', details: 'تفاصيل',
        tasks: 'مهمة ١\nمهمة ٢', icon: 'fa-lightbulb', image: '', active: true, sort_order: 7, leader: '', deputy: 'نائب', leader_title: 'قائد القسم', deputy_title: 'نائب القسم' },
    { slug: 'media', name: 'الإعلام', display_name: 'اللجنة الإعلامية', page_title: 'قسم الإعلام', description: 'إعلام', details: '', tasks: '',
        icon: 'fa-camera-retro', image: 'images/Overlay(4).svg', active: false, sort_order: 5, leader: '', deputy: '', leader_title: 'قائدة القسم', deputy_title: 'نائب القسم' }
];

test('every public page renders active departments as text and skips hidden ones', async () => {
    const content = async () => ({ settings: {}, stats: [], departments: departmentsFixture() });
    const pages = { 'index.html': '.spec-card', 'departments.html': '.departments-page-container .info-card', 'structure.html': '.dept-card-box', 'register.html': '.committee-card' };
    for (const [name, selector] of Object.entries(pages)) {
        const window = await page(name, { siteContent: content, listEvents: async () => [], registeredEventIds: async () => [] }, { scripts: ['departments.js'] });
        const slugs = [...window.document.querySelectorAll(selector)].map(card => card.dataset.dept || card.dataset.slug);
        assert.deepEqual(slugs, ['tech', 'dept-ai'], name);
        assert.equal(window.document.querySelector(`${selector} img[src="x"]`), null, name);
        await window.happyDOM.close();
    }
});

test('the departments page shows every section for an unknown link', async () => {
    const window = await page('departments.html', { siteContent: async () => ({ settings: {}, stats: [], departments: departmentsFixture() }) },
        { scripts: ['departments.js'], setup: w => { w.location.hash = '#old-dept'; } });
    const shown = [...window.document.querySelectorAll('.info-card')].filter(card => card.style.display !== 'none');
    assert.equal(shown.length, 2);
    await window.happyDOM.close();
});

test('choosing a new department signs up with its slug and the standard questions', async () => {
    let submitted;
    const window = await page('register.html', { siteContent: async () => ({ settings: {}, stats: [], departments: departmentsFixture() }),
        signUp: async input => { submitted = input; return { user: { id: 'u' }, session: null }; } }, { scripts: ['script.js', 'departments.js'] });
    window.document.querySelector('.committee-card[data-slug="dept-ai"]').click();
    await new Promise(resolve => setTimeout(resolve, 450));
    assert.equal(window.document.getElementById('committeeQuestionTitle').dataset.slug, 'dept-ai');
    assert.equal(window.document.querySelectorAll('#dynamicQuestions .question-row').length, 4);
    window.document.querySelectorAll('#dynamicQuestions .question-row').forEach(row => {
        const radio = row.querySelector('input[type="radio"]'); if (radio) radio.checked = true;
        row.querySelectorAll('textarea, input[type="text"]').forEach(input => { input.value = 'إجابة'; });
    });
    submit(window, 'questionsForm'); await flush();
    assert.equal(submitted.department_slug, 'dept-ai');
    assert.equal(submitted.answers.length, 4);
    await window.happyDOM.close();
});

test('registering for an event sends the typed phone and confirms only after saving', async () => {
    let call, fail = true;
    const event = { id: 'e1', title: 'ورشة', description: 'تفاصيل', image: '', date: '2099-01-01', time: '12:00:00', location: 'الرياض', published: true, participants: 0, capacity: null };
    const window = await page('events.html', { listEvents: async () => [event], registeredEventIds: async () => [], getUser: async () => ({ id: 'u1' }),
        registerForEvent: async (id, phone) => { call = [id, phone]; if (fail) throw new Error('رقم الجوال غير صحيح'); } });
    const card = window.document.querySelector('.event-card');
    card.querySelector('.btn-register').click(); await flush();
    const form = card.querySelector('.event-phone');
    form.querySelector('[name="phone"]').value = '0551234567';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush();
    assert.deepEqual(call, ['e1', '0551234567']);
    assert.match(card.querySelector('.form-message').textContent, /رقم الجوال/);
    assert.notEqual(card.querySelector('.btn-register').textContent, 'تم التسجيل ✓');
    fail = false;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush();
    assert.equal(card.querySelector('.btn-register').textContent, 'تم التسجيل ✓');
    assert.equal(card.querySelector('.event-phone'), null);
    await window.happyDOM.close();
});
