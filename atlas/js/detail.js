// Operator detail: version ladder, schema inspector, dtype evolution, examples.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { create, svg } = Atlas.dom;
    const { integer, plural, escapeHtml, rangeLabel } = Atlas.format;
    const { DOMAIN_COLORS, DOMAIN_LABELS, CATEGORY_COLORS, dtypeFamily, parseType } = Atlas.color;
    const ui = Atlas.ui;
    const tooltip = Atlas.tooltip;

    function recordDtypes(record) {
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

    function badgeList(operator, record) {
        const badges = [];
        const domainColor = DOMAIN_COLORS[operator.module] || '#64748b';
        badges.push(create('span', { class: 'badge', style: `border-color:${domainColor}66;color:${domainColor}` }, [operator.module]));
        if (operator.category) {
            const color = CATEGORY_COLORS[operator.category] || '#64748b';
            badges.push(create('span', { class: 'badge', style: `border-color:${color}55;color:${color}` }, [operator.category]));
        }
        badges.push(ui.badge(`v${record.version}`, 'muted'));
        badges.push(ui.badge(`${operator.records.length} revision${operator.records.length === 1 ? '' : 's'}`, 'muted'));
        if (record.status) {
            badges.push(ui.badge(record.status, 'warn'));
        }
        if (operator.namesakes.length) {
            badges.push(ui.badge(`${operator.namesakes.length + 1} domains`, 'change'));
        }
        const dtypes = recordDtypes(record);
        badges.push(ui.badge(`${dtypes.size} element types`, 'muted'));
        return create('div', { class: 'op-tags' }, badges);
    }

    // ------------------------------------------------------------- ladder

    function versionLadder(app, operator, record) {
        const domainLatest = Math.max(2, app.model.timeline(operator.module).length || Math.max(...operator.versions));
        const axisMax = Math.max(domainLatest, ...operator.versions);
        const width = Math.max(560, (app.mainWidth() || 1000) - 60);
        const height = 104;
        const pad = { left: 28, right: 28 };
        const railY = 52;
        const usable = width - pad.left - pad.right;
        const x = (version) => pad.left + (axisMax <= 1 ? usable / 2 : ((version - 1) / (axisMax - 1)) * usable);

        const root = svg('svg', { class: 'ladder', viewBox: `0 0 ${width} ${height}`, width, height });
        root.appendChild(svg('line', { class: 'rail', x1: pad.left, x2: width - pad.right, y1: railY, y2: railY, opacity: 0.45 }));
        root.appendChild(svg('line', { class: 'rail-done', x1: x(operator.versions[0]), x2: x(operator.versions[operator.versions.length - 1]), y1: railY, y2: railY }));

        for (let tick = 1; tick <= axisMax; tick++) {
            if (axisMax > 14 && tick % 2 !== 0 && tick !== axisMax) {
                continue;
            }
            root.appendChild(svg('line', { class: 'axis-tick', x1: x(tick), x2: x(tick), y1: railY + 12, y2: railY + 17 }));
            root.appendChild(svg('text', { class: 'axis-text', x: x(tick), y: railY + 28, text: String(tick) }));
        }

        const diffs = [];
        for (let index = 1; index < operator.records.length; index++) {
            const previous = operator.records[index - 1];
            const current = operator.records[index];
            const diff = app.model.diff(previous, current);
            diffs.push(diff);
            const midpoint = (x(previous.version) + x(current.version)) / 2;
            const hasChanges = diff.summary.length > 0;
            const label = hasChanges ? `${diff.summary.length}` : '\u00b7';
            const chip = svg('g', { class: 'step-hit' });
            chip.appendChild(svg('rect', {
                x: midpoint - 11,
                y: railY - 30,
                width: 22,
                height: 16,
                rx: 8,
                fill: hasChanges ? 'rgba(251,191,36,0.14)' : 'rgba(148,163,184,0.12)',
                stroke: hasChanges ? 'rgba(251,191,36,0.6)' : 'rgba(148,163,184,0.35)',
                'stroke-width': 1
            }));
            chip.appendChild(svg('text', {
                class: 'step-label',
                x: midpoint,
                y: railY - 18,
                fill: hasChanges ? '#fbbf24' : '#6b7889',
                text: label
            }));
            root.appendChild(chip);
            tooltip.attach(chip, () => [
                `<div class="tt-title">v${previous.version} \u2192 v${current.version}</div>`,
                hasChanges
                    ? diff.summary.map((item) => `<div class="tt-row"><span class="tt-key">${escapeHtml(item.label)}</span><span>${escapeHtml(item.detail)}</span></div>`).join('')
                    : '<div class="tt-row">schema unchanged</div>'
            ].join(''));
        }

        for (const version of operator.versions) {
            const node = svg('g', {
                class: `node ${version === record.version ? 'selected' : ''}`.trim(),
                onclick: () => app.select(operator.key, version)
            });
            node.appendChild(svg('circle', { cx: x(version), cy: railY, r: version === record.version ? 7 : 5.5 }));
            node.appendChild(svg('text', { class: 'node-label', x: x(version), y: railY + 44, text: `v${version}` }));
            tooltip.attach(node, () => {
                const entry = operator.records.find((item) => item.version === version);
                return `<div class="tt-title">${escapeHtml(operator.name)} · v${version}</div>` +
                    `<div class="tt-row"><span class="tt-key">attributes</span><span>${(entry.attributes || []).length}</span></div>` +
                    `<div class="tt-row"><span class="tt-key">inputs</span><span>${rangeLabel(entry.min_input, entry.max_input)}</span></div>` +
                    `<div class="tt-row"><span class="tt-key">outputs</span><span>${rangeLabel(entry.min_output, entry.max_output)}</span></div>`;
            });
            root.appendChild(node);
        }
        return { svg: root, diffs };
    }

    function diffCards(app, operator, record) {
        const container = create('div', { class: 'diff-cards' });
        if (operator.records.length === 1) {
            container.appendChild(create('div', { class: 'hint-inline', text: 'This operator has a single revision.' }));
            return container;
        }
        for (let index = 1; index < operator.records.length; index++) {
            const previous = operator.records[index - 1];
            const current = operator.records[index];
            const diff = app.model.diff(previous, current);
            const body = diff.summary.length
                ? create('div', { class: 'diff-body' }, diff.summary.slice(0, 8).map((item) => ui.badge(item.label, item.kind === 'added' ? 'add' : item.kind === 'removed' ? 'remove' : 'change')))
                : create('div', { class: 'hint-inline', text: 'no schema change' });
            const card = create('div', {
                class: 'diff-card',
                style: current.version === record.version ? 'border-color:#4c8dff' : null,
                onclick: () => app.select(operator.key, current.version)
            }, [
                create('div', { class: 'diff-head', text: `v${previous.version} \u2192 v${current.version}` }),
                body
            ]);
            if (diff.summary.length) {
                tooltip.attach(card, () => diff.summary.map((item) => `<div class="tt-row"><span class="tt-key">${escapeHtml(item.label)}</span><span>${escapeHtml(item.detail)}</span></div>`).join(''));
            }
            container.appendChild(card);
        }
        return container;
    }

    // -------------------------------------------------------------- schema

    function ioCard(record, side) {
        const singular = side === 'inputs' ? 'input' : 'output';
        const items = record[side] || [];
        if (items.length === 0) {
            return ui.emptyState(`No ${side} declared.`);
        }
        const rows = items.map((item) => {
            const flags = [];
            if (item.list) {
                flags.push('variadic');
            }
            if (item.option) {
                flags.push(item.option);
            }
            return create('div', { class: 'io-row' }, [
                create('div', { class: 'io-name' }, [
                    create('span', { text: item.name }),
                    create('span', { class: 'io-type', text: item.type }),
                    flags.length ? create('div', { class: 'chip-row', style: 'margin-top:2px' }, flags.map((flag) => ui.badge(flag, 'muted'))) : null
                ]),
                create('div', { class: 'io-desc', html: ui.formatDoc(item.description) })
            ]);
        });
        const header = create('div', { class: 'hint-inline', style: 'margin-bottom:8px' }, [
            `arity ${rangeLabel(record[`min_${singular}`], record[`max_${singular}`])}`
        ]);
        return create('div', { class: 'io-card' }, [header, ...rows]);
    }

    function attributesCard(record) {
        const attributes = record.attributes || [];
        if (attributes.length === 0) {
            return ui.emptyState('This revision declares no attributes.');
        }
        const rows = attributes.map((attribute) => create('tr', {}, [
            create('td', {}, [
                create('div', { class: 'attr-name', text: attribute.name }),
                attribute.required ? ui.badge('required', 'warn') : null
            ]),
            create('td', { class: 'attr-type', text: attribute.type }),
            create('td', { class: 'mono', text: attribute.default === undefined ? '\u2014' : JSON.stringify(attribute.default) }),
            create('td', { class: 'attr-desc', html: ui.formatDoc(attribute.description) })
        ]));
        return create('div', { class: 'scroll-x' }, [
            create('table', { class: 'schema' }, [
                create('thead', {}, [create('tr', {}, [
                    create('th', { text: 'Name' }),
                    create('th', { text: 'Type' }),
                    create('th', { text: 'Default' }),
                    create('th', { text: 'Description' })
                ])]),
                create('tbody', {}, rows)
            ])
        ]);
    }

    function constraintsCard(record) {
        const constraints = record.type_constraints || [];
        if (constraints.length === 0) {
            return ui.emptyState('No type constraints declared.');
        }
        return create('div', {}, constraints.map((constraint) => create('div', { class: 'constraint' }, [
            create('div', { class: 'constraint-head' }, [
                create('span', { class: 'constraint-param', text: constraint.type_param_str }),
                ui.badge(`${(constraint.allowed_type_strs || []).length} types`, 'muted')
            ]),
            constraint.description ? create('div', { class: 'constraint-desc', html: ui.formatDoc(constraint.description) }) : null,
            create('div', { class: 'dtype-grid' }, (constraint.allowed_type_strs || []).map((type) => ui.dtypeTag(type)))
        ])));
    }

    function dtypeEvolution(app, operator, record) {
        const rows = [];
        const perVersion = operator.records.map((entry) => ({ version: entry.version, dtypes: recordDtypes(entry) }));
        const union = new Set();
        for (const entry of perVersion) {
            for (const dtype of entry.dtypes) {
                union.add(dtype);
            }
        }
        const ordered = app.model.dtypes.filter((dtype) => union.has(dtype));
        if (ordered.length === 0) {
            return ui.emptyState('No element types declared.');
        }
        for (const dtype of ordered) {
            rows.push(dtype);
        }

        const columns = `170px repeat(${perVersion.length}, 20px)`;
        const grid = create('div', { class: 'mini-matrix', style: `grid-template-columns:${columns}` });
        grid.appendChild(create('div'));
        for (const entry of perVersion) {
            grid.appendChild(create('div', {
                class: 'mm-label',
                style: `text-align:center;padding:0;color:${entry.version === record.version ? '#e6edf6' : '#6b7889'}`,
                text: `v${entry.version}`
            }));
        }
        for (const dtype of rows) {
            const family = dtypeFamily(dtype);
            grid.appendChild(create('div', { class: 'mm-label', text: dtype, title: `${family.label} · ${dtype}` }));
            for (let index = 0; index < perVersion.length; index++) {
                const entry = perVersion[index];
                const previous = index > 0 ? perVersion[index - 1].dtypes : null;
                const on = entry.dtypes.has(dtype);
                const classes = ['mm-cell'];
                if (on) {
                    classes.push('on');
                }
                if (on && previous && !previous.has(dtype)) {
                    classes.push('added');
                }
                if (!on && previous && previous.has(dtype)) {
                    classes.push('removed');
                }
                grid.appendChild(create('div', {
                    class: classes.join(' '),
                    style: on ? `--cell-color:${family.color}` : null,
                    title: `${dtype} @ v${entry.version}: ${on ? 'supported' : 'not supported'}`
                }));
            }
        }
        const first = perVersion[0].dtypes.size;
        const last = perVersion[perVersion.length - 1].dtypes.size;
        const note = create('div', { class: 'hint-inline', style: 'margin-top:10px' }, [
            `${first} element type${first === 1 ? '' : 's'} at v${perVersion[0].version} \u2192 ${last} at v${perVersion[perVersion.length - 1].version}. ` +
            (first === last ? 'Coverage is stable.' : `${last >= first ? '+' : ''}${last - first} across the operator\u2019s lifetime.`)
        ]);
        return create('div', {}, [grid, note]);
    }

    function examplesCard(record) {
        const examples = record.examples || [];
        if (examples.length === 0) {
            return ui.emptyState('No reference example ships with this revision.');
        }
        const body = create('div');
        const tabs = create('div', { class: 'example-tabs' });
        const show = (index) => {
            body.replaceChildren(ui.codeBlock(examples[index].code));
            Array.from(tabs.children).forEach((child, position) => child.classList.toggle('active', position === index));
        };
        examples.forEach((example, index) => {
            tabs.appendChild(create('button', {
                class: 'chip',
                text: example.summary || `example ${index + 1}`,
                onclick: () => show(index)
            }));
        });
        body.appendChild(ui.codeBlock(examples[0].code));
        Array.from(tabs.children)[0].classList.add('active');
        return create('div', {}, [tabs, body]);
    }

    function namesakeCard(app, operator) {
        if (operator.namesakes.length === 0) {
            return ui.emptyState('No other domain defines an operator with this name.');
        }
        return create('div', {}, operator.namesakes.map((other) => {
            const color = DOMAIN_COLORS[other.module] || '#64748b';
            const row = create('div', { class: 'io-row', style: 'cursor:pointer', onclick: () => app.select(other.key) }, [
                create('div', { class: 'io-name' }, [
                    create('span', { style: `color:${color}`, text: DOMAIN_LABELS[other.module] || other.module }),
                    create('span', { class: 'io-type', text: other.module })
                ]),
                create('div', { class: 'io-desc' }, [
                    create('div', { class: 'chip-row' }, [
                        ui.badge(`${other.records.length} revision${other.records.length === 1 ? '' : 's'}`, 'muted'),
                        ui.badge(`v${other.latest.version} latest`, 'muted'),
                        ui.badge(`${(other.latest.attributes || []).length} attrs`, 'muted')
                    ])
                ])
            ]);
            return row;
        }));
    }

    Atlas.viewDetail = function (root, app) {
        const operator = app.selectedOperator();
        if (!operator) {
            root.appendChild(ui.emptyState('Pick an operator from the catalog on the left, or click any tile in the overview.'));
            return;
        }
        const record = app.selectedRecord();

        root.appendChild(create('div', { class: 'op-header' }, [
            create('div', {}, [
                create('div', { class: 'op-title' }, [
                    create('h1', { text: operator.name }),
                    create('span', { class: 'module', text: operator.module })
                ]),
                badgeList(operator, record),
                create('div', { class: 'op-desc', html: ui.formatDoc(record.description || 'No description provided.') })
            ]),
            create('div', { class: 'chip-row' }, [
                create('button', { class: 'chip', text: '\u2194 Compare versions', onclick: () => app.set({ view: 'compare' }) }),
                create('button', { class: 'chip', text: 'Export JSON', onclick: () => Atlas.misc.download(`${operator.module}-${operator.name}-v${record.version}.json`, JSON.stringify(record, null, 2)) })
            ])
        ]));

        root.appendChild(ui.section('Version ladder', 'nodes are opset revisions; the badge counts schema changes since the previous revision',
            ui.card([
                versionLadder(app, operator, record).svg,
                diffCards(app, operator, record)
            ])
        ));

        root.appendChild(ui.section('Signature', `revision v${record.version}`, create('div', { class: 'grid cols-2' }, [
            ui.card([
                create('div', { class: 'section-head' }, [create('div', { class: 'section-title', text: 'Inputs' })]),
                ioCard(record, 'inputs')
            ]),
            ui.card([
                create('div', { class: 'section-head' }, [create('div', { class: 'section-title', text: 'Outputs' })]),
                ioCard(record, 'outputs')
            ])
        ])));

        root.appendChild(ui.section('Type constraints', null, ui.card([
            constraintsCard(record)
        ])));

        root.appendChild(ui.section('Element type coverage over time', 'newly supported types are outlined in green, dropped ones in red',
            ui.card([dtypeEvolution(app, operator, record)])
        ));

        root.appendChild(ui.section('Attributes', `${(record.attributes || []).length} in v${record.version}`, ui.card([
            attributesCard(record)
        ])));

        root.appendChild(ui.section('Reference example', null, ui.card([
            examplesCard(record)
        ])));

        root.appendChild(ui.section('Cross-domain twins', null, ui.card([
            namesakeCard(app, operator)
        ])));

        root.appendChild(create('div', { class: 'hint-inline', text: `Operator ${operator.key} · ${plural(operator.records.length, 'revision')} in the specification.` }));
    };
})();
