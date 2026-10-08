/* Renders the active departments on the homepage, departments page, structure page and signup wizard.
   The static markup stays when the database cannot be reached. */
(function () {
    'use strict';
    const { node, content } = window.ErtwaUI;
    const safeIcon = name => (/^fa-[a-z0-9-]{1,40}$/.test(name || '') ? name : 'fa-layer-group');

    function icon(name, extra = '') {
        return node('i', null, `fa-solid ${safeIcon(name)}${extra ? ` ${extra}` : ''}`);
    }
    // Existing departments keep their homepage artwork; new ones show their icon.
    function picture(department) {
        if (!department.image) return icon(department.icon);
        const image = node('img');
        image.src = department.image;
        image.alt = department.name || '';
        return image;
    }

    function homeCard(department) {
        const card = node('div', null, 'spec-card');
        card.dataset.dept = department.slug;
        const box = node('div', null, 'spec-icon-box');
        box.append(picture(department));
        const link = node('a', 'معرفة المزيد', 'read-more');
        link.href = `departments.html#${department.slug}-dept`;
        card.append(box, node('h3', department.name), node('p', department.description), link);
        return card;
    }

    function pageSection(department, index) {
        const dark = index % 2 === 1;
        const section = node('div', null, `info-card ${dark ? 'vision-card' : 'message-card'}`);
        section.id = `${department.slug}-dept`;
        section.dataset.dept = department.slug;
        const box = node('div', null, dark ? 'dept-icon-box-dark' : 'dept-icon-box');
        box.append(icon(department.icon));
        section.append(box, node('h3', department.page_title || department.display_name), node('p', department.details || department.description));
        const tasks = (department.tasks || '').split('\n').map(task => task.trim()).filter(Boolean);
        if (tasks.length) {
            const wrapper = node('div', null, dark ? 'dept-tasks-wrapper-dark' : 'dept-tasks-wrapper');
            const heading = node('h4', null, 'dept-tasks-title');
            heading.append(icon('fa-list-check', 'dept-icon-margin'), document.createTextNode('المهام المطلوبة:'));
            const list = node('ul', null, 'dept-tasks-list');
            tasks.forEach(task => {
                const item = node('li');
                item.append(node('i', null, 'fa-regular fa-circle-check dept-icon-margin'), document.createTextNode(` ${task}`));
                list.append(item);
            });
            wrapper.append(heading, list);
            section.append(wrapper);
        }
        return section;
    }

    function structureCard(department) {
        const card = node('div', null, 'dept-card-box');
        card.dataset.dept = department.slug;
        const header = node('div', null, 'dept-card-header');
        const circle = node('div', null, 'dept-icon-circle');
        circle.append(icon(department.icon));
        header.append(circle, node('h4', department.display_name, 'dept-card-title'));
        const leader = node('div', null, 'dept-leader-row');
        leader.append(node('span', department.leader_title || 'قائد القسم', 'dept-leader-tag'),
            node('p', department.leader || 'غير محدد', 'dept-person-name'));
        const deputy = node('div');
        deputy.append(node('span', department.deputy_title || 'نائب القسم', 'dept-deputy-tag'),
            node('p', department.deputy || 'غير محدد', 'dept-deputy-name'));
        card.append(header, leader, deputy);
        return card;
    }

    function committeeCard(department) {
        const card = node('div', null, 'committee-card');
        card.dataset.slug = department.slug;
        const box = node('div', null, 'committee-card__icon');
        box.append(picture(department));
        const choose = node('button', 'اختر اللجنة', 'btn-select-committee');
        choose.type = 'button';
        card.append(box, node('h3', department.name, 'committee-card__name'), node('p', department.description, 'committee-card__desc'), choose);
        return card;
    }

    // A link to a hidden or unknown department shows every section instead of an empty page.
    function filterSections() {
        const sections = [...document.querySelectorAll('.departments-page-container .info-card')];
        const target = window.location.hash;
        const match = sections.some(section => `#${section.id}` === target);
        sections.forEach(section => { section.style.display = !match || `#${section.id}` === target ? 'block' : 'none'; });
    }

    function render(departments) {
        const active = departments.filter(department => department.active !== false)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const replace = (container, build) => container?.replaceChildren(...active.map(build));
        replace(document.querySelector('.specialized-grid'), homeCard);
        replace(document.getElementById('departments-list'), structureCard);
        replace(document.querySelector('.committees-grid'), committeeCard);
        const page = document.querySelector('.departments-page-container .container');
        if (page) {
            page.querySelectorAll('.info-card').forEach(section => section.remove());
            page.append(...active.map(pageSection));
        }
    }

    async function start() {
        const used = document.querySelector('.specialized-grid, #departments-list, .committees-grid, .departments-page-container');
        if (!used) return;
        try { render((await content()).departments); } catch (_) { /* static departments stay */ }
        filterSections();
    }

    window.addEventListener('hashchange', filterSections);
    document.addEventListener('DOMContentLoaded', start);
    window.ErtwaDepartments = { render };
})();
