/* Admin editors for the structure page and homepage content. */
(function () {
    'use strict';
    const api = window.ErtwaAPI;
    const { node, message, busy } = window.ErtwaUI;
    const titles = {
        platform: { leader_title: ['قائد المنصة', 'قائدة المنصة'], deputy_title: ['نائب القائد', 'نائبة القائد'] },
        department: { leader_title: ['قائد القسم', 'قائدة القسم'], deputy_title: ['نائب القسم', 'نائبة القسم'] }
    };
    let initialized = false;

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
    function textarea(name, value, max) {
        const element = node('textarea', null, 'form-group__textarea');
        element.name = name; element.rows = 2; element.maxLength = max; element.value = value ?? '';
        return element;
    }
    function select(name, options, value) {
        const element = node('select', null, 'form-group__select');
        element.name = name;
        options.forEach(text => { const option = node('option', text); option.value = text; element.append(option); });
        element.value = options.includes(value) ? value : options[0];
        return element;
    }
    const valueOf = (form, name) => form.querySelector(`[name="${name}"]`).value;

    // One form per leadership row; each saves on its own.
    function structureRow(key, heading, values, allowed, withDescription, save) {
        const form = node('form', null, 'admin-fieldset');
        form.dataset.row = key;
        const button = node('button', 'حفظ', 'btn-submit');
        button.type = 'submit';
        const leaders = node('div', null, 'form-row');
        leaders.append(field('القائد', input('leader', values.leader, 150), `${key}-leader`),
            field('المسمى', select('leader_title', allowed.leader_title, values.leader_title), `${key}-leader-title`));
        const deputies = node('div', null, 'form-row');
        deputies.append(field('النائب', input('deputy', values.deputy, 150), `${key}-deputy`),
            field('المسمى', select('deputy_title', allowed.deputy_title, values.deputy_title), `${key}-deputy-title`));
        form.append(node('h4', heading), leaders, deputies);
        if (withDescription) form.append(field('الوصف في الصفحة الرئيسية', textarea('description', values.description, 500), `${key}-description`));
        form.append(button);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                const saved = await busy(button, async () => {
                    const fields = { leader: valueOf(form, 'leader'), leader_title: valueOf(form, 'leader_title'),
                        deputy: valueOf(form, 'deputy'), deputy_title: valueOf(form, 'deputy_title') };
                    if (withDescription) fields.description = valueOf(form, 'description');
                    await save(fields);
                    return true;
                });
                if (saved) message(form, 'تم الحفظ.');
            } catch (error) { message(form, api.errorMessage(error), true); }
        });
        return form;
    }

    function renderStructure({ settings, departments }) {
        const platform = structureRow('platform', 'قيادة المنصة',
            { leader: settings.leader_name, deputy: settings.deputy_name, leader_title: settings.leader_title, deputy_title: settings.deputy_title },
            titles.platform, false,
            fields => api.saveSettings({ leader_name: fields.leader, deputy_name: fields.deputy, leader_title: fields.leader_title, deputy_title: fields.deputy_title }));
        document.getElementById('admin-structure-list').replaceChildren(platform, ...departments.map(department =>
            structureRow(department.slug, department.display_name, department, titles.department, true,
                fields => api.saveDepartment(department.slug, fields))));
    }

    function renderHome({ settings, stats }) {
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
    }

    // Saves the texts, then each stat in order, stopping at the first error.
    function setupHomeForm() {
        const form = document.getElementById('home-content-form');
        form.addEventListener('submit', async event => {
            event.preventDefault();
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
        if (!initialized) { initialized = true; setupHomeForm(); }
        try {
            const content = await api.siteContent();
            renderStructure(content);
            renderHome(content);
        } catch (error) { message(document.getElementById('admin-structure-list'), api.errorMessage(error), true); }
    }
    window.ErtwaAdminContent = { initialize };
})();
