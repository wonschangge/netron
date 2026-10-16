// Compare: schema-level diff between any two revisions of one operator.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { create } = Atlas.dom;
    const { escapeHtml, rangeLabel } = Atlas.format;
    const { dtypeFamily, parseType } = Atlas.color;
    const ui = Atlas.ui;

    function versionFor(operator, value, fallbackIndex) {
        if (value !== null && value !== undefined && operator.versions.includes(value)) {
            return value;
        }
        return operator.versions[Math.max(0, Math.min(operator.versions.length - 1, fallbackIndex))];
    }

    function versionSelect(app, operator, side, value) {
        const select = create('select', {
            onchange: (event) => app.set({ [side === 'a' ? 'compareA' : 'compareB']: Number(event.target.value) })
        }, operator.versions.map((version) => create('option', {
            value: String(version),
            selected: version === value,
            text: `v${version}`
        })));
        return select;
    }

    function attributeTable(record, diff, side) {
        const attributes = record.attributes || [];
        if (attributes.length === 0) {
            return ui.emptyState('No attributes.');
        }
        const added = new Set(diff ? diff.changes.attributesAdded.map((attribute) => attribute.name) : []);
        const removed = new Set(diff ? diff.changes.attributesRemoved.map((attribute) => attribute.name) : []);
        const changed = new Set(diff ? diff.changes.attributesChanged.map((change) => change.name) : []);
        const rows = attributes.map((attribute) => {
            const marker = side === 'b' && added.has(attribute.name) ? 'added' : changed.has(attribute.name) ? 'changed' : null;
            const row = create('tr', { class: marker ? `row-${marker}` : null }, [
                create('td', {}, [
                    create('div', { class: 'attr-name', text: attribute.name }),
                    marker ? ui.badge(marker, marker === 'added' ? 'add' : 'change') : null
                ]),
                create('td', { class: 'attr-type', text: attribute.type }),
                create('td', { class: 'mono', text: attribute.default === undefined ? '\u2014' : JSON.stringify(attribute.default) }),
                create('td', { class: 'attr-desc', html: ui.formatDoc(attribute.description) })
            ]);
            return row;
        });
        return create('div', { class: 'scroll-x' }, [
            create('table', { class: 'schema' }, [
                create('thead', {}, [create('tr', {}, [
                    create('th', { text: 'Attribute' }),
                    create('th', { text: 'Type' }),
                    create('th', { text: 'Default' }),
                    create('th', { text: 'Description' })
                ])]),
                create('tbody', {}, rows)
            ])
        ]);
    }

    function ioList(record, side, direction) {
        const singular = direction === 'inputs' ? 'input' : 'output';
        const items = record[direction] || [];
        const head = create('div', { class: 'hint-inline', style: 'margin-bottom:6px' }, [
            `${direction}: ${rangeLabel(record[`min_${singular}`], record[`max_${singular}`])}`
        ]);
        const rows = items.map((item) => create('div', { class: 'io-row' }, [
            create('div', { class: 'io-name' }, [
                create('span', { text: item.name }),
                create('span', { class: 'io-type', text: item.type })
            ]),
            create('div', { class: 'io-desc', html: ui.formatDoc(item.description) })
        ]));
        return create('div', {}, [head, ...rows]);
    }

    function constraintList(record, diff, side) {
        const constraints = record.type_constraints || [];
        if (constraints.length === 0) {
            return ui.emptyState('No type constraints.');
        }
        return create('div', {}, constraints.map((constraint) => {
            const key = (constraint.type_param_str || '').replace(/\s+/g, '');
            const entry = diff ? diff.changes.constraints.find((item) => item.param === key) : null;
            const added = new Set();
            const removed = new Set();
            if (entry) {
                if (side === 'b') {
                    for (const type of entry.added) {
                        for (const base of parseType(type).base) {
                            added.add(base);
                        }
                    }
                } else {
                    for (const type of entry.removed) {
                        for (const base of parseType(type).base) {
                            removed.add(base);
                        }
                    }
                }
            }
            return create('div', { class: 'constraint' }, [
                create('div', { class: 'constraint-head' }, [
                    create('span', { class: 'constraint-param', text: constraint.type_param_str }),
                    entry && entry.added.length && side === 'b' ? ui.badge(`+${entry.added.length}`, 'add') : null,
                    entry && entry.removed.length && side === 'a' ? ui.badge(`\u2212${entry.removed.length}`, 'remove') : null
                ]),
                constraint.description ? create('div', { class: 'constraint-desc', html: ui.formatDoc(constraint.description) }) : null,
                create('div', { class: 'dtype-grid' }, (constraint.allowed_type_strs || []).map((type) => {
                    const bases = parseType(type).base;
                    const isAdded = bases.some((base) => added.has(base));
                    const isRemoved = bases.some((base) => removed.has(base));
                    const tag = ui.dtypeTag(type);
                    if (isAdded || isRemoved) {
                        tag.style.boxShadow = `0 0 0 1.5px ${isAdded ? '#34d399' : '#f87171'}`;
                    }
                    return tag;
                }))
            ]);
        }));
    }

    function sideCard(app, operator, record, side, diff) {
        const changed = diff && side === 'b' && diff.changes.descriptionChanged;
        return create('div', { class: 'compare-side' }, [
            create('div', { class: 'side-head' }, [
                create('span', { text: `${operator.name} · v${record.version}` }),
                versionSelect(app, operator, side, record.version)
            ]),
            create('div', { class: 'side-body' }, [
                create('div', { class: 'section' }, [
                    create('div', { class: 'section-title', style: 'margin-bottom:6px', text: 'Description' }),
                    create('div', {
                        class: 'attr-desc desc-clip',
                        style: changed ? 'border-left:2px solid #fbbf24;padding-left:8px' : null,
                        html: ui.formatDoc(record.description || '\u2014')
                    })
                ]),
                create('div', { class: 'section' }, [
                    create('div', { class: 'section-title', style: 'margin-bottom:6px', text: 'Inputs' }),
                    ioList(record, side, 'inputs')
                ]),
                create('div', { class: 'section' }, [
                    create('div', { class: 'section-title', style: 'margin-bottom:6px', text: 'Outputs' }),
                    ioList(record, side, 'outputs')
                ]),
                create('div', { class: 'section' }, [
                    create('div', { class: 'section-title', style: 'margin-bottom:6px', text: 'Type constraints' }),
                    constraintList(record, diff, side)
                ]),
                create('div', { class: 'section' }, [
                    create('div', { class: 'section-title', style: 'margin-bottom:6px', text: 'Attributes' }),
                    attributeTable(record, diff, side)
                ])
            ])
        ]);
    }

    Atlas.viewCompare = function (root, app) {
        const operator = app.selectedOperator();
        if (!operator) {
            root.appendChild(ui.emptyState('Select an operator first \u2014 the comparison view diffs two of its revisions.'));
            return;
        }
        const indexB = operator.versions.length - 1;
        const indexA = Math.max(0, indexB - 1);
        const versionA = versionFor(operator, app.state.compareA, indexA);
        const versionB = versionFor(operator, app.state.compareB, indexB);
        const recordA = operator.records.find((record) => record.version === versionA);
        const recordB = operator.records.find((record) => record.version === versionB);
        const diff = versionA === versionB ? null : app.model.diff(recordA, recordB);

        const summary = create('div', { class: 'diff-list' });
        if (!diff) {
            summary.appendChild(create('div', { class: 'hint-inline', text: 'Both sides point at the same revision.' }));
        } else if (diff.summary.length === 0) {
            summary.appendChild(create('div', { class: 'hint-inline', text: 'No schema-level differences between these revisions.' }));
        } else {
            for (const item of diff.summary) {
                summary.appendChild(create('div', { class: `diff-line ${item.kind}` }, [
                    create('span', { class: 'diff-label', text: item.label }),
                    create('span', { class: 'diff-detail', text: item.detail })
                ]));
            }
        }

        root.appendChild(create('div', { class: 'view-head' }, [
            create('div', {}, [
                create('div', { class: 'view-title', text: `Compare ${operator.name}` }),
                create('div', { class: 'view-sub', text: `${operator.module} · ${operator.versions.map((version) => `v${version}`).join(' \u2192 ')}` })
            ]),
            create('div', { class: 'chip-row' }, [
                create('button', { class: 'chip', text: '\u2190 Back to detail', onclick: () => app.set({ view: 'detail' }) }),
                create('button', {
                    class: 'chip',
                    text: 'Swap',
                    onclick: () => app.set({ compareA: versionB, compareB: versionA })
                })
            ])
        ]));

        root.appendChild(ui.section('What changed', `v${versionA} \u2192 v${versionB}`, ui.card([summary])));
        root.appendChild(ui.section('Schema side by side', 'green marks what the newer revision adds, red what it drops', create('div', { class: 'compare-grid' }, [
            sideCard(app, operator, recordA, 'a', diff),
            sideCard(app, operator, recordB, 'b', diff)
        ])));
    };
})();
