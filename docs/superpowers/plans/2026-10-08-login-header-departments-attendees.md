# Login Header, Managed Departments and Attendee Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Headers reflect the signed-in session; admins add/edit/hide departments that every page renders; event registration collects a phone and admins get a downloadable attendee sheet.

**Architecture:** Migration `0003` extends `departments`, adds `event_registrations.phone`, replaces `register_for_event` and hardens signup. A new `departments.js` renders departments on the four public pages from one memoised `ErtwaUI.content()` call, keeping static markup as fallback. `main.js` gains the header and phone flow; the dashboard gains department management (`admin-content.js`) and the attendee panel/CSV (`admin.js`).

**Tech Stack:** Static HTML/CSS/JS, Supabase JS 2.117.3, PostgreSQL RLS, Node test runner + PGlite + happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-08-login-header-departments-attendees-design.md`

## Global Constraints

- No new npm dependencies; IIFE + `'use strict'`; database text rendered only via `textContent` (`ErtwaUI.node`/`fill`).
- Visible copy is Arabic and exactly as quoted in the spec or this plan.
- SQL functions: `security definer`, `set search_path = ''`; errcodes `42501` / `22023` / `P0001`.
- Migration file `supabase/migrations/202610080003_departments_attendees.sql`, `begin; … commit;`, additive except replacing `register_for_event`.
- Phone rule after normalisation: `^\+?[0-9]{8,15}$`; normalisation removes spaces, dashes and parentheses and maps Arabic-Indic (U+0660–0669) and Persian (U+06F0–06F9) digits to ASCII.
- Icon rule `^fa-[a-z0-9-]{1,40}$`; dashboard icon list: `fa-code, fa-palette, fa-calendar-days, fa-chart-line, fa-camera-retro, fa-pen-nib, fa-bullhorn, fa-users, fa-handshake, fa-laptop-code, fa-graduation-cap, fa-lightbulb, fa-microphone, fa-gamepad, fa-shield-halved, fa-layer-group`.
- Department anchors are `<slug>-dept` everywhere.
- Node: `NODE_BIN=/private/tmp/claude-501/-Users-yazed-almutrif-Desktop-ertwa-platform-main/57d9ad29-1599-4c2a-9a85-28994c08ca74/scratchpad/node/bin`; run tests as `PATH="$NODE_BIN:$PATH" perl -e 'alarm 120; exec @ARGV' npm test`.
- Commit with `git -c user.name="yazedalmutrif" -c user.email="263026056+yazedalmutrif@users.noreply.github.com" commit`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Phone typed with Arabic-Indic digits, spaces or dashes (`٠٥٥ ١٢٣-٤٥٦٧`): accepted and stored as `0551234567` — test in Task 2.
- A department hidden while someone is mid-signup: Supabase Auth returns `Database error saving new user`; the visitor must see an Arabic message saying the committee is no longer available, not the generic network message — test in Task 2.
- Department name/text containing HTML (`<img onerror>`): text on all four pages — test in Task 4.
- A link to a hidden or unknown department (`#old-dept`): the departments page shows every section, never a blank page — test in Task 4.
- Attendee names with commas, quotes, newlines or a leading `=`: CSV cells stay intact and inert — test in Task 7.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/202610080003_departments_attendees.sql`
- Modify: `tests/database.test.mjs` (load three migrations; existing `register_for_event($1)` calls become `($1, '0551234567')`; new tests at the end)

**Interfaces:**
- Produces: `departments.{page_title, details, tasks, icon, image, active}`, `slug` default `'dept-' || substr(md5(random()::text), 1, 8)`; no browser `delete` on `departments`; `event_registrations.phone`; `public.register_for_event(p_event_id uuid, p_phone text) returns uuid` (one-argument version dropped); signup rejects hidden/missing departments with `P0001` `'اللجنة غير متاحة'`.

- [ ] **Step 1: Write the failing tests**

```js
test('event registration requires a valid phone and keeps the latest one', async () => {
    const id = '20000000-0000-4000-8000-000000000010';
    await db.query(`insert into public.events(id, title, description, date, time, location) values ($1, 'لقاء', 'اختبار', current_date + 3, '10:00', 'أونلاين')`, [id]);
    await as('authenticated', member, async () => {
        await rejects(db.query("select public.register_for_event($1, '12ab')", [id]), '22023');
        await rejects(db.query('select public.register_for_event($1, null)', [id]), '22023');
        const first = (await db.query("select public.register_for_event($1, '0551234567') as id", [id])).rows[0].id;
        const again = (await db.query("select public.register_for_event($1, '+966551234567') as id", [id])).rows[0].id;
        assert.equal(again, first);
        assert.equal((await db.query('select phone from public.event_registrations where id = $1', [first])).rows[0].phone, '+966551234567');
    });
    await as('authenticated', other, () => db.query("select public.register_for_event($1, '0500000000')", [id]));
    await as('authenticated', member, async () => assert.equal((await db.query('select * from public.event_registrations where event_id = $1', [id])).rows.length, 1));
    await as('authenticated', admin, async () => {
        const rows = (await db.query(`select r.phone, p.email from public.event_registrations r join public.profiles p on p.id = r.user_id where r.event_id = $1 order by p.email`, [id])).rows;
        assert.deepEqual(rows.map(row => row.phone), ['+966551234567', '0500000000']); // admin-in-name@… (member), member2@… (other)
    });
});

