(function () {
    'use strict';
    const api = window.ErtwaAPI;
    const { node, message, busy, statuses, services } = window.ErtwaUI;
    const defaultImage = 'images/web-dev-event.png';
    const roles = { admin: 'مشرف', member: 'عضو' };
    let initialized = false;
    let selfId = null;
    let editingId = null;

    function table(id, rows, columns, render) {
        const body = document.getElementById(id);
        body.replaceChildren();
        if (!rows.length) {
            const row = node('tr');
            const cell = node('td', 'لا توجد بيانات حالياً.');
            cell.colSpan = columns;
            row.append(cell); body.append(row);
        }
        rows.forEach(item => { const row = node('tr'); render(row, item); body.append(row); });
    }
    function cell(row, value) { const element = node('td', value); row.append(element); return element; }
    function action(container, label, work, danger = false) {
        const button = node('button', label, danger ? 'admin-action danger' : 'admin-action');
        button.type = 'button';
        button.addEventListener('click', async () => {
            try {
                const changed = await busy(button, async () => { await work(); return true; });
                if (changed) await refresh();
            } catch (error) { message(document.getElementById('admin-controls'), api.errorMessage(error), true); }
        });
        container.append(button);
    }
    function reviewButtons(container, current, work) {
        if (current !== 'approved') action(container, 'اعتماد', () => work('approved'));
        if (current !== 'rejected') action(container, 'رفض', () => work('rejected'), true);
    }

    // The add-event form doubles as the edit form; null returns it to add mode.
    function setEditMode(event) {
        const form = document.getElementById('add-event-form');
        editingId = event ? event.id : null;
        document.getElementById('event-form-title').textContent = event ? 'تعديل الفعالية' : 'إضافة فعالية جديدة';
        document.getElementById('event-submit').textContent = event ? 'حفظ التعديلات' : 'إضافة الفعالية للمنصة +';
        document.getElementById('event-cancel').hidden = !event;
        message(form, '');
        if (!event) { form.reset(); return; }
        Object.entries({
            'event-title': event.title, 'event-desc': event.description, 'event-date': event.date,
            'event-time': event.time.slice(0, 5), 'event-loc': event.location,
            'event-image': event.image === defaultImage ? '' : event.image, 'event-capacity': event.capacity ?? ''
        }).forEach(([id, value]) => { document.getElementById(id).value = value; });
        form.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }

    async function refresh() {
        const [data, members] = await Promise.all([api.adminData(), api.listMembers()]);
        message(document.getElementById('admin-controls'), '');
        table('admin-events-list', data.events, 3, (row, event) => {
            cell(row, event.title);
            cell(row, `${event.date} — ${event.participants} مشارك${event.published ? '' : ' — مخفية'}`);
            const controls = cell(row);
            const edit = node('button', 'تعديل', 'admin-action');
            edit.type = 'button';
            edit.addEventListener('click', () => setEditMode(event));
            controls.append(edit);
            action(controls, event.published ? 'إخفاء' : 'إظهار', () => api.setEventPublished(event.id, !event.published));
            action(controls, 'حذف', async () => {
                if (!window.confirm('هل تريد حذف هذه الفعالية وجميع تسجيلاتها؟')) return;
                await api.deleteEvent(event.id);
                if (editingId === event.id) setEditMode(null);
            }, true);
        });
        table('admin-applications-list', data.applications, 5, (row, application) => {
            cell(row, `${application.profiles?.full_name || ''} — ${application.profiles?.email || ''}`);
            cell(row, application.departments?.name || ''); cell(row, statuses[application.status]);
            const answers = cell(row);
            const details = node('details');
            details.append(node('summary', 'عرض الإجابات'));
            application.answers.forEach(answer => details.append(node('p', `${answer.question}: ${Array.isArray(answer.answer) ? answer.answer.join('، ') : answer.answer}`)));
            answers.append(details);
            reviewButtons(cell(row), application.status, status => api.reviewApplication(application.id, status));
        });
        table('admin-requests-list', data.requests, 6, (row, request) => {
            cell(row, request.client_name); cell(row, request.email); cell(row, services[request.service_type]);
            cell(row, `${request.description}\nالميزانية: ${request.budget} ريال — المدة: ${request.timeline}`);
            cell(row, statuses[request.status]);
            const controls = cell(row);
            const select = node('select', null, 'form-group__select');
            select.setAttribute('aria-label', `حالة طلب ${request.client_name}`);
            ['pending', 'in_progress', 'completed', 'rejected'].forEach(status => {
                const option = node('option', statuses[status]); option.value = status; select.append(option);
            });
            select.value = request.status;
            controls.append(select);
            action(controls, 'حفظ', () => api.updateStatus('service_requests', request.id, select.value));
        });
        table('admin-contributions-list', data.contributions, 5, (row, contribution) => {
            cell(row, contribution.profiles?.full_name || ''); cell(row, contribution.description);
            cell(row, `${contribution.hours} ساعة`); cell(row, statuses[contribution.status]);
            reviewButtons(cell(row), contribution.status, status => api.updateStatus('contributions', contribution.id, status));
        });
        // The signed-in admin cannot change their own role (the database refuses it too).
        table('admin-members-list', members, 5, (row, member) => {
            cell(row, member.full_name); cell(row, member.email);
            cell(row, roles[member.role]); cell(row, statuses[member.membership_status]);
            const controls = cell(row);
            if (member.id === selfId) return;
            const promote = member.role !== 'admin';
            action(controls, promote ? 'ترقية لمشرف' : 'إزالة الإشراف', async () => {
                const question = promote
                    ? `هل تريد منح صلاحيات الإشراف لـ ${member.full_name}؟`
                    : `هل تريد إزالة صلاحيات الإشراف من ${member.full_name}؟`;
                if (window.confirm(question)) await api.setMemberRole(member.id, promote ? 'admin' : 'member');
            }, !promote);
        });
    }

    async function initialize() {
        if (!initialized) {
            selfId = (await api.getProfile()).id;
            initialized = true;
            const form = document.getElementById('add-event-form');
            document.getElementById('event-cancel').addEventListener('click', () => setEditMode(null));
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const editing = editingId;
                try {
                    const saved = await busy(document.getElementById('event-submit'), async () => {
                        const fields = {
                            title: document.getElementById('event-title').value,
                            description: document.getElementById('event-desc').value,
                            date: document.getElementById('event-date').value, time: document.getElementById('event-time').value,
                            location: document.getElementById('event-loc').value,
                            image: document.getElementById('event-image').value,
                            capacity: document.getElementById('event-capacity').value
                        };
                        if (editing) await api.updateEvent(editing, fields); else await api.addEvent(fields);
                        return true;
                    });
                    if (!saved) return;
                    setEditMode(null); await refresh();
                    message(form, editing ? 'تم حفظ التعديلات.' : 'تمت إضافة الفعالية بنجاح.');
                } catch (error) { message(form, api.errorMessage(error), true); }
            });
        }
        await refresh();
        await window.ErtwaAdminContent.initialize();
    }
    window.ErtwaAdmin = { initialize };
})();
