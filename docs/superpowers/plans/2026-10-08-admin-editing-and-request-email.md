# Admin Editing Tools and Request Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit events, team leaders, homepage content and admin roles from `dashboard.html`, and email every service request to the owner.

**Architecture:** One additive SQL migration adds content columns, a `home_stats` table, a capacity trigger and a `set_member_role` RPC. `api.js` gains typed read/write helpers and a fire-and-forget FormSubmit call. Public pages fill from the database with their HTML text as fallback; the dashboard gets event editing and member roles in `admin.js` and content editing in a new `admin-content.js`.

**Tech Stack:** Static HTML/CSS/JS, Supabase JS 2.117.3 (CDN), PostgreSQL RLS, Node test runner with PGlite and happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-editing-and-request-email-design.md`

## Global Constraints

- No new npm dependencies; browser code stays IIFE + `'use strict'`, renders database values with `textContent` only (via `ErtwaUI.node`).
- All visible copy is Arabic and exactly as quoted in this plan or the spec.
- Database functions: `security definer`, `set search_path = ''`, admin check via `private.is_admin()`; errcodes `42501` (not allowed), `22023` (bad argument), `P0001` (Arabic message shown to the user).
- Migration file: `supabase/migrations/202610080002_admin_content.sql`, wrapped in `begin; … commit;`, additive only.
- Notification config key: `requestNotificationEmail: 'yazedksa23@gmail.com'` in `supabase-config.js`; endpoint `https://formsubmit.co/ajax/<address>`.
- Length limits: names 150, department description 500, hero/mission/vision 1000, stat value 1–20, stat label 1–100, stat caption 200. Inputs carry matching `maxlength`.
- Titles allowed: platform `قائد المنصة|قائدة المنصة`, `نائب القائد|نائبة القائد`; department `قائد القسم|قائدة القسم`, `نائب القسم|نائبة القسم`.
- Node: `NODE_BIN=/private/tmp/claude-501/-Users-yazed-almutrif-Desktop-ertwa-platform-main/57d9ad29-1599-4c2a-9a85-28994c08ca74/scratchpad/node/bin`; every test command is prefixed `PATH="$NODE_BIN:$PATH"`.
- Commit with `git -c user.name="yazedalmutrif" -c user.email="263026056+yazedalmutrif@users.noreply.github.com" commit`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Editing an event whose image is the default relative path `images/web-dev-event.png`: the `type="url"` field must show empty, and saving must keep the default — test in Task 4.
- A stat value with no digits (e.g. `قريباً`): the counter must show it unchanged instead of animating `NaN` forever — test in Task 3.
- HTML typed into homepage content (`<img onerror>`): must render as text — test in Task 3.
- Text longer than a database limit: the dashboard must show the Arabic error and keep what was typed — test in Task 5.
- A leader name cleared to empty (vacant post): saves, and the structure page shows `غير محدد` — test in Task 3 (render) and Task 2 (allowed by API).

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/202610080002_admin_content.sql`
- Modify: `tests/database.test.mjs` (load both migrations in `before`; table count 8 → 9; new tests at the end of the file)

**Interfaces:**
- Produces: `platform_settings.{hero_text, mission_text, vision_text, leader_title, deputy_title}`; `departments.{description, leader_title, deputy_title}`; table `public.home_stats(slug text pk, value text, label text, caption text, sort_order int)`; `public.set_member_role(p_user_id uuid, p_role text) returns void`; trigger on `public.events` rejecting capacity below registration count with `P0001` `'عدد المقاعد أقل من عدد المسجلين'`.

- [ ] **Step 1: Put Node 24 in the temp folder**

Download the latest Node 24 `darwin-arm64.tar.gz` and `SHASUMS256.txt` from `https://nodejs.org/dist/latest-v24.x/`, verify with `shasum -a 256 -c`, extract so that `$NODE_BIN/node` and `$NODE_BIN/npm` exist.
Run: `PATH="$NODE_BIN:$PATH" npm test`
Expected: all existing tests PASS (baseline).

- [ ] **Step 2: Write the failing tests** (append to `tests/database.test.mjs`; `before` also execs the new migration right after the init one)