test('admins add and hide departments; nobody deletes them; signup needs an active one', async () => {
    let slug;
    await as('authenticated', admin, async () => {
        slug = (await db.query("insert into public.departments(name, display_name, description, icon, sort_order) values ('الذكاء الاصطناعي', 'لجنة الذكاء الاصطناعي', 'وصف', 'fa-lightbulb', 7) returning slug")).rows[0].slug;
        assert.match(slug, /^dept-[0-9a-f]{8}$/);
        await rejects(db.query("update public.departments set icon = 'bad icon' where slug = $1", [slug]), '23514');
        await rejects(db.query('delete from public.departments where slug = $1', [slug]), '42501');
    });
    await as('authenticated', other, async () => {
        await rejects(db.query("insert into public.departments(name, display_name) values ('x', 'x')"), '42501');
        assert.equal((await db.query('update public.departments set active = false where slug = $1', [slug])).affectedRows, 0);
    });
    await signup('10000000-0000-4000-8000-000000000020', 'new-dept@example.com', { department_slug: slug });
    await as('authenticated', admin, () => db.query('update public.departments set active = false where slug = $1', [slug]));
    await assert.rejects(signup('10000000-0000-4000-8000-000000000021', 'hidden@example.com', { department_slug: slug }), /اللجنة غير متاحة/);
    const seeded = (await db.query("select page_title, icon, image, tasks from public.departments where slug = 'media'")).rows[0];
    assert.equal(seeded.page_title, 'قسم الإعلام والإنتاج المرئي (Media Department)');
    assert.equal(seeded.icon, 'fa-camera-retro');
    assert.equal(seeded.image, 'images/Overlay(4).svg');
    assert.equal(seeded.tasks.split('\n').length, 3);
});
```

- [ ] **Step 2: Run to verify failure** — `PATH="$NODE_BIN:$PATH" node --test tests/database.test.mjs` → FAIL (`ENOENT` for the new migration).

- [ ] **Step 3: Write the migration**

Seed per slug from `departments.html` (`page_title` = section `<h3>`, `details` = section `<p>`, `tasks` = its three `<li>` texts joined by `\n`, `icon` = its `fa-…` class) and homepage images: tech `Overlay(6)`, design `Overlay(1)`, events `Overlay(2)`, quality `Overlay(3)`, media `Overlay(4)`, content `Overlay(5)` (as `images/Overlay(n).svg`). `image` check: `image = '' or image ~ '^images/[A-Za-z0-9() ._-]{1,100}$'`. `revoke delete on public.departments from authenticated`. `create or replace function private.handle_new_user()` keeps today's body and first raises `P0001` when `department_slug` is given and no active department has it. Drop `public.register_for_event(uuid)`; the new function keeps today's checks (lock, published, past, capacity, idempotent) and validates `p_phone` against the global rule (`22023` `'رقم الجوال غير صحيح'`), updating `phone` on an existing registration. Revoke from public/anon, grant execute to authenticated.

- [ ] **Step 4: Run tests** — full suite → PASS.

- [ ] **Step 5: Commit** — migration + `tests/database.test.mjs`, message `Add departments and attendee phone migration`.

---

### Task 2: API

**Files:**
- Modify: `api.js`, `tests/api.test.mjs`

**Interfaces:**
- Consumes: Task 1.
- Produces: `registerForEvent(eventId, phone) → Promise<uuid>`; `normalizePhone(value) → string` (exported, throws `'يرجى إدخال رقم جوال صحيح.'`); `eventRegistrations(eventId) → Promise<Array<{ created_at, phone, profiles: { full_name, email } }>>` (admin, ordered by `created_at`); `addDepartment({ name, display_name, description, icon }) → Promise<{ slug }>` (admin; `sort_order` = current max + 1); `setDepartmentActive(slug, active) → Promise`; `saveDepartment(slug, fields)` now sends only the keys present among `name, display_name, page_title, description, details, tasks, icon, leader, deputy, leader_title, deputy_title`; `signUp` accepts any slug matching `^[a-z0-9-]{1,40}$`; `errorMessage` maps a signup failure whose message contains `Database error saving new user` to `'تعذر إنشاء الحساب: قد تكون اللجنة المختارة لم تعد متاحة. حدّث الصفحة واختر لجنة أخرى.'`.

- [ ] **Step 1: Write the failing tests** (append to `tests/api.test.mjs`)

```js
test('phones are normalised, including Arabic digits, and invalid ones are refused', async () => {
    const { api, rpcs } = await load({}, { role: 'member' });
    assert.equal(api.normalizePhone('٠٥٥ ١٢٣-٤٥٦٧'), '0551234567');
    assert.equal(api.normalizePhone('+966 (55) 123 4567'), '+966551234567');
    assert.throws(() => api.normalizePhone('12ab'), /رقم جوال صحيح/);
    await api.registerForEvent('e1', '۰۵۰ ۰۰۰ ۰۰۰۰');
    assert.deepEqual(rpcs.at(-1), ['register_for_event', { p_event_id: 'e1', p_phone: '0500000000' }]);
});

