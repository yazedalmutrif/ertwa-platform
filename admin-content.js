/* Admin editors for the structure page and homepage content. */
(function () {
    'use strict';
    const api = window.ErtwaAPI;
    const { node, message, busy } = window.ErtwaUI;
    const titles = {
        platform: { leader_title: ['قائد المنصة', 'قائدة المنصة'], deputy_title: ['نائب القائد', 'نائبة القائد'] },
        department: { leader_title: ['قائد القسم', 'قائدة القسم'], deputy_title: ['نائب القسم', 'نائبة القسم'] }
    };
    // Icons offered for departments, with Arabic names for the picker.
    const icons = {
        'fa-code': 'برمجة', 'fa-palette': 'تصميم', 'fa-calendar-days': 'تقويم', 'fa-chart-line': 'رسم بياني',
        'fa-camera-retro': 'كاميرا', 'fa-pen-nib': 'قلم', 'fa-bullhorn': 'مكبر صوت', 'fa-users': 'مجموعة',
        'fa-handshake': 'مصافحة', 'fa-laptop-code': 'حاسب', 'fa-graduation-cap': 'تعليم', 'fa-lightbulb': 'فكرة',
        'fa-microphone': 'ميكروفون', 'fa-gamepad': 'ألعاب', 'fa-shield-halved': 'حماية', 'fa-layer-group': 'عام'
    };
    const departmentKeys = ['name', 'display_name', 'page_title', 'description', 'details', 'tasks', 'icon',
        'leader', 'leader_title', 'deputy', 'deputy_title'];
    let initialized = false;
    let homeLoaded = false;

    function field(labelText, control, id) {
        const wrapper = node('div', null, 'form-group');
        const label = node('label', labelText, 'form-group__label');
        control.id = id;
        label.htmlFor = id;
        wrapper.append(label, control);
        return wrapper;
    }
    function input(name, value, max) {
        const element = node('input', null, 'form-group__input');
        element.type = 'text'; element.name = name; element.maxLength = max; element.value = value ?? '';
        return element;
    }
    function textarea(name, value, max, rows = 2) {
        const element = node('textarea', null, 'form-group__textarea');
        element.name = name; element.rows = rows; element.maxLength = max; element.value = value ?? '';
        return element;
    }
    function fillOptions(element, options, value, labels = {}) {
        element.replaceChildren(...options.map(text => { const option = node('option', labels[text] || text); option.value = text; return option; }));
        element.value = options.includes(value) ? value : options[0];
        return element;
    }
    function select(name, options, value, labels) {
        const element = node('select', null, 'form-group__select');
        element.name = name;
        return fillOptions(element, options, value, labels);
    }
    // Icon picker with a live preview of the chosen icon.
    function iconField(value, id) {
        const picker = select('icon', Object.keys(icons), value || 'fa-layer-group', icons);
        const wrapper = field('الأيقونة', picker, id);
        const preview = node('i', null, `fa-solid ${picker.value} admin-icon`);
        picker.addEventListener('change', () => { preview.className = `fa-solid ${picker.value} admin-icon`; });
        wrapper.append(preview);
        return wrapper;
    }
    const valueOf = (form, name) => form.querySelector(`[name="${name}"]`).value;
    const collect = (form, keys) => Object.fromEntries(keys.map(key => [key, valueOf(form, key)]));

    // Saves a form with its own button and shows the result inside it.
    function onSave(form, button, save, success = 'تم الحفظ.') {
        form.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                const saved = await busy(button, async () => { await save(); return true; });
                if (saved) message(form, success);
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
    }
    function leadership(key, values, allowed) {
        const leaders = node('div', null, 'form-row');
        leaders.append(field('القائد', input('leader', values.leader, 150), `${key}-leader`),
            field('المسمى', select('leader_title', allowed.leader_title, values.leader_title), `${key}-leader-title`));
        const deputies = node('div', null, 'form-row');
        deputies.append(field('النائب', input('deputy', values.deputy, 150), `${key}-deputy`),
            field('المسمى', select('deputy_title', allowed.deputy_title, values.deputy_title), `${key}-deputy-title`));
        return [leaders, deputies];
    }
    function submitButton(label) {
        const button = node('button', label, 'btn-submit');
        button.type = 'submit';
        return button;
    }

    function platformRow(settings) {
        const form = node('form', null, 'admin-fieldset');
        form.dataset.row = 'platform';
        const button = submitButton('حفظ');
        form.append(node('h4', 'قيادة المنصة'), ...leadership('platform', {
            leader: settings.leader_name, deputy: settings.deputy_name, leader_title: settings.leader_title, deputy_title: settings.deputy_title
        }, titles.platform), button);
        onSave(form, button, () => {
            const fields = collect(form, ['leader', 'deputy', 'leader_title', 'deputy_title']);
            return api.saveSettings({ leader_name: fields.leader, deputy_name: fields.deputy, leader_title: fields.leader_title, deputy_title: fields.deputy_title });
        });
        return form;
    }

    // Everything the four public pages show about one department, plus «حذف القسم» (hides it).
    function departmentRow(department) {
        const key = department.slug;
        const form = node('form', null, 'admin-fieldset');
        form.dataset.row = key;
        const names = node('div', null, 'form-row');
        names.append(field('اسم القسم', input('name', department.name, 100), `${key}-name`),
            field('العنوان في الهيكل التنظيمي', input('display_name', department.display_name, 150), `${key}-display-name`));
        const save = submitButton('حفظ');
        const remove = node('button', 'حذف القسم', 'admin-action danger');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
            if (!window.confirm(`هل تريد حذف قسم ${department.name || department.display_name}؟ سيختفي من الموقع وتبقى طلبات الانضمام السابقة.`)) return;
            try {
                const done = await busy(remove, async () => { await api.setDepartmentActive(key, false); return true; });
                if (done) await reloadStructure();
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
        const actions = node('div', null, 'form-row');
        actions.append(save, remove);
        form.append(node('h4', department.display_name || department.name), names,
            field('العنوان في صفحة الأقسام', input('page_title', department.page_title, 200), `${key}-page-title`),
            field('الوصف المختصر (الصفحة الرئيسية والتسجيل)', textarea('description', department.description, 500), `${key}-description`),
            field('التفاصيل (صفحة الأقسام)', textarea('details', department.details, 2000, 3), `${key}-details`),
            field('المهام (مهمة في كل سطر)', textarea('tasks', department.tasks, 2000, 3), `${key}-tasks`),
            iconField(department.icon, `${key}-icon`), ...leadership(key, department, titles.department), actions);
        onSave(form, save, () => api.saveDepartment(key, collect(form, departmentKeys)));
        return form;
    }

    function hiddenRow(department) {
        const row = node('div', null, 'form-row');
        row.dataset.hidden = department.slug;
        const restore = node('button', 'إظهار', 'admin-action');
        restore.type = 'button';
        restore.addEventListener('click', async () => {
            try {
                const done = await busy(restore, async () => { await api.setDepartmentActive(department.slug, true); return true; });
                if (done) await reloadStructure();
            } catch (error) { message(row, api.errorMessage(error), true); }
        });
        row.append(node('span', department.display_name || department.name), restore);
        return row;
    }

    function renderStructure({ settings, departments }) {
        const sorted = [...departments].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const active = sorted.filter(department => department.active !== false);
        const hidden = sorted.filter(department => department.active === false);
        document.getElementById('admin-structure-list').replaceChildren(platformRow(settings), ...active.map(departmentRow));
        document.getElementById('admin-hidden-departments').replaceChildren(
            ...(hidden.length ? [node('h4', 'الأقسام المحذوفة (يمكن إظهارها مجدداً)')] : []), ...hidden.map(hiddenRow));
    }
    async function reloadStructure() {
        try { renderStructure(await api.siteContent()); }
        catch (error) { message(document.getElementById('admin-structure-list'), api.errorMessage(error), true); }
    }

    // New departments get the basics here; details and leaders are edited in their row afterwards.
    function setupAddForm() {
        const form = document.getElementById('add-department-form');
        fillOptions(form.querySelector('[name="icon"]'), Object.keys(icons), 'fa-layer-group', icons);
        const button = form.querySelector('[type="submit"]');
        onSave(form, button, async () => {
            await api.addDepartment(collect(form, ['name', 'display_name', 'description', 'icon']));
            form.reset();
            await reloadStructure();
        }, 'تمت إضافة القسم.');
    }

    function renderHome({ settings, stats }) {
        const form = document.getElementById('home-content-form');
        document.getElementById('content-hero').value = settings.hero_text ?? '';
        document.getElementById('content-mission').value = settings.mission_text ?? '';
        document.getElementById('content-vision').value = settings.vision_text ?? '';
        document.getElementById('admin-stats-list').replaceChildren(...stats.map(stat => {
            const fieldset = node('fieldset', null, 'admin-fieldset');
            fieldset.dataset.stat = stat.slug;
            const row = node('div', null, 'form-row');
            row.append(field('الرقم', input('value', stat.value, 20), `stat-${stat.slug}-value`),
                field('العنوان', input('label', stat.label, 100), `stat-${stat.slug}-label`),
                field('الوصف المختصر', input('caption', stat.caption, 200), `stat-${stat.slug}-caption`));
            fieldset.append(node('legend', stat.label), row);
            return fieldset;
        }));
        homeLoaded = true;
        form.hidden = false;
    }

    // Saves the texts, then each stat in order, stopping at the first error.
    // Never saves before the current content loaded, so empty boxes cannot overwrite it.
    function setupHomeForm() {
        const form = document.getElementById('home-content-form');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!homeLoaded) return;
            try {
                const saved = await busy(form.querySelector('[type="submit"]'), async () => {
                    await api.saveSettings({
                        hero_text: document.getElementById('content-hero').value,
                        mission_text: document.getElementById('content-mission').value,
                        vision_text: document.getElementById('content-vision').value
                    });
                    for (const fieldset of document.querySelectorAll('#admin-stats-list [data-stat]')) {
                        await api.saveStat(fieldset.dataset.stat, { value: valueOf(fieldset, 'value'),
                            label: valueOf(fieldset, 'label'), caption: valueOf(fieldset, 'caption') });
                    }
                    return true;
                });
                if (saved) message(form, 'تم حفظ المحتوى.');
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
    }

    // A failure here stays inside these sections; the rest of the dashboard keeps working.
    async function initialize() {
        if (!initialized) { initialized = true; setupHomeForm(); setupAddForm(); }
        try {
            const content = await api.siteContent();
            renderStructure(content);
            renderHome(content);
        } catch (error) { message(document.getElementById('admin-structure-list'), api.errorMessage(error), true); }
    }
    window.ErtwaAdminContent = { initialize };
})();