```js
test('homepage content is public to read and seeded from the current site', async () => {
    await as('anon', null, async () => {
        const stats = (await db.query('select slug, value, label from public.home_stats order by sort_order')).rows;
        assert.deepEqual(stats.map(row => row.slug), ['volunteer_hours', 'followers', 'partnerships', 'training_hours', 'events', 'members']);
        assert.deepEqual(stats[1], { slug: 'followers', value: '10K+', label: 'متابع' });
        const settings = (await db.query('select hero_text, leader_title, deputy_title from public.platform_settings')).rows[0];
        assert.match(settings.hero_text, /معهد طاقات/);
        assert.equal(settings.leader_title, 'قائد المنصة');
        assert.deepEqual((await db.query("select description, leader_title, deputy_title from public.departments where slug = 'design'")).rows[0],
            { description: 'إنشاء هويات بصرية مبتكرة وتصاميم جذابة للمشاريع.', leader_title: 'قائدة القسم', deputy_title: 'نائبة القسم' });
        await rejects(db.query("insert into public.home_stats(slug, value, label) values ('x', '1', 'x')"), '42501');
    });
});

test('only admins edit homepage content, within the limits', async () => {
    await as('authenticated', other, async () => {
        assert.equal((await db.query("update public.home_stats set value = '1' where slug = 'members'")).affectedRows, 0);
        assert.equal((await db.query("update public.departments set leader = 'x' where slug = 'tech'")).affectedRows, 0);
        await rejects(db.query("delete from public.home_stats where slug = 'members'"), '42501');
    });
    await as('authenticated', admin, async () => {
        assert.equal((await db.query("update public.home_stats set value = '60+' where slug = 'members'")).affectedRows, 1);
        await rejects(db.query("update public.home_stats set value = '' where slug = 'members'"), '23514');
        await rejects(db.query("update public.departments set leader_title = 'مدير' where slug = 'tech'"), '23514');
        await rejects(db.query("update public.platform_settings set hero_text = repeat('x', 1001)"), '23514');
        assert.equal((await db.query("update public.departments set leader = '', leader_title = 'قائد القسم' where slug = 'tech'")).affectedRows, 1);
    });
});

test('only admins change roles, and never their own', async () => {
    await as('authenticated', other, () => rejects(db.query("select public.set_member_role($1, 'admin')", [other]), '42501'));
    await as('authenticated', admin, async () => {
        await db.query("select public.set_member_role($1, 'admin')", [other]);
        await rejects(db.query("select public.set_member_role($1, 'owner')", [other]), '22023');
        await rejects(db.query("select public.set_member_role($1, 'member')", [admin]), 'P0001');
        await rejects(db.query("select public.set_member_role($1, 'member')", ['10000000-0000-4000-8000-0000000000ff']), 'P0001');
    });
    const role = () => db.query('select role, membership_status from public.profiles where id = $1', [other]).then(r => r.rows[0]);
    assert.deepEqual(await role(), { role: 'admin', membership_status: 'active' });
    await as('authenticated', admin, () => db.query("select public.set_member_role($1, 'member')", [other]));
    assert.deepEqual(await role(), { role: 'member', membership_status: 'active' });
});

test('event capacity cannot drop below existing registrations', async () => {
    const id = '20000000-0000-4000-8000-000000000009';
    await db.query(`insert into public.events(id, title, description, date, time, location)
        values ($1, 'لقاء', 'اختبار', current_date + 2, '10:00', 'أونلاين')`, [id]);
    for (const user of [member, other]) await as('authenticated', user, () => db.query('select public.register_for_event($1)', [id]));
    await as('authenticated', admin, async () => {
        await rejects(db.query('update public.events set capacity = 1 where id = $1', [id]), 'P0001');
        assert.equal((await db.query('update public.events set capacity = 2 where id = $1', [id])).affectedRows, 1);
        assert.equal((await db.query("update public.events set title = 'لقاء محدث' where id = $1", [id])).affectedRows, 1);
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `PATH="$NODE_BIN:$PATH" node --test tests/database.test.mjs`
Expected: FAIL — `ENOENT` for `202610080002_admin_content.sql`.

- [ ] **Step 4: Write the migration**

Seed values (exact copy): hero `منصة تقنية متخصصة تحت مظلة معهد طاقات المعتمد للتدريب، تهدف إلى تمكين الأفراد والشركات من خلال تقديم محتوى تقني متطور.`; mission `نؤمن أن المعرفة حق للجميع ورسالتنا هي أن نكون مصدراً دائماً وموثوقاً لإرواء شغف التقنية والمعرفة.`; vision `أن نكون المنصة الرائدة في إرواء المجتمع معرفياً وأن نصبح رمزاً للتوعية التقنية الشاملة.`. Department descriptions = the `<p>` of each homepage `.spec-card` (tech, design, events, quality, media, content in that order). Department titles = the `.dept-leader-tag` / `.dept-deputy-tag` text of each card in `structure.html`. Stats = the six `.stat-card`s in `index.html` (`stat-number` → value, `stat-label` → label, `stat-sub` → caption), slugs in the order listed in Interfaces, `sort_order` 1–6.

`home_stats`: enable RLS; policies `home_stats_read` (select, anon+authenticated, `true`) and `home_stats_admin` (update, authenticated, `private.is_admin()` in using and with check); `revoke all … from public, anon, authenticated` before granting `select` to anon/authenticated and `update(value, label, caption)` to authenticated, `all` to service_role (the test harness grants everything by default, as some projects do).

`set_member_role`: checks in this order — admin (`42501` `'صلاحيات الإدارة مطلوبة'`), role (`22023` `'الصلاحية غير صحيحة'`), self (`P0001` `'لا يمكنك تغيير صلاحياتك'`), update not found (`P0001` `'العضو غير موجود'`). Promoting sets `membership_status = 'active'`. Revoke execute from public/anon, grant to authenticated.

Capacity trigger: `private.check_event_capacity()` `before update of capacity on public.events`, only when `new.capacity is not null`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `PATH="$NODE_BIN:$PATH" npm test`
Expected: PASS, including the table count of 9.

- [ ] **Step 6: Commit** — `git add supabase/migrations/202610080002_admin_content.sql tests/database.test.mjs`, message `Add admin content migration`.

---

### Task 2: API helpers and request email

**Files:**
- Modify: `api.js`, `supabase-config.js`
- Create: `tests/api.test.mjs` (runs `api.js` in a `vm` context with a fake Supabase client and a fake `fetch`, like the first test in `tests/frontend.test.mjs`)

**Interfaces:**
- Consumes: Task 1 columns/table/RPC.
- Produces on `window.ErtwaAPI`:
  - `updateEvent(id, input) → Promise<row>`; `input` is the same shape `addEvent` takes (`title, description, date 'YYYY-MM-DD', time 'HH:MM', location, image ('' → default), capacity ('' → null)`). Both use one `eventFields(input)` helper.
  - `setEventPublished(id, published: boolean) → Promise<{id}>`
  - `siteContent() → Promise<{ settings, departments, stats }>` (settings row `*`; departments and stats ordered by `sort_order`)
  - `saveSettings(fields) → Promise` — sends only keys present among `leader_name, deputy_name, leader_title, deputy_title, hero_text, mission_text, vision_text`
  - `saveDepartment(slug, { leader, deputy, leader_title, deputy_title, description }) → Promise`
  - `saveStat(slug, { value, label, caption }) → Promise`
  - `listMembers() → Promise<Array<{ id, full_name, email, role, membership_status }>>` newest first
  - `setMemberRole(userId, role: 'member'|'admin') → Promise`
  - `structureData` stays until Task 3 removes it.

- [ ] **Step 1: Write the failing tests** in `tests/api.test.mjs`

```js
test('a saved service request is emailed to the configured address', async () => {
    const { api, fetches } = await load({ requestNotificationEmail: 'yazedksa23@gmail.com' });
    await api.submitServiceRequest(request({ service_type: 'games', client_name: ' عميل ' }));
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].url, 'https://formsubmit.co/ajax/yazedksa23@gmail.com');
    assert.equal(fetches[0].options.keepalive, true);
    const body = JSON.parse(fetches[0].options.body);
    assert.equal(body._subject, 'طلب جديد: تطوير الألعاب — عميل');
    assert.equal(body.email, 'client@example.com');
    assert.equal(body._template, 'table');
});
test('no email is sent when saving fails, and email failures never fail a saved request', async () => {
    const failing = await load({ requestNotificationEmail: 'a@b.co' }, { insertError: { code: '42501' } });
    await assert.rejects(failing.api.submitServiceRequest(request()));
    assert.equal(failing.fetches.length, 0);
    const offline = await load({ requestNotificationEmail: 'a@b.co' }, { fetchRejects: true });
    await offline.api.submitServiceRequest(request());
    const unset = await load({});
    await unset.api.submitServiceRequest(request());
    assert.equal(unset.fetches.length, 0);
});
test('content saves are trimmed, allow vacant names, and reject unknown titles', async () => {
    const { api, writes } = await load({}, { role: 'admin' });
    await api.saveDepartment('tech', { leader: '  ', deputy: ' سامي ', leader_title: 'قائد القسم', deputy_title: 'نائب القسم', description: 'وصف' });
    assert.deepEqual(writes.at(-1), { table: 'departments', op: 'update', values: { leader: '', deputy: 'سامي', leader_title: 'قائد القسم', deputy_title: 'نائب القسم', description: 'وصف' }, eq: ['slug', 'tech'] });
    await assert.rejects(api.saveDepartment('tech', { leader: '', deputy: '', leader_title: 'مدير', deputy_title: 'نائب القسم', description: '' }), /المسمى/);
    await api.saveSettings({ hero_text: ' نص ' });
    assert.deepEqual(writes.at(-1).values, { hero_text: 'نص' });
    await assert.rejects(api.saveStat('members', { value: '', label: 'عضو', caption: '' }));
});
test('role changes and event edits require an admin', async () => {
    const member = await load({}, { role: 'member' });
    await assert.rejects(member.api.setMemberRole('u2', 'admin'), /صلاحيات الإدارة/);
    await assert.rejects(member.api.updateEvent('e1', eventInput()), /صلاحيات الإدارة/);
    const admin = await load({}, { role: 'admin' });
    await admin.api.setMemberRole('u2', 'admin');
    assert.deepEqual(admin.rpcs.at(-1), ['set_member_role', { p_user_id: 'u2', p_role: 'admin' }]);
    await admin.api.updateEvent('e1', eventInput({ image: '', capacity: '' }));
    assert.deepEqual(admin.writes.at(-1).eq, ['id', 'e1']);
    assert.equal(admin.writes.at(-1).values.image, 'images/web-dev-event.png');
    assert.equal(admin.writes.at(-1).values.capacity, null);
});
```

`load(config, options)` builds the vm context: `window.ERTWA_CONFIG = { supabaseUrl: 'https://x.supabase.co', supabasePublishableKey: 'sb_publishable_x', ...config }`, a fake `window.supabase.createClient` whose `from(table)` builder records `{ table, op, values, eq }` into `writes`, whose `rpc` records into `rpcs`, whose session/user is `{ id: 'u1' }` and whose `profiles` single returns `{ id: 'u1', role: options.role }`; `window.fetch` records into `fetches` (or rejects when `fetchRejects`). `request(overrides)` and `eventInput(overrides)` return valid inputs.

- [ ] **Step 2: Run to verify failure** — `PATH="$NODE_BIN:$PATH" node --test tests/api.test.mjs` → FAIL (`updateEvent`/`saveDepartment` not functions, no fetch).

- [ ] **Step 3: Implement in `api.js`**, and add `requestNotificationEmail: 'yazedksa23@gmail.com'` with a one-line comment to `supabase-config.js`.

Email body fields: `_subject`, `_template: 'table'`, `_captcha: 'false'`, `name`, `email`, `'نوع الخدمة'`, `'وصف المشروع'`, `'الميزانية'` (`<budget> ريال`), `'المدة'`. Service labels in api.js match `main.js` (`web: 'تطوير المواقع'`, `games: 'تطوير الألعاب'`, `branding: 'تصميم الهوية البصرية'`). The fetch is not awaited and its rejection is swallowed; a missing address skips it. Title validation error: `'يرجى اختيار المسمى.'`.

- [ ] **Step 4: Run tests** — `PATH="$NODE_BIN:$PATH" npm test` → PASS.

- [ ] **Step 5: Commit** — `api.js supabase-config.js tests/api.test.mjs`, message `Add content, role and request email API`.

---

### Task 3: Public pages read from the database

**Files:**
- Modify: `index.html`, `structure.html`, `main.js`, `script.js`, `api.js` (remove `structureData`), `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `siteContent()` from Task 2.
- Produces: markup hooks used by tests — `[data-content="hero_text|mission_text|vision_text"]`, `.spec-card[data-dept]` with its `<p>`, `.stat-card[data-stat]`, `.dept-card-box[data-dept]`, `[data-title="leader_title|deputy_title"]` spans inside the platform labels (icon kept outside the span).