test('department changes are admin-only and send only the given fields', async () => {
    const member = await load({}, { role: 'member' });
    await assert.rejects(member.api.addDepartment({ name: 'x', display_name: 'x', description: '', icon: 'fa-code' }), /صلاحيات الإدارة/);
    const { api, writes } = await load({}, { role: 'admin' });
    await api.setDepartmentActive('tech', false);
    assert.deepEqual(writes.at(-1), { table: 'departments', op: 'update', values: { active: false }, eq: ['slug', 'tech'] });
    await api.saveDepartment('tech', { name: ' التقنية ', tasks: 'أ\nب' });
    assert.deepEqual(writes.at(-1).values, { name: 'التقنية', tasks: 'أ\nب' });
    await assert.rejects(api.saveDepartment('tech', { icon: 'bad icon' }), /الأيقونة/);
    await assert.rejects(api.addDepartment({ name: '', display_name: 'x', description: '', icon: 'fa-code' }));
});

test('a signup refused by the database explains the committee may be gone', async () => {
    const { api } = await load({});
    assert.match(api.errorMessage({ message: 'Database error saving new user', status: 500 }), /اللجنة المختارة لم تعد متاحة/);
});
```

The fake client in `load()` gains: `order()`/`limit()` passthrough, and `departments` select returning `[{ sort_order: 6 }]` so `addDepartment` can compute 7 (assert `writes.at(-1).values.sort_order === 7` in an extra line of the second test).

- [ ] **Step 2: Run to verify failure** — `PATH="$NODE_BIN:$PATH" node --test tests/api.test.mjs` → FAIL (`normalizePhone` not a function).
- [ ] **Step 3: Implement** — icon error `'يرجى اختيار الأيقونة.'`; text limits from the spec; `tasks` ≤ 2000 kept as typed (trimmed per line, empty lines removed).
- [ ] **Step 4: Run tests** — full suite → PASS.
- [ ] **Step 5: Commit** — `api.js tests/api.test.mjs`, message `Add department, attendee and phone API`.

---

### Task 3: Header session state and login redirect

**Files:**
- Modify: `main.js`, `departments.html` (script tags as on `structure.html`), `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: existing `getUser`, `signOut`.
- Produces: `setupHeader()` replacing `.main-header .btn-login` with `<a class="btn-login" href="dashboard.html">لوحة التحكم</a>` and `<button class="btn-login btn-logout" type="button">تسجيل الخروج</button>`; skipped on pages with `#logout-button`. `login.html` with a session → `window.location.replace('dashboard.html')`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

