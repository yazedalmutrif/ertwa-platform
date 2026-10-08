import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL execution in memory; only Supabase's Auth schema is stubbed.
const db = new PGlite();
const member = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const openEvent = '20000000-0000-4000-8000-000000000001';
const fullEvent = '20000000-0000-4000-8000-000000000002';
const pastEvent = '20000000-0000-4000-8000-000000000003';
const hiddenEvent = '20000000-0000-4000-8000-000000000004';
const answers = [{ question: 'المهارات', answer: ['JavaScript'] }];

async function as(role, userId, work) {
    assert.ok(['anon', 'authenticated'].includes(role));
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || '']);
    try { return await work(); }
    finally {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
}
const rejects = (query, code) => assert.rejects(query, error => error.code === code);
const signup = (id, email, extra = {}) => db.query(
    'insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)',
    [id, email, JSON.stringify({ full_name: 'عضو اختبار', city: 'الرياض', age: 25,
        specialization: 'علوم حاسب', department_slug: 'tech', answers, ...extra })]
);

before(async () => {
    await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create schema auth;
        grant usage on schema public, auth to anon, authenticated, service_role;
        create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        -- Match the permissive defaults found in some existing Supabase projects.
        alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    try {
        for (const name of ['202610080001_init.sql', '202610080002_admin_content.sql']) {
            await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
        }
    } catch (error) { delete error.query; throw error; }
    await signup(member, 'admin-in-name@example.com', { role: 'admin', membership_status: 'active' });
    await signup(other, 'member2@example.com');
    await signup(admin, 'manager@example.com');
    await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
    for (const [id, days, capacity, published] of [
        [openEvent, 1, null, true], [fullEvent, 1, 1, true],
        [pastEvent, -1, null, true], [hiddenEvent, 1, null, false]
    ]) {
        await db.query(`insert into public.events(id, title, description, date, time, location, capacity, published)
            values ($1, 'ورشة', 'اختبار', current_date + $2::integer, '10:00', 'أونلاين', $3, $4)`, [id, days, capacity, published]);
    }
});
after(() => db.close());

test('migrations protect all nine public tables and seed the structure', async () => {
    const rows = (await db.query("select relname, relrowsecurity from pg_class join pg_namespace n on n.oid = relnamespace where n.nspname = 'public' and relkind = 'r'")).rows;
    assert.equal(rows.length, 9);
    assert.ok(rows.every(row => row.relrowsecurity));
    assert.equal((await db.query('select * from public.departments')).rows.length, 6);
});

test('signup atomically saves the application and ignores injected admin claims', async () => {
    const profile = (await db.query('select * from public.profiles where id = $1', [member])).rows[0];
    assert.equal(profile.role, 'member');
    assert.equal(profile.membership_status, 'pending');
    const application = (await db.query('select * from public.membership_applications where user_id = $1', [member])).rows[0];
    assert.deepEqual(application.answers, answers);
    const invalid = '10000000-0000-4000-8000-000000000099';
    await rejects(signup(invalid, 'invalid@example.com', { department_slug: 'missing' }), '23503');
    assert.equal((await db.query('select * from auth.users where id = $1', [invalid])).rows.length, 0);
    await rejects(signup(invalid, 'invalid@example.com', { answers: [] }), '23514');
    await rejects(signup(invalid, 'invalid@example.com', { answers: ['not an answer object'] }), '23514');
});

test('anonymous visitors can read published events and submit requests without reading private data', async () => {
    await as('anon', null, async () => {
        assert.equal((await db.query('select * from public.events')).rows.length, 3);
        const events = (await db.query('select * from public.list_events()')).rows;
        assert.equal(events.length, 3);
        assert.ok(events.every(event => event.id !== hiddenEvent && event.participants === 0));
        assert.equal((await db.query('select * from public.list_events(true)')).rows.length, 2);
        for (const table of ['profiles', 'membership_applications', 'event_registrations', 'service_requests', 'contributions']) {
            await rejects(db.query(`select * from public.${table}`), '42501');
        }
        await db.query(`insert into public.service_requests(client_name, email, service_type, description, budget, timeline)
            values ('عميل', 'guest@example.com', 'web', 'موقع إلكتروني', 5000, 'شهر')`);
        await rejects(db.query(`insert into public.service_requests(client_name, email, service_type, description, budget, timeline, status)
            values ('عميل', 'guest@example.com', 'web', 'موقع', 1, 'شهر', 'completed')`), '42501');
        await rejects(db.query('select public.register_for_event($1)', [openEvent]), '42501');
    });
});

