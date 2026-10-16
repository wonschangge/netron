// Matrix: every operator against every element type it can carry.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { create } = Atlas.dom;
    const { rangeLabel } = Atlas.format;
    const { DOMAIN_COLORS, DTYPE_FAMILIES, dtypeFamily, parseType } = Atlas.color;
    const ui = Atlas.ui;
    const tooltip = Atlas.tooltip;

    function effectiveDtypes(record) {
        const set = new Set();
        for (const constraint of record.type_constraints || []) {
            for (const type of constraint.allowed_type_strs || []) {
                for (const base of parseType(type).base) {
                    set.add(base);
                }
            }
        }
        return set;
    }

    Atlas.viewMatrix = function (root, app) {
        const model = app.model;
        const opset = app.opset();
        const operators = app.filtered();

        const rows = operators.map((operator) => ({
            operator,
            record: app.effective(operator),
            dtypes: app.dtypes(operator)
        }));

        const usedDtypes = new Set();
        for (const row of rows) {
            for (const dtype of row.dtypes) {
                usedDtypes.add(dtype);
            }
        }
        let columns = model.dtypes.filter((dtype) => usedDtypes.has(dtype));
        if (app.state.matrixCompact && app.state.dtypes.size > 0) {
            columns = columns.filter((dtype) => app.state.dtypes.has(dtype));
        }

        const sort = app.state.matrixSort || 'name';
        rows.sort((a, b) => {
            if (sort === 'coverage') {
                return b.dtypes.size - a.dtypes.size || a.operator.name.localeCompare(b.operator.name);
            }
            if (sort === 'versions') {
                return b.operator.records.length - a.operator.records.length || a.operator.name.localeCompare(b.operator.name);
            }
            if (sort === 'domain') {
                return a.operator.module.localeCompare(b.operator.module) || a.operator.name.localeCompare(b.operator.name);
            }
            return a.operator.name.localeCompare(b.operator.name) || a.operator.module.localeCompare(b.operator.module);
        });

        root.appendChild(ui.section('Element type matrix', `${rows.length} operators × ${columns.length} element types at opset ${opset}`, [
            create('div', { class: 'matrix-controls' }, [
                create('div', { class: 'chip-row' }, [
                    create('span', { class: 'hint-inline', text: 'Sort' }),
                    ...[
                        { id: 'name', label: 'Name' },
                        { id: 'coverage', label: 'Coverage' },
                        { id: 'versions', label: 'Revisions' },
                        { id: 'domain', label: 'Domain' }
                    ].map((option) => create('button', {
                        class: `chip ${sort === option.id ? 'active' : ''}`.trim(),
                        text: option.label,
                        onclick: () => app.set({ matrixSort: option.id })
                    }))
                ]),
                create('div', { class: 'chip-row' }, [
                    create('button', {
                        class: `chip ${app.state.matrixCompact ? 'active' : ''}`.trim(),
                        text: 'Only filtered types',
                        title: 'Restrict columns to the element types selected in the sidebar',
                        onclick: () => app.set({ matrixCompact: !app.state.matrixCompact })
                    })
                ]),
                create('div', { class: 'legend' }, DTYPE_FAMILIES.filter((family) => columns.some((dtype) => dtypeFamily(dtype).id === family.id)).map((family) => create('div', { class: 'legend-item' }, [
                    create('span', { class: 'swatch', style: `background:${family.color}` }),
                    create('span', { text: family.label })
                ])))
            ]),
            matrixTable(app, rows, columns, opset)
        ]));
    };

    function matrixTable(app, rows, columns, opset) {
        const scroll = create('div', { class: 'matrix-scroll' });
        const table = create('table', { class: 'matrix' });

        const headRow = create('tr');
        headRow.appendChild(create('th', { class: 'op-col', text: 'Operator' }));
        for (const dtype of columns) {
            const family = dtypeFamily(dtype);
            headRow.appendChild(create('th', {}, [
                create('span', { class: 'dtype-head' }, [
                    create('span', { class: 'family-dot', style: `background:${family.color}` }),
                    create('span', { text: dtype })
                ])
            ]));
        }
        table.appendChild(create('thead', {}, [headRow]));

        const body = create('tbody');
        for (const row of rows) {
            const tr = create('tr');
            const nameCell = create('th', {
                class: 'op-cell',
                onclick: () => app.select(row.operator.key)
            }, [
                create('span', { class: 'op-cell-name', text: row.operator.name }),
                create('span', { class: 'op-cell-module', text: row.operator.module })
            ]);
            tooltip.attach(nameCell, () => [
                `<div class="tt-title">${row.operator.name}</div>`,
                `<div class="tt-row"><span class="tt-key">domain</span><span style="color:${DOMAIN_COLORS[row.operator.module]}">${row.operator.module}</span></div>`,
                `<div class="tt-row"><span class="tt-key">at opset ${opset}</span><span>v${row.record.version}</span></div>`,
                `<div class="tt-row"><span class="tt-key">dtypes</span><span>${row.dtypes.size}</span></div>`,
                `<div class="tt-row"><span class="tt-key">inputs</span><span>${rangeLabel(row.record.min_input, row.record.max_input)}</span></div>`
            ].join(''));
            tr.appendChild(nameCell);

            for (const dtype of columns) {
                const family = dtypeFamily(dtype);
                const on = row.dtypes.has(dtype);
                const cell = create('span', {
                    class: `cell ${on ? 'on' : 'off'}`,
                    style: on ? `--cell-color:${family.color}` : null,
                    onclick: () => app.select(row.operator.key, row.record.version)
                });
                const td = create('td', {}, [cell]);
                tooltip.attach(td, () => [
                    `<div class="tt-title">${row.operator.name} · ${dtype}</div>`,
                    `<div class="tt-row">${on ? '<span class="tt-add">supported</span>' : '<span class="tt-remove">not supported</span>'}<span>at v${row.record.version}</span></div>`,
                    `<div class="tt-row"><span class="tt-key">family</span><span>${family.label}</span></div>`
                ].join(''));
                tr.appendChild(td);
            }
            body.appendChild(tr);
        }
        table.appendChild(body);
        scroll.appendChild(table);
        return scroll;
    }
})();