Existing page tests that do not mock `getUser` must keep passing: `setupHeader` treats a missing or throwing `getUser` as signed out.

- [ ] **Step 2: Run to verify failure** → FAIL (no `a.btn-login`).
- [ ] **Step 3: Implement** in `main.js`, add scripts to `departments.html`.
- [ ] **Step 4: Run tests** — full suite → PASS.
- [ ] **Step 5: Commit** — `main.js departments.html tests/frontend.test.mjs`, message `Show signed-in state in every header`.

---

### Task 4: Public pages render departments from the database

**Files:**
- Create: `departments.js` (`window.ErtwaDepartments = { render }`, self-starts on `DOMContentLoaded`)
- Modify: `main.js` (`ErtwaUI` gains `fill` and `content()` — memoised `api.siteContent()` per page, cleared on failure; `loadHomeContent` keeps hero/stats only; `loadStructure` keeps platform names/titles only; registration reads `#committeeQuestionTitle.dataset.slug`), `script.js` (questions keyed by slug + `standard` set; card clicks delegated on `.committees-grid`; `goToQuestions(slug, name)`; hash filter removed), `index.html` (`#followup-dept` → `#quality-dept`), `departments.html` (sections get `data-dept`, `followup-dept` → `quality-dept`), `register.html` (cards get `data-slug`), `style.css` (`.spec-icon-box i, .committee-card__icon i` icon fallback), `scripts/build-site.mjs` (asset `departments.js`), `index.html`/`departments.html`/`structure.html`/`register.html` (`<script src="departments.js">` after `main.js`), `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `ErtwaUI.content()` → `{ settings, departments, stats }`; departments with `active`, `sort_order`, `image`, `icon`, `name`, `display_name`, `page_title`, `description`, `details`, `tasks`, leaders/titles.
- Produces: rendered containers `.specialized-grid` (`.spec-card[data-dept]`), `.departments-page-container .container` sections (`.info-card[data-dept][id="<slug>-dept"]`), `#departments-list` (`.dept-card-box[data-dept]`), `.committees-grid` (`.committee-card[data-slug]`).

- [ ] **Step 1: Write the failing tests** — a helper `departmentsFixture()` returns `[tech (active, image 'images/Overlay(6).svg'), { slug: 'dept-ai', name: '<img src=x onerror=1>', display_name: 'لجنة الذكاء', page_title: 'قسم الذكاء', description: 'وصف', details: 'تفاصيل', tasks: 'مهمة ١\nمهمة ٢', icon: 'fa-lightbulb', image: '', active: true, sort_order: 7, leader: '', deputy: 'نائب', leader_title: 'قائد القسم', deputy_title: 'نائب القسم' }, { slug: 'media', active: false, … }]`.

```js
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
```

Update existing tests: the homepage test adds `scripts: ['departments.js']` and its department fixture fields; the structure test adds `scripts: ['departments.js']`; the registration test sets `committeeQuestionTitle.dataset.slug = 'tech'`.