- [ ] **Step 1: Write the failing tests** — extend `page(name, api, { scripts = [], setup } = {})`: after `document.write` it runs `setup(window)`, evals `main.js`, then each of `scripts` in order (they read `window.ErtwaUI`, which `main.js` defines), then dispatches `DOMContentLoaded`.

```js
test('homepage shows database content as text and keeps its own text when loading fails', async () => {
    const content = { settings: { hero_text: '<img src=x onerror=alert(1)>', mission_text: '', vision_text: 'رؤية جديدة' },
        departments: [{ slug: 'media', description: 'وصف الإعلام' }], stats: [{ slug: 'members', value: '60+', label: 'عضو', caption: '' }] };
    const ok = await page('index.html', { siteContent: async () => content, listEvents: async () => [], registeredEventIds: async () => [] });
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
        departments: [{ slug: 'tech', leader: '', deputy: 'سامي', leader_title: 'قائد القسم', deputy_title: 'نائب القسم' }], stats: [] }) });
    const tech = window.document.querySelector('[data-dept="tech"]');
    assert.equal(tech.querySelector('.dept-person-name').textContent, 'غير محدد');
    assert.equal(tech.querySelector('.dept-leader-tag').textContent, 'قائد القسم');
    assert.equal(window.document.querySelector('[data-title="leader_title"]').textContent, 'قائدة المنصة');
    assert.ok(window.document.querySelector('.leader-label i'));
    await window.happyDOM.close();
});
```

