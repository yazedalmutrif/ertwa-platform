import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../api.js', import.meta.url), 'utf8');
// Values cross from the vm realm; cloning keeps strict deep equality meaningful.
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// Runs api.js against a recording stand-in for the Supabase client and fetch.
async function load(config, options = {}) {
    const writes = [], rpcs = [], fetches = [];
    function builder(table) {
        const record = { table, op: 'select', values: undefined, eq: undefined };
        const query = {
            select() { return query; }, order() { return query; }, single() { return query; },
            insert(values) { Object.assign(record, { op: 'insert', values: clone(values) }); writes.push(record); return query; },
            update(values) { Object.assign(record, { op: 'update', values: clone(values) }); writes.push(record); return query; },
            delete() { record.op = 'delete'; writes.push(record); return query; },
            eq(column, value) { record.eq = [column, value]; return query; },
            then(resolve, reject) {
                if (record.op === 'insert' && options.insertError) return Promise.resolve({ data: null, error: options.insertError }).then(resolve, reject);
                const data = table === 'profiles' ? { id: 'u1', role: options.role } : {};
                return Promise.resolve({ data, error: null }).then(resolve, reject);
            }
        };
        return query;
    }
    const client = {
        auth: {
            getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
            getUser: async () => ({ data: { user: { id: 'u1' } }, error: null })
        },
        from: builder,
        rpc: async (name, args) => { rpcs.push([name, clone(args)]); return { data: null, error: null }; }
    };
    const window = {
        ERTWA_CONFIG: { supabaseUrl: 'https://x.supabase.co', supabasePublishableKey: 'sb_publishable_x', ...config },
        supabase: { createClient: () => client },
        location: { href: 'https://example.github.io/ertwa-platform/order.html' },
        fetch: (url, init) => {
            fetches.push({ url, options: clone(init) });
            return options.fetchRejects ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true });
        }
    };
    vm.runInContext(source, vm.createContext({ window, URL }));
    return { api: window.ErtwaAPI, writes, rpcs, fetches };
}
const request = overrides => ({ client_name: 'عميل', email: 'client@example.com', service_type: 'web',
    description: 'وصف المشروع', budget: '1000', timeline: 'شهر', ...overrides });
const eventInput = overrides => ({ title: 'ورشة', description: 'تفاصيل', date: '2099-01-01', time: '10:00',
    location: 'أونلاين', image: 'https://example.com/a.png', capacity: '20', ...overrides });

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