- [ ] **Step 2: Run to verify failure** → FAIL (`departments.js` missing).
- [ ] **Step 3: Implement.** Standard questions (exact): radio `ما مستوى خبرتك في مجال هذه اللجنة؟` options `مبتدئ`, `متوسط`, `متقدم` (required); textarea `ما المهارات التي تمتلكها وتفيد هذه اللجنة؟` (required); textarea `لماذا ترغب بالانضمام إلى هذه اللجنة؟` (required); text `أرفق رابطاً لأعمال سابقة إن وجد.` (optional). The six existing sets keep their text, keyed `tech, design, events, quality, media, content`.
- [ ] **Step 4: Run tests and build** — full suite → PASS; `npm run build && ls _site/departments.js`.
- [ ] **Step 5: Commit** — all files above, message `Render departments from the database on every page`.

---

### Task 5: Event registration asks for a phone

**Files:**
- Modify: `main.js` (`loadEvents`), `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `registerForEvent(eventId, phone)`.
- Produces: in a card, `.event-phone` form with `<input type="tel" name="phone" maxlength="20" placeholder="05xxxxxxxx">`, submit «تأكيد التسجيل», button «إلغاء».

- [ ] **Step 1: Write the failing test / update the existing event test**

```js
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
```

The existing "failed registration never displays success" test is changed to go through the phone form.

- [ ] **Step 2: Run to verify failure** → FAIL (no `.event-phone`).
- [ ] **Step 3: Implement** — signed-out click still goes to `login.html`; «إلغاء» removes the form.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `main.js tests/frontend.test.mjs`, message `Ask for a phone number when registering for an event`.

---

### Task 6: Dashboard department management

**Files:**
- Modify: `admin-content.js`, `dashboard.html` (after `#admin-structure-list`: `<form id="add-department-form">` with name, structure title, short description, icon select, submit «إضافة القسم»; `<div id="admin-hidden-departments">`), `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `siteContent`, `saveDepartment`, `addDepartment`, `setDepartmentActive`.
- Produces: department rows `form[data-row="<slug>"]` with named fields `name, display_name, page_title, description, details, tasks, icon, leader, leader_title, deputy, deputy_title`, a «حذف القسم» button (`.danger`); hidden list rows `[data-hidden="<slug>"]` with «إظهار».

- [ ] **Step 1: Write the failing tests**

```js
test('admins add, hide and restore departments from the dashboard', async () => {
    const calls = [];
    const window = await adminPage({ siteContent: async () => ({ ...content(), departments: departmentsFixture() }),
        addDepartment: async input => { calls.push(['add', { ...input }]); return { slug: 'dept-new' }; },
        setDepartmentActive: async (slug, active) => calls.push(['active', slug, active]) });
    window.confirm = () => true;
    const add = window.document.getElementById('add-department-form');
    add.querySelector('[name="name"]').value = 'الأمن السيبراني';
    add.querySelector('[name="display_name"]').value = 'لجنة الأمن';
    add.querySelector('[name="icon"]').value = 'fa-shield-halved';
    add.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush();
    assert.deepEqual(calls[0], ['add', { name: 'الأمن السيبراني', display_name: 'لجنة الأمن', description: '', icon: 'fa-shield-halved' }]);
    window.document.querySelector('[data-row="dept-ai"] .danger').click(); await flush();
    assert.deepEqual(calls.at(-1), ['active', 'dept-ai', false]);
    [...window.document.querySelectorAll('[data-hidden="media"] button')].find(b => b.textContent === 'إظهار').click(); await flush();
    assert.deepEqual(calls.at(-1), ['active', 'media', true]);
    await window.happyDOM.close();
});
```

Update the existing "admins save a department leader" test: the saved object now contains every row field (`name, display_name, page_title, description, details, tasks, icon, leader, leader_title, deputy, deputy_title`) with the fixture's values and the edited leader/title.