- [ ] **Step 2: Run to verify failure** — `PATH="$NODE_BIN:$PATH" node --test tests/frontend.test.mjs` → FAIL (no `data-content` elements).

- [ ] **Step 3: Implement**

- `index.html` / `structure.html`: add the hooks above; department slugs in card order `tech, design, events, quality, media, content`; stat slugs as in Task 1.
- `main.js`: `loadHomeContent()` runs when `[data-stat]` exists; writes only non-empty strings; sets `.stat-number` text and `dataset.final` together; any error leaves the HTML untouched. `loadStructure()` switches to `siteContent()` and `data-dept`, fills the four title elements, keeps `'غير محدد'` for empty names.
- `script.js` counter: skip stats whose text has no digits; on each tick, if `stat.dataset.final` exists and differs from the text the counter started with, stop and show `dataset.final`.
- `api.js`: remove `structureData` and its export.

- [ ] **Step 4: Run tests** — `PATH="$NODE_BIN:$PATH" npm test` → PASS.

- [ ] **Step 5: Commit** — the five source files plus the test file, message `Load homepage and structure content from the database`.

---

### Task 4: Dashboard — event editing and admin roles

**Files:**
- Modify: `dashboard.html`, `admin.js`, `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `updateEvent`, `setEventPublished`, `listMembers`, `setMemberRole`, existing `getProfile`, `adminData`, `addEvent`.
- Produces: DOM ids `event-form-title`, `event-submit`, `event-cancel` (hidden in add mode), `admin-members-list`; `window.ErtwaAdmin.initialize()` unchanged.

- [ ] **Step 1: Write the failing tests** — an `adminPage({ events, members, ...api })` helper opens `dashboard.html` with `scripts: ['admin.js']`, `getUser` → `{ id: 'self' }`, an admin `dashboardData`, `adminData` → `{ events, applications: [], requests: [], contributions: [] }`, `listMembers` → `members`, and `getProfile` → `{ id: 'self' }`.

```js
test('admins edit an existing event without re-entering it', async () => {
    const calls = [];
    const event = { id: 'e1', title: 'ورشة', description: 'تفاصيل', date: '2099-05-01', time: '18:30:00', location: 'الطائف', image: 'images/web-dev-event.png', capacity: 20, published: true, participants: 3 };
    const window = await adminPage({ events: [event], members: [],
        updateEvent: async (id, input) => calls.push(['update', id, input]), addEvent: async () => calls.push(['add']),
        setEventPublished: async (id, published) => calls.push(['publish', id, published]) });
    const row = window.document.querySelector('#admin-events-list tr');
    [...row.querySelectorAll('button')].find(b => b.textContent === 'تعديل').click(); await flush();
    const value = id => window.document.getElementById(id).value;
    assert.deepEqual([value('event-title'), value('event-time'), value('event-image'), value('event-capacity')], ['ورشة', '18:30', '', '20']);
    assert.equal(window.document.getElementById('event-form-title').textContent.trim(), 'تعديل الفعالية');
    window.document.getElementById('event-loc').value = 'أونلاين';
    submit(window, 'add-event-form'); await flush();
    assert.deepEqual(calls[0], ['update', 'e1', { title: 'ورشة', description: 'تفاصيل', date: '2099-05-01', time: '18:30', location: 'أونلاين', image: '', capacity: '20' }]);
    assert.equal(window.document.getElementById('event-submit').textContent.trim(), 'إضافة الفعالية للمنصة +');
    [...window.document.querySelectorAll('#admin-events-list button')].find(b => b.textContent === 'إخفاء').click(); await flush();
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
```

- [ ] **Step 2: Run to verify failure** — `PATH="$NODE_BIN:$PATH" node --test tests/frontend.test.mjs` → FAIL (no تعديل button).

- [ ] **Step 3: Implement**

`dashboard.html`: give the add-event heading id `event-form-title`, the submit button id `event-submit`, add a hidden `<button type="button" id="event-cancel" class="btn-secondary">إلغاء</button>`; add a «الأعضاء والمشرفين» section (`admin-section-subtitle dashboard-extra`, `table-scroll`, headers الاسم / البريد / الصلاحية / الحالة / الإجراءات, `<tbody id="admin-members-list">`).
`admin.js`: event rows show `— مخفية` after the date when unpublished, buttons تعديل / إخفاء or إظهار / حذف. Edit mode heading «تعديل الفعالية», submit «حفظ التعديلات», success «تم حفظ التعديلات.»; cancel and success restore add mode. Image field empty when the event image is `images/web-dev-event.png`. Members: role labels `admin: 'مشرف'`, `member: 'عضو'`, status via `statuses`; confirm texts `هل تريد منح صلاحيات الإشراف لـ <name>؟` and `هل تريد إزالة صلاحيات الإشراف من <name>؟`; buttons «ترقية لمشرف» / «إزالة الإشراف» (danger). `refresh()` loads `adminData()` and `listMembers()` together; self id from `getProfile()` once in `initialize()`.

- [ ] **Step 4: Run tests** — `PATH="$NODE_BIN:$PATH" npm test` → PASS.

- [ ] **Step 5: Commit** — `dashboard.html admin.js tests/frontend.test.mjs`, message `Add event editing and admin role management`.

---

### Task 5: Dashboard — structure and homepage content editing

**Files:**
- Create: `admin-content.js` (exposes `window.ErtwaAdminContent = { initialize }`)
- Modify: `dashboard.html` (two sections; `<script src="admin-content.js">` before `admin.js`), `admin.js` (`initialize()` also awaits `window.ErtwaAdminContent.initialize()`), `scripts/build-site.mjs` (add `'admin-content.js'` to `assets`), `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `siteContent`, `saveSettings`, `saveDepartment`, `saveStat`; `ErtwaUI.{node, message, busy}`.
- Produces: containers `admin-structure-list`, form `home-content-form` with `content-hero`, `content-mission`, `content-vision` and `admin-stats-list`; each structure row is a `<form data-row="platform|<slug>">`, each stat row `<fieldset data-stat="<slug>">` with inputs named `value`, `label`, `caption`.

- [ ] **Step 1: Write the failing tests** (`adminPage` now uses `scripts: ['admin-content.js', 'admin.js']` and defaults `siteContent` to `{ settings: {}, departments: [], stats: [] }` so Task 4's tests keep passing)

```js
test('admins save a department leader and title from the dashboard', async () => {
    const saved = [];
    const window = await adminPage({ events: [], members: [], siteContent: async () => content(),
        saveDepartment: async (slug, input) => saved.push([slug, input]) });
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
    const window = await adminPage({ events: [], members: [], siteContent: async () => content(),
        saveSettings: async input => calls.push(['settings', input]),
        saveStat: async (slug, input) => { calls.push([slug, input]); if (slug === 'followers') throw new Error('بعض البيانات غير صحيحة. يرجى مراجعة الحقول.'); } });
    window.document.getElementById('content-vision').value = 'رؤية طويلة';
    submit(window, 'home-content-form'); await flush();
    assert.deepEqual(calls[0], ['settings', { hero_text: 'مقدمة', mission_text: 'رسالة', vision_text: 'رؤية طويلة' }]);
    assert.deepEqual(calls.slice(1).map(call => call[0]), ['volunteer_hours', 'followers']);
    assert.match(window.document.querySelector('#home-content-form .form-message').textContent, /غير صحيحة/);
    assert.equal(window.document.getElementById('content-vision').value, 'رؤية طويلة');
    await window.happyDOM.close();
});
```

`content()` returns settings `{ leader_name, deputy_name, leader_title: 'قائد المنصة', deputy_title: 'نائب القائد', hero_text: 'مقدمة', mission_text: 'رسالة', vision_text: 'رؤية' }`, the `design` department `{ slug: 'design', display_name: 'لجنة التصميم', leader: 'شهد بخاري', deputy: 'رغد', leader_title: 'قائدة القسم', deputy_title: 'نائبة القسم', description: 'وصف التصميم' }`, and stats `volunteer_hours`, `followers` with any valid values.

- [ ] **Step 2: Run to verify failure** — `PATH="$NODE_BIN:$PATH" node --test tests/frontend.test.mjs` → FAIL (`admin-structure-list` missing).

- [ ] **Step 3: Implement**

Section headings «الهيكل التنظيمي» and «محتوى الصفحة الرئيسية» (`admin-section-subtitle dashboard-extra`). Structure rows: platform row labelled «قيادة المنصة», department rows labelled by `display_name`; fields leader, leader title `<select>`, deputy, deputy title `<select>`, and (departments only) description `<textarea maxlength="500">`; submit «حفظ», success «تم الحفظ.». Home form: three `<textarea maxlength="1000">` labelled «نص المقدمة», «رسالتنا», «رؤيتنا»; one fieldset per stat (legend = current label) with value/label/caption inputs and the global maxlengths; submit «حفظ المحتوى»; saves settings, then stats sequentially, stops at the first error and shows `api.errorMessage(error)`; success «تم حفظ المحتوى.». Use `busy` on each submit button, as existing forms do.

- [ ] **Step 4: Run tests and build**

Run: `PATH="$NODE_BIN:$PATH" npm test && PATH="$NODE_BIN:$PATH" npm run build && ls _site/admin-content.js`
Expected: tests PASS, `_site/admin-content.js` listed.

- [ ] **Step 5: Commit** — `admin-content.js dashboard.html admin.js scripts/build-site.mjs tests/frontend.test.mjs`, message `Add structure and homepage content editing`.

---

### Task 6: Rollout

**Files:** none (operations).

- [ ] **Step 1:** Give the owner the SQL Editor link `https://supabase.com/dashboard/project/savavbbccmportqbdhfi/sql/new` and the migration contents; wait for them to say it ran.
- [ ] **Step 2: Verify** — `curl -s -H "apikey: <publishable key>" "https://savavbbccmportqbdhfi.supabase.co/rest/v1/home_stats?select=slug"` returns 6 slugs.
- [ ] **Step 3:** Push `main` with the session `gh` credential helper; `gh run watch` the Pages run → success.
- [ ] **Step 4:** Send one FormSubmit request with `Origin`/`Referer` `https://yazedalmutrif.github.io/ertwa-platform/order.html` so the activation email reaches yazedksa23@gmail.com; tell the owner to click «Activate Form».
- [ ] **Step 5: Verify live** — `index.html`, `structure.html`, `dashboard.html`, `admin-content.js` return 200 and `supabase-config.js` contains `requestNotificationEmail`.
