// Overview: opset evolution timeline, operator treemap, attribute / dtype landscape.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { create, svg, clear } = Atlas.dom;
    const { integer, plural, escapeHtml } = Atlas.format;
    const { DOMAIN_COLORS, DOMAIN_LABELS, CATEGORY_COLORS, dtypeFamily } = Atlas.color;
    const ui = Atlas.ui;
    const tooltip = Atlas.tooltip;

    const METRICS = [
        { id: 'attributes', label: 'Attributes', hint: 'Schema complexity at the operator level' },
        { id: 'versions', label: 'Versions', hint: 'How many opset revisions an operator went through' },
        { id: 'dtypes', label: 'Dtypes', hint: 'Distinct element types the operator accepts' },
        { id: 'inputs', label: 'Inputs', hint: 'Input slots in the newest revision' }
    ];

    function statTile(value, label, hint) {
        return create('div', { class: 'stat' }, [
            create('div', { class: 'stat-value', text: value }),
            create('div', { class: 'stat-label', text: label }),
            hint ? create('div', { class: 'stat-hint', text: hint }) : null
        ]);
    }

    function statsRow(app, operators) {
        const model = app.model;
        const withVariants = operators.filter((operator) => operator.namesakes.length > 0).length;
        const records = operators.reduce((sum, operator) => sum + app.revisions(operator).length, 0);
        const attributes = operators.reduce((sum, operator) => sum + (app.effective(operator).attributes || []).length, 0);
        const examples = operators.reduce((sum, operator) => sum + (app.effective(operator).examples || []).length, 0);
        const dtypes = new Set();
        for (const operator of operators) {
            for (const dtype of app.dtypes(operator)) {
                dtypes.add(dtype);
            }
        }
        return create('div', { class: 'stats' }, [
            statTile(integer(operators.length), 'Operators', `${model.operators.length} in the full spec`),
            statTile(integer(records), 'Versioned schemas', `across ${new Set(operators.map((operator) => operator.module)).size} domains`),
            statTile(integer(attributes), 'Attributes', `declared at opset ${app.opset()}`),
            statTile(integer(dtypes.size), 'Element types', 'reachable via type constraints'),
            statTile(integer(examples), 'Code examples', 'reference test snippets'),
            statTile(integer(withVariants), 'Cross-domain twins', 'same name, another domain')
        ]);
    }

    // ------------------------------------------------------------- timeline

    function timeline(app, domain) {
        const model = app.model;
        const steps = model.timeline(domain);
        const latest = Math.max(1, steps.length);
        const width = Math.max(680, (app.mainWidth() || 1000) - 28);
        const height = 240;
        const pad = { left: 40, right: 46, top: 18, bottom: 30 };
        const plotWidth = width - pad.left - pad.right;
        const plotHeight = height - pad.top - pad.bottom;
        const band = plotWidth / latest;
        const barWidth = Math.max(6, Math.min(26, band * 0.6));
        const maxTotal = Math.max(1, ...steps.map((step) => step.added.length + step.revised.length));
        const maxActive = Math.max(1, ...steps.map((step) => step.active));
        const selected = app.state.opset;

        const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height });
        root.appendChild(svg('rect', { x: pad.left, y: pad.top, width: plotWidth, height: plotHeight, fill: 'transparent' }));

        // Horizontal guides for the added+revised scale.
        for (let i = 0; i <= 4; i++) {
            const value = (maxTotal / 4) * i;
            const y = pad.top + plotHeight - (value / maxTotal) * plotHeight;
            root.appendChild(svg('line', { class: 'grid-line', x1: pad.left, x2: pad.left + plotWidth, y1: y, y2: y }));
            root.appendChild(svg('text', { class: 'tick-label', x: pad.left - 8, y: y + 3, 'text-anchor': 'end', text: String(Math.round(value)) }));
        }
        root.appendChild(svg('text', { class: 'tick-label', x: pad.left - 8, y: pad.top - 6, 'text-anchor': 'end', text: 'ops' }));
        root.appendChild(svg('text', { class: 'tick-label', x: pad.left + plotWidth + 8, y: pad.top - 6, text: 'total' }));

        const cumulative = [];
        const bars = [];
        for (const step of steps) {
            const centre = pad.left + (step.version - 0.5) * band;
            const addedHeight = (step.added.length / maxTotal) * plotHeight;
            const revisedHeight = (step.revised.length / maxTotal) * plotHeight;
            const base = pad.top + plotHeight;
            const group = svg('g', { class: `bar-group ${selected === step.version ? 'selected' : ''}` });
            if (step.revised.length) {
                group.appendChild(svg('rect', {
                    class: 'bar-revise',
                    x: centre - barWidth / 2,
                    y: base - addedHeight - revisedHeight,
                    width: barWidth,
                    height: Math.max(1.5, revisedHeight),
                    rx: 2
                }));
            }
            if (step.added.length) {
                group.appendChild(svg('rect', {
                    class: 'bar-add',
                    x: centre - barWidth / 2,
                    y: base - addedHeight,
                    width: barWidth,
                    height: Math.max(1.5, addedHeight),
                    rx: 2
                }));
            }
            bars.push(group);
            root.appendChild(group);

            const activeY = pad.top + plotHeight - (step.active / maxActive) * plotHeight;
            cumulative.push([centre, activeY]);

            root.appendChild(svg('rect', {
                class: 'hit',
                x: pad.left + (step.version - 1) * band,
                y: pad.top,
                width: band,
                height: plotHeight,
                onclick: () => app.set({ opset: selected === step.version ? null : step.version, opsetDomain: domain }),
                onmouseenter: (event) => {
                    tooltip.show(timelineTooltip(step), event);
                },
                onmousemove: (event) => tooltip.move(event),
                onmouseleave: () => tooltip.hide()
            }));
        }

        root.appendChild(svg('polyline', {
            class: 'cumulative',
            points: cumulative.map(([x, y]) => `${x},${y}`).join(' ')
        }));
        for (const [x, y] of cumulative) {
            root.appendChild(svg('circle', { class: 'cumulative-dot', cx: x, cy: y, r: 2.4 }));
        }

        root.appendChild(svg('line', { class: 'axis-line', x1: pad.left, x2: pad.left + plotWidth, y1: pad.top + plotHeight, y2: pad.top + plotHeight }));

        const labelEvery = band >= 24 ? 1 : band >= 13 ? 2 : 4;
        for (const step of steps) {
            if (step.version % labelEvery !== 0 && step.version !== 1 && step.version !== latest) {
                continue;
            }
            root.appendChild(svg('text', {
                class: 'tick-label',
                x: pad.left + (step.version - 0.5) * band,
                y: height - 10,
                'text-anchor': 'middle',
                text: String(step.version)
            }));
        }
        root.appendChild(svg('text', { class: 'tick-label', x: pad.left + plotWidth / 2, y: height - 10 + 0, 'text-anchor': 'middle', text: '' }));
        return { svg: root, bars };
    }

    function timelineTooltip(step) {
        const preview = (list, kind) => {
            if (list.length === 0) {
                return '';
            }
            const names = list.slice(0, 8).map((operator) => operator.name).join(', ');
            const more = list.length > 8 ? ` +${list.length - 8}` : '';
            return `<div class="tt-row"><span class="tt-key">${kind}</span><span>${escapeHtml(names + more)}</span></div>`;
        };
        return [
            `<div class="tt-title">Opset ${step.version}</div>`,
            `<div class="tt-row"><span class="tt-key">new</span><span class="tt-add">${step.added.length} operators</span></div>`,
            `<div class="tt-row"><span class="tt-key">revised</span><span>${step.revised.length} operators</span></div>`,
            `<div class="tt-row"><span class="tt-key">active</span><span>${step.active} operators</span></div>`,
            `<div class="tt-row"><span class="tt-key">retired</span><span>${step.removed} not re-versioned up to here</span></div>`,
            preview(step.added, 'added'),
            preview(step.revised, 'changed')
        ].join('');
    }

    function timelineBreakdown(app, domain) {
        const steps = app.model.timeline(domain);
        const step = steps.find((entry) => entry.version === app.state.opset);
        if (!step) {
            return create('div', { class: 'hint-inline', text: 'Select an opset column to inspect what changed in that release.' });
        }
        const chipFor = (operator, kind) => {
            const record = operator.records.find((entry) => entry.version === step.version);
            const element = create('button', {
                class: `chip ${kind === 'added' ? 'active' : ''}`.trim(),
                style: kind === 'added' ? `border-color:${DOMAIN_COLORS[operator.module]}66` : null,
                onclick: () => app.select(operator.key, record)
            }, [
                create('span', { class: 'dot', style: `background:${DOMAIN_COLORS[operator.module]}` }),
                create('span', { text: operator.name }),
                create('span', { class: 'count', text: `v${record.version}` })
            ]);
            tooltip.attach(element, () => `<div class="tt-title">${escapeHtml(operator.name)}</div><div class="tt-row">${escapeHtml(operator.module)}</div>`);
            return element;
        };
        return create('div', { class: 'grid cols-2', style: 'margin-top:12px' }, [
            ui.card([
                create('div', { class: 'section-head' }, [create('div', { class: 'section-title', text: `Opset ${step.version} · ${plural(step.added.length, 'new operator')}` })]),
                step.added.length ? create('div', { class: 'chip-row' }, step.added.map((operator) => chipFor(operator, 'added'))) : create('div', { class: 'hint-inline', text: 'Nothing new in this release.' })
            ]),
            ui.card([
                create('div', { class: 'section-head' }, [create('div', { class: 'section-title', text: `Opset ${step.version} · ${plural(step.revised.length, 'revision')}` })]),
                step.revised.length ? create('div', { class: 'chip-row' }, step.revised.map((operator) => chipFor(operator, 'revised'))) : create('div', { class: 'hint-inline', text: 'No operator was revised in this release.' })
            ])
        ]);
    }

    // -------------------------------------------------------------- treemap

    function metricValue(app, operator) {
        const metric = app.state.metric;
        const record = app.effective(operator);
        if (metric === 'versions') {
            return app.revisions(operator).length;
        }
        if (metric === 'dtypes') {
            return recordDtypes(record).size;
        }
        if (metric === 'inputs') {
            const max = record.max_input || 0;
            return Math.min(max, 24);
        }
        return (record.attributes || []).length;
    }

    // Coloring schemes for the landscape. Churn (how often an operator was
    // revised) is the default because it is what makes this dataset interesting;
    // element-type breadth separates numerically narrow from quantisation-aware ops.
    const REVISION_BUCKETS = [
        { id: 'r1', label: '1 revision', color: '#64748b', max: 1 },
        { id: 'r2', label: '2 – 3 revisions', color: '#3b82f6', max: 3 },
        { id: 'r3', label: '4 – 6 revisions', color: '#22d3ee', max: 6 },
        { id: 'r4', label: '7 – 9 revisions', color: '#fbbf24', max: 9 },
        { id: 'r5', label: '10+ revisions', color: '#f87171', max: Infinity }
    ];

    const DTYPE_CLASSES = [
        { id: 'string', label: 'String capable', color: '#c084fc' },
        { id: 'complex', label: 'Complex capable', color: '#f472b6' },
        { id: 'quantized', label: 'Low precision', color: '#fb923c' },
        { id: 'bool', label: 'Logical (bool)', color: '#facc15' },
        { id: 'integer', label: 'Integer capable', color: '#34d399' },
        { id: 'float', label: 'Floating point only', color: '#60a5fa' },
        { id: 'untyped', label: 'Untyped', color: '#64748b' }
    ];

    const COLOR_SCHEMES = [
        { id: 'revisions', label: 'Spec churn' },
        { id: 'dtypes', label: 'Element types' },
        { id: 'domain', label: 'Domain' },
        { id: 'category', label: 'Category' }
    ];

    const LOW_PRECISION = [
        'int2', 'int4', 'uint2', 'uint4',
        'float4e2m1', 'float6e2m3', 'float6e3m2',
        'float8e4m3fn', 'float8e4m3fnuz', 'float8e5m2', 'float8e5m2fnuz', 'float8e8m0'
    ];

    function revisionBucket(count) {
        for (const bucket of REVISION_BUCKETS) {
            if (count <= bucket.max) {
                return bucket;
            }
        }
        return REVISION_BUCKETS[REVISION_BUCKETS.length - 1];
    }

    function recordDtypes(record) {
        const set = new Set();
        for (const constraint of record.type_constraints || []) {
            for (const type of constraint.allowed_type_strs || []) {
                for (const base of Atlas.color.parseType(type).base) {
                    set.add(base);
                }
            }
        }
        return set;
    }

    function dtypeClass(types) {
        if (types.size === 0) {
            return DTYPE_CLASSES[DTYPE_CLASSES.length - 1];
        }
        if (types.has('string')) {
            return DTYPE_CLASSES[0];
        }
        if (types.has('complex64') || types.has('complex128')) {
            return DTYPE_CLASSES[1];
        }
        for (const dtype of LOW_PRECISION) {
            if (types.has(dtype)) {
                return DTYPE_CLASSES[2];
            }
        }
        if (types.has('bool')) {
            return DTYPE_CLASSES[3];
        }
        for (const dtype of types) {
            if (/^u?int/.test(dtype)) {
                return DTYPE_CLASSES[4];
            }
        }
        return DTYPE_CLASSES[5];
    }

    function colorScheme(app) {
        const id = app.state.treemapColor || 'revisions';
        return COLOR_SCHEMES.find((scheme) => scheme.id === id) || COLOR_SCHEMES[0];
    }

    function tileColor(app, operator) {
        switch (colorScheme(app).id) {
            case 'domain':
                return DOMAIN_COLORS[operator.module] || '#64748b';
            case 'category':
                return CATEGORY_COLORS[operator.category] || '#64748b';
            case 'dtypes':
                return dtypeClass(recordDtypes(app.effective(operator))).color;
            default:
                return revisionBucket(app.revisions(operator).length).color;
        }
    }

    function legendFor(app, operators) {
        switch (colorScheme(app).id) {
            case 'domain':
                return Array.from(new Set(operators.map((operator) => operator.module)))
                    .map((module) => [DOMAIN_COLORS[module] || '#64748b', DOMAIN_LABELS[module] || module]);
            case 'category':
                return Array.from(new Set(operators.map((operator) => operator.category || 'Other')))
                    .sort()
                    .map((category) => [CATEGORY_COLORS[category] || '#64748b', category]);
            case 'dtypes': {
                const present = new Set(operators.map((operator) => dtypeClass(recordDtypes(app.effective(operator))).id));
                return DTYPE_CLASSES.filter((entry) => present.has(entry.id)).map((entry) => [entry.color, entry.label]);
            }
            default:
                return REVISION_BUCKETS.map((bucket) => [bucket.color, bucket.label]);
        }
    }

    function treemap(app, operators) {
        const height = 480;
        const container = create('div', { class: 'treemap', style: `height:${height}px` });
        if (operators.length === 0) {
            container.appendChild(ui.emptyState('No operator matches the current filters.'));
            return container;
        }
        const width = Math.max(680, (app.mainWidth() || 1000) - 28);
        const metric = app.state.metric;

        const groups = new Map();
        for (const operator of operators) {
            if (!groups.has(operator.module)) {
                groups.set(operator.module, []);
            }
            groups.get(operator.module).push(operator);
        }

        const groupItems = [];
        for (const [id, list] of groups) {
            const total = list.reduce((sum, operator) => sum + metricValue(app, operator) + 1, 0);
            groupItems.push({ value: total, id, list });
        }

        const groupRects = Atlas.layoutTreemap(groupItems, 0, 0, width, height);

        for (const rect of groupRects) {
            const group = rect.item;
            const labelHeight = Math.min(20, rect.h * 0.22);
            const floor = create('div', {
                class: 'tile floor',
                style: `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`,
                title: `${group.id} · ${plural(group.list.length, 'operator')}`
            });
            if (rect.w > 54 && rect.h > 26) {
                floor.appendChild(create('div', { class: 'tile-name', text: `${DOMAIN_LABELS[group.id] || group.id} · ${group.list.length}` }));
            }
            container.appendChild(floor);

            const innerX = rect.x + 1.5;
            const innerY = rect.y + labelHeight;
            const innerW = Math.max(1, rect.w - 3);
            const innerH = Math.max(1, rect.h - labelHeight - 1.5);
            const tiles = group.list
                .map((operator) => ({ value: metricValue(app, operator) + 1, operator }))
                .sort((a, b) => b.value - a.value);
            const layout = Atlas.layoutTreemap(tiles, innerX, innerY, innerW, innerH);
            for (const tileRect of layout) {
                const operator = tileRect.item.operator;
                const color = tileColor(app, operator);
                const tile = create('div', {
                    class: 'tile',
                    style: `left:${tileRect.x}px;top:${tileRect.y}px;width:${Math.max(1, tileRect.w - 1)}px;height:${Math.max(1, tileRect.h - 1)}px;` +
                        `background:linear-gradient(160deg,${color}88,${color}2e);border-left:2px solid ${color};border-radius:3px`,
                    onclick: () => app.select(operator.key)
                });
                const showName = tileRect.w > 50 && tileRect.h > 16;
                if (showName) {
                    tile.appendChild(create('div', { class: 'tile-name', text: operator.name }));
                }
                if (tileRect.h > 34 && tileRect.w > 74) {
                    const record = app.effective(operator);
                    const sub = [];
                    if (metric === 'versions') {
                        sub.push(`${app.revisions(operator).length}v`);
                    } else if (metric === 'dtypes') {
                        sub.push(`${recordDtypes(record).size} types`);
                    } else if (metric === 'inputs') {
                        sub.push(`${(record.inputs || []).length} in`);
                    } else {
                        sub.push(`${(record.attributes || []).length} attr`);
                    }
                    tile.appendChild(create('div', { class: 'tile-sub', text: sub.join(' · ') }));
                }
                tooltip.attach(tile, () => treemapTooltip(app, operator));
                container.appendChild(tile);
            }
        }
        return container;
    }

    function treemapTooltip(app, operator) {
        const record = app.effective(operator);
        const revisions = app.revisions(operator);
        const dtypes = recordDtypes(record);
        const classification = dtypeClass(dtypes);
        return [
            `<div class="tt-title">${escapeHtml(operator.name)}</div>`,
            `<div class="tt-row"><span class="tt-key">domain</span><span style="color:${DOMAIN_COLORS[operator.module]}">${operator.module}</span></div>`,
            `<div class="tt-row"><span class="tt-key">revisions</span><span>${revisions.map((entry) => `v${entry.version}`).join(', ')}</span></div>`,
            `<div class="tt-row"><span class="tt-key">at opset ${app.opset()}</span><span>${(record.attributes || []).length} attr · ${(record.inputs || []).length} in · ${(record.outputs || []).length} out · ${dtypes.size} dtypes</span></div>`,
            `<div class="tt-row"><span class="tt-key">class</span><span style="color:${classification.color}">${classification.label}</span></div>`
        ].join('');
    }

    // ------------------------------------------------------------- bar list

    function barList(rows, onPick, colorFor) {
        const list = create('div', { class: 'bars' });
        const max = Math.max(1, ...rows.map((row) => row.value));
        for (const row of rows) {
            const color = colorFor ? colorFor(row) : '#4c8dff';
            const element = create('div', { class: 'bar-row', onclick: () => onPick(row) }, [
                create('div', { class: 'bar-label', text: row.label, title: row.title || row.label }),
                create('div', { class: 'bar-track' }, [
                    create('div', { class: 'bar-fill', style: `width:${(row.value / max) * 100}%;background:${color}` })
                ]),
                create('div', { class: 'bar-value', text: String(row.value) })
            ]);
            if (row.tooltip) {
                tooltip.attach(element, row.tooltip);
            }
            list.appendChild(element);
        }
        return list;
    }

    function attributeLandscape(app, operators) {
        const counts = new Map();
        for (const operator of operators) {
            for (const name of operator.attributeNames) {
                counts.set(name, (counts.get(name) || 0) + 1);
            }
        }
        const rows = Array.from(counts.entries())
            .map(([label, value]) => ({ label, value, title: `${label} — used by ${plural(value, 'operator')}` }))
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
            .slice(0, 16);
        if (rows.length === 0) {
            return ui.emptyState('No attributes in the current selection.');
        }
        return barList(rows, (row) => app.set({ attribute: app.state.attribute === row.label ? null : row.label, view: 'matrix' }), () => '#4c8dff');
    }

    function dtypeLandscape(app, operators) {
        const counts = new Map();
        for (const operator of operators) {
            for (const dtype of app.dtypes(operator)) {
                counts.set(dtype, (counts.get(dtype) || 0) + 1);
            }
        }
        const rows = Array.from(counts.entries())
            .map(([label, value]) => ({ label, value, family: dtypeFamily(label) }))
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
            .slice(0, 16);
        if (rows.length === 0) {
            return ui.emptyState('No type constraints in the current selection.');
        }
        return barList(
            rows,
            (row) => app.set({ dtypes: new Set([row.label]), view: 'matrix' }),
            (row) => row.family.color
        );
    }

    function namesakes(app, operators) {
        const groups = new Map();
        for (const operator of operators) {
            if (operator.namesakes.length === 0) {
                continue;
            }
            if (!groups.has(operator.name)) {
                groups.set(operator.name, []);
            }
            groups.get(operator.name).push(operator);
        }
        if (groups.size === 0) {
            return ui.emptyState('No name collisions inside the current filter.');
        }
        const list = create('div', { class: 'bars' });
        const entries = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
        for (const [name, list2] of entries) {
            const row = create('div', { class: 'bar-row', style: 'grid-template-columns:130px 1fr' }, [
                create('div', { class: 'bar-label', text: name }),
                create('div', { class: 'chip-row' }, list2.map((operator) => {
                    const chip = create('button', {
                        class: 'chip',
                        style: `border-color:${DOMAIN_COLORS[operator.module]}66`,
                        onclick: () => app.select(operator.key)
                    }, [
                        create('span', { class: 'dot', style: `background:${DOMAIN_COLORS[operator.module]}` }),
                        create('span', { text: DOMAIN_LABELS[operator.module] || operator.module }),
                        create('span', { class: 'count', text: `${operator.records.length}v` })
                    ]);
                    return chip;
                }))
            ]);
            list.appendChild(row);
        }
        return list;
    }

    Atlas.viewOverview = function (root, app) {
        const operators = app.filtered();
        const activeDomains = Array.from(app.state.domains);
        const domain = activeDomains.length === 1
            ? activeDomains[0]
            : (app.state.opsetDomain && app.model.domains.some((entry) => entry.id === app.state.opsetDomain) ? app.state.opsetDomain : 'ai.onnx');

        root.appendChild(ui.section('Specification at a glance', `${operators.length} of ${app.model.operators.length} operators in scope`, [
            statsRow(app, operators)
        ]));

        const chart = timeline(app, domain);
        root.appendChild(ui.section(
            'Opset evolution',
            `additions vs. revisions in ${domain}`,
            ui.card([
                create('div', { class: 'chip-row', style: 'margin-bottom:10px' }, app.model.domains.map((entry) => create('button', {
                    class: `chip ${entry.id === domain ? 'active' : ''}`.trim(),
                    onclick: () => app.set({ opsetDomain: entry.id, opset: null })
                }, [
                    create('span', { class: 'dot', style: `background:${DOMAIN_COLORS[entry.id]}` }),
                    create('span', { text: entry.id }),
                    create('span', { class: 'count', text: `${entry.operators} ops` })
                ]))),
                chart.svg,
                create('div', { class: 'legend', style: 'margin-top:8px' }, [
                    legendItem('#4c8dff', 'New operators'),
                    legendItem('#3d4a5c', 'Revisions of existing operators'),
                    legendItem('#34d399', 'Active operators (right axis)')
                ]),
                timelineBreakdown(app, domain)
            ])
        ));

        root.appendChild(ui.section(
            'Operator landscape',
            create('div', { class: 'chip-row' }, [
                create('span', { class: 'hint-inline', text: 'size' }),
                ...METRICS.map((metric) => create('button', {
                    class: `chip ${app.state.metric === metric.id ? 'active' : ''}`.trim(),
                    title: metric.hint,
                    onclick: () => app.set({ metric: metric.id }),
                    text: metric.label
                })),
                create('span', { class: 'hint-inline', text: 'colour' }),
                ...COLOR_SCHEMES.map((scheme) => create('button', {
                    class: `chip ${(app.state.treemapColor || 'revisions') === scheme.id ? 'active' : ''}`.trim(),
                    onclick: () => app.set({ treemapColor: scheme.id }),
                    text: scheme.label
                }))
            ]),
            [
                treemap(app, operators),
                create('div', { class: 'legend' }, legendFor(app, operators).map(([color, label]) => legendItem(color, label)))
            ]
        ));

        root.appendChild(ui.section('Cross-cutting signals', 'click a bar to cross-filter', create('div', { class: 'grid cols-2' }, [
            ui.card([
                create('div', { class: 'section-head' }, [create('div', { class: 'section-title', text: 'Most shared attribute names' })]),
                attributeLandscape(app, operators)
            ]),
            ui.card([
                create('div', { class: 'section-head' }, [create('div', { class: 'section-title', text: 'Element types by operator coverage' })]),
                dtypeLandscape(app, operators)
            ])
        ])));

        root.appendChild(ui.section('Same name, different domain', 'operators that exist in more than one domain', ui.card([
            namesakes(app, operators)
        ])));
    };

    function legendItem(color, label) {
        return create('div', { class: 'legend-item' }, [
            create('span', { class: 'swatch', style: `background:${color}` }),
            create('span', { text: label })
        ]);
    }
})();
