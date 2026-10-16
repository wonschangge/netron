// Application shell: state, URL routing, view switching, global controls.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { create } = Atlas.dom;
    const ui = Atlas.ui;

    const VIEWS = [
        { id: 'overview', label: 'Overview' },
        { id: 'detail', label: 'Operator' },
        { id: 'matrix', label: 'Matrix' },
        { id: 'compare', label: 'Compare' }
    ];

    const state = {
        view: 'overview',
        text: '',
        domains: new Set(),
        categories: new Set(),
        dtypes: new Set(),
        flags: new Set(),
        attribute: null,
        metric: 'attributes',
        treemapColor: 'revisions',
        opset: null,
        opsetDomain: 'ai.onnx',
        selectedKey: null,
        selectedVersion: null,
        compareA: null,
        compareB: null,
        matrixSort: 'name',
        matrixCompact: false,
        sort: 'name'
    };

    const scrollMemory = new Map();

    function matchesText(operator, text) {
        if (operator.name.toLowerCase().includes(text) || operator.module.toLowerCase().includes(text)) {
            return true;
        }
        if (operator.category && operator.category.toLowerCase().includes(text)) {
            return true;
        }
        for (const name of operator.attributeNames) {
            if (name.toLowerCase().includes(text)) {
                return true;
            }
        }
        for (const record of operator.records) {
            if (record.description && record.description.toLowerCase().includes(text)) {
                return true;
            }
            for (const attribute of record.attributes || []) {
                if (attribute.name.toLowerCase().includes(text)) {
                    return true;
                }
            }
        }
        return false;
    }

    const app = {
        model: null,
        state,

        mainWidth() {
            const main = document.getElementById('main');
            return main ? Math.max(560, main.clientWidth - 44) : 960;
        },

        // The opset the whole UI is pinned to; null means "latest".
        opset() {
            return state.opset || this.model.latestOpset;
        },

        // Revisions that exist at the current target opset.
        revisions(operator) {
            const limit = this.opset();
            return operator.records.filter((record) => record.version <= limit);
        },

        // Schema of an operator as of the current target opset.
        effective(operator) {
            const limit = this.opset();
            return this.model.effective(operator, limit);
        },

        // Element types an operator supports at the current target opset.
        dtypes(operator) {
            const set = new Set();
            for (const constraint of this.effective(operator).type_constraints || []) {
                for (const type of constraint.allowed_type_strs || []) {
                    for (const base of Atlas.color.parseType(type).base) {
                        set.add(base);
                    }
                }
            }
            return set;
        },

        filtered(options) {
            const settings = options || {};
            const text = state.text.trim().toLowerCase();
            const limit = this.opset();
            return this.model.operators.filter((operator) => {
                if (operator.first.version > limit) {
                    return false;
                }
                if (state.domains.size && !state.domains.has(operator.module)) {
                    return false;
                }
                if (state.categories.size && !operator.categories.some((category) => state.categories.has(category))) {
                    return false;
                }
                if (!settings.ignoreDtypes && state.dtypes.size) {
                    const supported = this.dtypes(operator);
                    let matched = false;
                    for (const dtype of state.dtypes) {
                        if (supported.has(dtype)) {
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        return false;
                    }
                }
                if (state.attribute && !operator.attributeNames.has(state.attribute)) {
                    return false;
                }
                if (state.flags.has('examples') && operator.examples === 0) {
                    return false;
                }
                if (state.flags.has('attributes') && operator.attributeNames.size === 0) {
                    return false;
                }
                if (state.flags.has('multi') && operator.records.length < 2) {
                    return false;
                }
                if (state.flags.has('namesake') && operator.namesakes.length === 0) {
                    return false;
                }
                if (text && !matchesText(operator, text)) {
                    return false;
                }
                return true;
            });
        },

        selectedOperator() {
            return state.selectedKey ? this.model.operator(state.selectedKey) : null;
        },

        selectedRecord() {
            const operator = this.selectedOperator();
            if (!operator) {
                return null;
            }
            const record = operator.records.find((entry) => entry.version === state.selectedVersion) || operator.latest;
            // The target opset wins over an explicit (newer) selection so the
            // detail view never shows a schema that does not exist yet.
            if (state.opset && record.version > state.opset) {
                return this.model.effective(operator, state.opset);
            }
            return record;
        },

        select(key, versionOrRecord) {
            const operator = this.model.operator(key);
            if (!operator) {
                return;
            }
            let version = operator.latest.version;
            if (typeof versionOrRecord === 'number') {
                version = versionOrRecord;
            } else if (versionOrRecord && typeof versionOrRecord === 'object') {
                version = versionOrRecord.version;
            }
            if (!operator.versions.includes(version)) {
                version = operator.latest.version;
            }
            state.selectedKey = key;
            state.selectedVersion = version;
            state.view = 'detail';
            render(true);
        },

        set(patch) {
            for (const key of Object.keys(patch)) {
                state[key] = patch[key];
            }
            render(true);
        },

        tooltip: Atlas.tooltip
    };

    Atlas.app = app;

    // ------------------------------------------------------------- routing

    // The hash is the authoritative representation of these fields, so they are
    // reset before reading it: navigating from `#opset=1` to `#view=matrix` must
    // clear the opset instead of inheriting it from the previous state.
    function parseHash() {
        state.view = 'overview';
        state.text = '';
        state.opset = null;
        state.opsetDomain = 'ai.onnx';
        state.metric = 'attributes';
        state.treemapColor = 'revisions';
        state.selectedKey = null;
        state.selectedVersion = null;

        const params = new URLSearchParams(location.hash.replace(/^#/, ''));
        if (params.has('view') && VIEWS.some((view) => view.id === params.get('view'))) {
            state.view = params.get('view');
        }
        if (params.has('q')) {
            state.text = params.get('q');
        }
        if (params.has('opset')) {
            const value = Number(params.get('opset'));
            state.opset = Number.isFinite(value) && value > 0 ? value : null;
        }
        if (params.has('domain')) {
            state.opsetDomain = params.get('domain');
        }
        if (params.has('metric')) {
            state.metric = params.get('metric');
        }
        if (params.has('color')) {
            state.treemapColor = params.get('color');
        }
        if (params.has('op')) {
            const raw = params.get('op');
            const at = raw.lastIndexOf('@');
            const key = at > 0 ? raw.slice(0, at) : raw;
            const version = at > 0 ? Number(raw.slice(at + 1)) : null;
            if (app.model.operator(key)) {
                state.selectedKey = key;
                state.selectedVersion = version || app.model.operator(key).latest.version;
                if (!params.has('view')) {
                    state.view = 'detail';
                }
            }
        }
    }

    function writeHash() {
        const params = new URLSearchParams();
        params.set('view', state.view);
        if (state.selectedKey) {
            params.set('op', `${state.selectedKey}@${state.selectedVersion}`);
        }
        if (state.opset) {
            params.set('opset', String(state.opset));
        }
        if (state.opsetDomain && state.opsetDomain !== 'ai.onnx') {
            params.set('domain', state.opsetDomain);
        }
        if (state.metric !== 'attributes') {
            params.set('metric', state.metric);
        }
        if (state.treemapColor && state.treemapColor !== 'revisions') {
            params.set('color', state.treemapColor);
        }
        if (state.text) {
            params.set('q', state.text);
        }
        history.replaceState(null, '', `#${params.toString()}`);
    }

    // -------------------------------------------------------------- chrome

    function renderTopbar() {
        const tabs = document.getElementById('tabs');
        tabs.replaceChildren(...VIEWS.map((view) => create('button', {
            class: state.view === view.id ? 'active' : '',
            text: view.label,
            onclick: () => app.set({ view: view.id })
        })));

        const select = document.getElementById('opset');
        const options = [create('option', { value: '', selected: state.opset === null, text: 'Latest opset' })];
        for (let version = app.model.latestOpset; version >= 1; version--) {
            options.push(create('option', { value: String(version), selected: state.opset === version, text: `Opset ${version}` }));
        }
        select.replaceChildren(...options);
        select.onchange = (event) => app.set({ opset: event.target.value ? Number(event.target.value) : null });

        const search = document.getElementById('search');
        if (search.value !== state.text) {
            search.value = state.text;
        }
    }

    function renderSidebarFoot() {
        const foot = document.getElementById('sidebar-foot');
        const manifest = globalThis.ONNX_METADATA_MANIFEST || {};
        foot.replaceChildren(create('div', {}, [
            create('div', { class: 'hint-inline', text: `${manifest.records || 0} schemas · ${manifest.operators || 0} operators · opset ≤ ${manifest.latestOpset || '?'}` }),
            create('div', { class: 'hint-inline', text: `source/${(manifest.source || 'onnx-metadata.json').split('/').pop()}` })
        ]));
    }

    let renderedView = null;

    function render(push) {
        const main = document.getElementById('main');
        if (renderedView) {
            scrollMemory.set(renderedView, main.scrollTop);
        }
        renderTopbar();
        renderSidebarFoot();
        Atlas.renderCatalog(app);

        const view = {
            overview: Atlas.viewOverview,
            detail: Atlas.viewDetail,
            matrix: Atlas.viewMatrix,
            compare: Atlas.viewCompare
        }[state.view] || Atlas.viewOverview;

        const container = create('div', { class: 'view' });
        view(container, app);
        main.replaceChildren(container);
        main.scrollTop = scrollMemory.get(state.view) || 0;
        renderedView = state.view;

        if (push !== false) {
            writeHash();
        }
        Atlas.tooltip.hide();
    }

    // ---------------------------------------------------------------- boot

    function boot() {
        const records = globalThis.ONNX_METADATA;
        const main = document.getElementById('main');
        if (!Array.isArray(records)) {
            main.appendChild(create('div', { class: 'view' }, [
                ui.emptyState('Could not find the dataset. Run `node tools/onnx-atlas/build-data.js` to generate `data/onnx-metadata.js`, then reload.')
            ]));
            return;
        }

        app.model = new Atlas.Model(records);
        app.model.linkNamesakes();

        const search = document.getElementById('search');
        const commit = Atlas.misc.debounce(() => app.set({ text: search.value }), 160);
        search.addEventListener('input', commit);
        search.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                app.set({ text: search.value });
            }
            if (event.key === 'Escape') {
                search.value = '';
                app.set({ text: '' });
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === '/' && document.activeElement !== search) {
                event.preventDefault();
                search.focus();
            }
        });

        // `popstate` covers history traversal, `hashchange` covers edits to the
        // fragment and links within the same document. Both re-read the hash.
        // Our own updates use history.replaceState, which fires neither.
        window.addEventListener('popstate', () => {
            parseHash();
            render(false);
        });
        window.addEventListener('hashchange', () => {
            parseHash();
            render(false);
        });

        window.addEventListener('resize', Atlas.misc.debounce(() => render(false), 180));

        parseHash();
        render(false);
    }

    boot();
})();
