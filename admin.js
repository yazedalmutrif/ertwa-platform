(function () {
    'use strict';
    const api = window.ErtwaAPI;
    const { node, message, busy, statuses, services } = window.ErtwaUI;
    let initialized = false;

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

    async function refresh() {
        const data = await api.adminData();
        message(document.getElementById('admin-controls'), '');
        table('admin-events-list', data.events, 3, (row, event) => {
            cell(row, event.title); cell(row, `${event.date} — ${event.participants} مشارك`);
            const controls = cell(row);
            action(controls, 'حذف', async () => {
                if (window.confirm('هل تريد حذف هذه الفعالية وجميع تسجيلاتها؟')) await api.deleteEvent(event.id);
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
    }

    async function initialize() {
        if (!initialized) {
            initialized = true;
            const form = document.getElementById('add-event-form');
            form.addEventListener('submit', async event => {
                event.preventDefault();
                try {
                    const saved = await busy(form.querySelector('[type="submit"]'), async () => {
                        await api.addEvent({
                            title: document.getElementById('event-title').value,
                            description: document.getElementById('event-desc').value,
                            date: document.getElementById('event-date').value, time: document.getElementById('event-time').value,
                            location: document.getElementById('event-loc').value,
                            image: document.getElementById('event-image').value,
                            capacity: document.getElementById('event-capacity').value
                        });
                        return true;
                    });
                    if (!saved) return;
                    form.reset(); await refresh(); message(form, 'تمت إضافة الفعالية بنجاح.');
                } catch (error) { message(form, api.errorMessage(error), true); }
            });
        }
        await refresh();
    }
    window.ErtwaAdmin = { initialize };
})();
