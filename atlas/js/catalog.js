// Sidebar: faceted filters plus the operator catalog list.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { create } = Atlas.dom;
    const { integer } = Atlas.format;
    const { DOMAIN_COLORS, DOMAIN_LABELS, CATEGORY_COLORS, dtypeFamily } = Atlas.color;
    const ui = Atlas.ui;
    const tooltip = Atlas.tooltip;

    const FLAGS = [
        { id: 'multi', label: 'Multi-revision', hint: 'Operators with more than one version' },
        { id: 'examples', label: 'Has example', hint: 'Ships with reference code' },
        { id: 'attributes', label: 'Has attributes', hint: 'Declares at least one attribute' },
        { id: 'namesake', label: 'Cross-domain', hint: 'The name also exists in another domain' }
    ];

    const SORTS = [
        { id: 'name', label: 'Name' },
        { id: 'revisions', label: 'Revisions' },
        { id: 'attributes', label: 'Attributes' },
        { id: 'dtypes', label: 'Element types' }
    ];

    function filterGroup(title, reset, children) {
        return create('div', { class: 'filter-group' }, [
            create('div', { class: 'filter-title' }, [
                create('span', { text: title }),
                reset ? create('button', { class: 'reset', text: 'clear', onclick: reset }) : null
            ]),
            children
        ]);
    }

    function domainGroup(app) {
        const counts = new Map();
        for (const operator of app.model.operators) {
            counts.set(operator.module, (counts.get(operator.module) || 0) + 1);
        }
        return filterGroup('Domain', app.state.domains.size ? () => app.set({ domains: new Set() }) : null,
            create('div', { class: 'chip-row' }, app.model.domains.map((domain) => create('button', {
                class: `chip ${app.state.domains.has(domain.id) ? 'active' : ''}`.trim(),
                title: `${domain.id} — ${domain.operators} operators, ${domain.records} schemas, up to opset ${domain.latest}`,
                onclick: () => toggleSet(app, 'domains', domain.id)
            }, [
                create('span', { class: 'dot', style: `background:${DOMAIN_COLORS[domain.id]}` }),
                create('span', { text: domain.id }),
                create('span', { class: 'count', text: String(counts.get(domain.id) || 0) })
            ]))));
    }

    function categoryGroup(app) {
        const categories = app.model.categories;
        if (categories.length === 0) {
            return null;
        }
        return filterGroup('Category', app.state.categories.size ? () => app.set({ categories: new Set() }) : null,
            create('div', { class: 'chip-row' }, categories.map((category) => create('button', {
                class: `chip ${app.state.categories.has(category) ? 'active' : ''}`.trim(),
                onclick: () => toggleSet(app, 'categories', category)
            }, [
                create('span', { class: 'dot', style: `background:${CATEGORY_COLORS[category] || '#64748b'}` }),
                create('span', { text: category })
            ]))));
    }

    function dtypeGroup(app) {
        const counts = new Map();
        const inScope = app.filtered({ ignoreDtypes: true });
        for (const operator of inScope) {
            for (const dtype of app.dtypes(operator)) {
                counts.set(dtype, (counts.get(dtype) || 0) + 1);
            }
        }
        const dtypes = app.model.dtypes.filter((dtype) => (counts.get(dtype) || 0) > 0);
        return filterGroup('Element type', app.state.dtypes.size ? () => app.set({ dtypes: new Set() }) : null,
            create('div', { class: 'chip-row', style: 'max-height:150px;overflow-y:auto' }, dtypes.map((dtype) => {
                const family = dtypeFamily(dtype);
                const chip = create('button', {
                    class: `chip ${app.state.dtypes.has(dtype) ? 'active' : ''}`.trim(),
                    style: `border-color:${app.state.dtypes.has(dtype) ? family.color : null}`,
                    onclick: () => toggleSet(app, 'dtypes', dtype)
                }, [
                    create('span', { class: 'dot', style: `background:${family.color}` }),
                    create('span', { text: dtype }),
                    create('span', { class: 'count', text: String(counts.get(dtype) || 0) })
                ]);
                tooltip.attach(chip, `<div class="tt-title">${dtype}</div><div class="tt-row">${family.label} · ${counts.get(dtype) || 0} operators</div>`);
                return chip;
            })));
    }

    function flagGroup(app) {
        return filterGroup('Properties', app.state.flags.size ? () => app.set({ flags: new Set() }) : null,
            create('div', { class: 'toggle-row' }, FLAGS.map((flag) => create('button', {
                class: `chip ${app.state.flags.has(flag.id) ? 'active' : ''}`.trim(),
                title: flag.hint,
                onclick: () => toggleSet(app, 'flags', flag.id),
                text: flag.label
            }))));
    }

    function activeAttribute(app) {
        if (!app.state.attribute) {
            return null;
        }
        return create('div', { class: 'filter-group' }, [
            create('div', { class: 'filter-title' }, [create('span', { text: 'Attribute filter' })]),
            create('button', {
                class: 'chip active',
                onclick: () => app.set({ attribute: null }),
                text: `${app.state.attribute} \u00d7`
            })
        ]);
    }

    function toggleSet(app, key, value) {
        const next = new Set(app.state[key]);
        if (next.has(value)) {
            next.delete(value);
        } else {
            next.add(value);
        }
        app.set({ [key]: next });
    }

    function operatorList(app) {
        const items = [];
        const operators = app.filtered();
        const sort = app.state.sort;
        operators.sort((a, b) => {
            if (sort === 'revisions') {
                return b.records.length - a.records.length || a.name.localeCompare(b.name);
            }
            if (sort === 'attributes') {
                return b.attributeNames.size - a.attributeNames.size || a.name.localeCompare(b.name);
            }
            if (sort === 'dtypes') {
                return b.dtypes.size - a.dtypes.size || a.name.localeCompare(b.name);
            }
            return a.name.localeCompare(b.name) || a.module.localeCompare(b.module);
        });

        for (const operator of operators) {
            const revisions = app.revisions(operator);
            const dtypes = app.dtypes(operator);
            const item = create('button', {
                class: `op-item ${app.state.selectedKey === operator.key ? 'active' : ''}`.trim(),
                onclick: () => app.select(operator.key)
            }, [
                create('span', { class: 'op-bar', style: `background:${DOMAIN_COLORS[operator.module] || '#64748b'}` }),
                create('span', {}, [
                    create('span', { class: 'op-name', text: operator.name }),
                    create('span', { class: 'op-meta' }, [
                        create('span', { text: DOMAIN_LABELS[operator.module] || operator.module }),
                        revisions.length > 1 ? create('span', { class: 'op-versions', text: `${revisions.length}v` }) : null,
                        operator.namesakes.length ? create('span', { class: 'namesake-badge', text: '\u21c4' }) : null
                    ])
                ]),
                create('span', { class: 'op-versions', text: String(dtypes.size) })
            ]);
            tooltip.attach(item, () => [
                `<div class="tt-title">${operator.name}</div>`,
                `<div class="tt-row"><span class="tt-key">domain</span><span style="color:${DOMAIN_COLORS[operator.module]}">${operator.module}</span></div>`,
                `<div class="tt-row"><span class="tt-key">revisions</span><span>${revisions.map((record) => `v${record.version}`).join(', ')}</span></div>`,
                `<div class="tt-row"><span class="tt-key">attributes</span><span>${(app.effective(operator).attributes || []).length}</span></div>`,
                `<div class="tt-row"><span class="tt-key">element types</span><span>${dtypes.size}</span></div>`
            ].join(''));
            items.push(item);
        }

        if (operators.length === 0) {
            items.push(ui.emptyState('Nothing matches. Try clearing filters or the search box.'));
        }
        return items;
    }

    Atlas.renderCatalog = function (app) {
        const filters = document.getElementById('filters');
        filters.replaceChildren(...[
            domainGroup(app),
            categoryGroup(app),
            dtypeGroup(app),
            flagGroup(app),
            activeAttribute(app)
        ].filter(Boolean));

        const count = document.getElementById('list-count');
        const operators = app.filtered();
        count.textContent = app.state.opset
            ? `${integer(operators.length)} operators @ opset ${app.state.opset}`
            : `${integer(operators.length)} operators`;

        const sortSelect = document.getElementById('sort');
        sortSelect.replaceChildren(...SORTS.map((option) => create('option', {
            value: option.id,
            selected: option.id === app.state.sort,
            text: option.label
        })));
        sortSelect.onchange = (event) => app.set({ sort: event.target.value });

        document.getElementById('op-list').replaceChildren(...operatorList(app));
    };
})();