test('members see only their own private rows and cannot promote themselves or create events', async () => {
    await as('authenticated', member, async () => {
        assert.deepEqual((await db.query('select id from public.profiles')).rows.map(row => row.id), [member]);
        assert.equal((await db.query('select * from public.membership_applications')).rows.length, 1);
        await rejects(db.query("update public.profiles set role = 'admin' where id = $1", [member]), '42501');
        await rejects(db.query("update public.profiles set membership_status = 'active' where id = $1", [member]), '42501');
        await rejects(db.query("insert into public.events(title, description, date, time, location) values ('ورشة', 'تفاصيل', current_date + 1, '12:00', 'الرياض')"), '42501');
        const app = (await db.query('select id from public.membership_applications')).rows[0];
        await rejects(db.query("select public.review_application($1, 'approved')", [app.id]), '42501');
    });
});

test('event registrations are idempotent, enforce capacity, and reject past and hidden events', async () => {
    await as('authenticated', member, async () => {
        const first = (await db.query('select public.register_for_event($1) as id', [openEvent])).rows[0].id;
        const second = (await db.query('select public.register_for_event($1) as id', [openEvent])).rows[0].id;
        assert.equal(first, second);
        await db.query('select public.register_for_event($1)', [fullEvent]);
        assert.equal((await db.query('select * from public.event_registrations')).rows.length, 2);
        await rejects(db.query('select public.register_for_event($1)', [pastEvent]), 'P0001');
        await rejects(db.query('select public.register_for_event($1)', [hiddenEvent]), 'P0001');
        await rejects(db.query('insert into public.event_registrations(event_id, user_id) values ($1, $2)', [openEvent, other]), '42501');
    });
    await as('authenticated', other, async () => {
        assert.equal((await db.query('select * from public.event_registrations')).rows.length, 0);
        await rejects(db.query('select public.register_for_event($1)', [fullEvent]), 'P0001');
    });
    await as('anon', null, async () => {
        assert.equal((await db.query('select participants from public.list_events() where id = $1', [openEvent])).rows[0].participants, 1);
    });
});

test('members cannot forge request ownership or approve their own contribution hours', async () => {
    await as('authenticated', member, async () => {
        await db.query("insert into public.contributions(description, hours) values ('تطوير المنصة', 2.5)");
        assert.equal((await db.query('select * from public.contributions')).rows[0].status, 'pending');
        const updated = await db.query("update public.contributions set status = 'approved' returning id");
        assert.equal(updated.rows.length, 0);
        await rejects(db.query("insert into public.contributions(description, hours, user_id) values ('تقرير', 1, $1)", [other]), '42501');
        await rejects(db.query("insert into public.contributions(description, hours) values ('تقرير', -1)"), '23514');
        await db.query(`insert into public.service_requests(client_name, email, service_type, description, budget, timeline)
            values ('عضو', 'member@example.com', 'branding', 'هوية', 1000, 'أسبوع')`);
        assert.equal((await db.query('select * from public.service_requests')).rows.length, 1);
        await rejects(db.query(`insert into public.service_requests(client_name, email, service_type, description, budget, timeline, user_id)
            values ('عضو', 'member@example.com', 'web', 'موقع', 1, 'شهر', $1)`, [other]), '42501');
    });
    await as('authenticated', other, async () => {
        assert.equal((await db.query('select * from public.contributions')).rows.length, 0);
        assert.equal((await db.query('select * from public.service_requests')).rows.length, 0);
    });
});

test('admins review applications atomically, approve hours, and manage guest service requests', async () => {
    await as('authenticated', admin, async () => {
        assert.equal((await db.query('select * from public.profiles')).rows.length, 3);
        assert.equal((await db.query('select * from public.list_events()')).rows.length, 4);
        const application = (await db.query('select id from public.membership_applications where user_id = $1', [member])).rows[0];
        await db.query("select public.review_application($1, 'approved')", [application.id]);
        assert.equal((await db.query('select membership_status from public.profiles where id = $1', [member])).rows[0].membership_status, 'active');
        await rejects(db.query("select public.review_application($1, 'admin')", [application.id]), '22023');
        const contributions = await db.query("update public.contributions set status = 'approved' returning hours");
        assert.equal(contributions.rows[0].hours, '2.50');
        const requests = await db.query("update public.service_requests set status = 'in_progress' returning id");
        assert.equal(requests.rows.length, 2);
        await rejects(db.query("update public.contributions set hours = 1000"), '42501');
        await db.query('delete from public.events where id = $1', [openEvent]);
    });
    assert.equal((await db.query('select * from public.event_registrations where event_id = $1', [openEvent])).rows.length, 0);
});

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
    const role = () => db.query('select role, membership_status from public.profiles where id = $1', [other]).then(result => result.rows[0]);
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