- [ ] **Step 2: Run to verify failure** → FAIL (no `add-department-form`).
- [ ] **Step 3: Implement** — after any add/hide/restore, re-render from a fresh `api.siteContent()`; success messages «تمت إضافة القسم.», «تم الحفظ.»; hide confirm `هل تريد حذف قسم <name>؟ سيختفي من الموقع وتبقى طلبات الانضمام السابقة.`.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `admin-content.js dashboard.html tests/frontend.test.mjs`, message `Let admins add, edit and hide departments`.

---

### Task 7: Dashboard attendee sheet

**Files:**
- Modify: `admin.js`, `dashboard.html` (`<div id="admin-attendees" hidden>` after the events table), `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `eventRegistrations(eventId)`.
- Produces: `window.ErtwaAdmin.attendeesCsv(rows) → string`; event rows gain «المسجلون»; the panel shows heading `المسجلون في: <title> (<count>)`, table `#admin-attendees-list`, button «تحميل Excel» that downloads `attendees-<event.date>.csv` (Blob `text/csv;charset=utf-8`).

- [ ] **Step 1: Write the failing tests**

```js
test('admins see an event attendee sheet with phones', async () => {
    const event = { id: 'e1', title: 'ورشة', description: 'x', date: '2099-05-01', time: '18:30:00', location: 'x', image: '', capacity: null, published: true, participants: 2 };
    const rows = [{ created_at: '2099-04-01T10:00:00Z', phone: '0551234567', profiles: { full_name: 'سارة', email: 's@x.co' } },
        { created_at: '2099-04-02T10:00:00Z', phone: null, profiles: { full_name: 'خالد', email: 'k@x.co' } }];
    const window = await adminPage({ events: [event], eventRegistrations: async id => (id === 'e1' ? rows : []) });
    [...window.document.querySelectorAll('#admin-events-list button')].find(b => b.textContent === 'المسجلون').click(); await flush();
    const cells = [...window.document.querySelectorAll('#admin-attendees-list tr')].map(tr => [...tr.children].map(td => td.textContent));
    assert.deepEqual(cells.map(row => row.slice(0, 3)), [['سارة', 's@x.co', '0551234567'], ['خالد', 'k@x.co', '—']]);
    assert.equal(window.document.getElementById('admin-attendees').hidden, false);
    await window.happyDOM.close();
});

test('the attendee CSV opens in Excel with Arabic, leading zeros and inert formulas', async () => {
    const window = await adminPage({});
    const csv = window.ErtwaAdmin.attendeesCsv([{ created_at: '2099-04-01T10:00:00Z', phone: '0551234567', profiles: { full_name: '=HYPERLINK("x")', email: 'a,b@x.co' } }]);
    assert.ok(csv.startsWith('﻿الاسم,البريد,الجوال,وقت التسجيل\r\n'));
    assert.match(csv, /"'=HYPERLINK\(""x""\)","a,b@x\.co","=""0551234567""",/);
    await window.happyDOM.close();
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (no «المسجلون» button).
- [ ] **Step 3: Implement** — every CSV cell is quoted with `"` doubled; time written as local `YYYY-MM-DD HH:MM`; download via `URL.createObjectURL` + temporary `<a download>`.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `admin.js dashboard.html tests/frontend.test.mjs`, message `Add the event attendee sheet and Excel download`.

---

### Task 8: Docs and rollout

**Files:**
- Modify: `SUPABASE_SETUP.md` (third SQL file; departments and attendee sheet; phone at registration), `README.md` (features, `departments.js` row)

- [ ] **Step 1:** Update the docs; run the full suite and `npm run build` → PASS; commit `Document departments and attendee sheet`.
- [ ] **Step 2:** Copy `202610080003_departments_attendees.sql` with `pbcopy`, `open` the SQL Editor, wait for the owner's confirmation.
- [ ] **Step 3: Verify** — REST `departments?select=slug,active,icon` returns six active rows with icons; anon `rpc/register_for_event` → `42501`.
- [ ] **Step 4:** Merge to `main`, push with the session `gh` credential helper, `gh run watch` → success; live `departments.html` contains `departments.js`.
