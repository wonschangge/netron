// Turns the flat onnx-metadata.json array into an indexed operator model:
// operators (module/name), per-opset timelines, dtype coverage and a diff
// engine that explains what changed between two versions of an operator.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { parseType, dtypeFamily } = Atlas.color;
    const UNBOUNDED = Atlas.misc.UNBOUNDED;

    function sortedUnique(values) {
        return Array.from(new Set(values)).sort();
    }

    function attributeMap(record) {
        const map = new Map();
        for (const attribute of record.attributes || []) {
            map.set(attribute.name, attribute);
        }
        return map;
    }

    function constraintMap(record) {
        const map = new Map();
        for (const constraint of record.type_constraints || []) {
            const key = (constraint.type_param_str || '').replace(/\s+/g, '');
            map.set(key, constraint);
        }
        return map;
    }

    function variantKey(record) {
        return `${record.module}/${record.name}`;
    }

    Atlas.Model = class Model {
        constructor(records) {
            this.records = records;
            this.operators = [];
            this.byKey = new Map();
            this.byName = new Map();
            this.domains = [];
            this.dtypes = [];
            this.categories = [];
            this.latestOpset = 0;
            this.timelines = new Map();
            this._build();
        }

        _build() {
            const grouped = new Map();
            const domainCounts = new Map();
            const dtypeSet = new Set();
            const categorySet = new Set();

            for (const record of this.records) {
                const key = variantKey(record);
                if (!grouped.has(key)) {
                    grouped.set(key, []);
                }
                grouped.get(key).push(record);
                domainCounts.set(record.module, (domainCounts.get(record.module) || 0) + 1);
                this.latestOpset = Math.max(this.latestOpset, record.version);

                for (const constraint of record.type_constraints || []) {
                    for (const type of constraint.allowed_type_strs || []) {
                        for (const base of parseType(type).base) {
                            dtypeSet.add(base);
                        }
                    }
                }
                if (record.category) {
                    categorySet.add(record.category);
                }
            }

            for (const [key, list] of grouped) {
                list.sort((a, b) => a.version - b.version);
                const operator = this._operator(key, list);
                this.operators.push(operator);
                this.byKey.set(key, operator);
                if (!this.byName.has(operator.name)) {
                    this.byName.set(operator.name, []);
                }
                this.byName.get(operator.name).push(operator);
            }

            this.operators.sort((a, b) => a.name.localeCompare(b.name) || a.module.localeCompare(b.module));
            for (const list of this.byName.values()) {
                list.sort((a, b) => a.module.localeCompare(b.module));
            }

            this.domains = Array.from(domainCounts.keys()).sort().map((id) => ({
                id,
                records: domainCounts.get(id),
                operators: this.operators.filter((operator) => operator.module === id).length,
                latest: Math.max(...this.operators.filter((operator) => operator.module === id).map((operator) => operator.latest.version))
            }));

            const familyOrder = new Map(Atlas.color.DTYPE_FAMILIES.map((family, index) => [family.id, index]));
            this.dtypes = sortedUnique(Array.from(dtypeSet)).sort((a, b) => {
                const orderA = familyOrder.has(dtypeFamily(a).id) ? familyOrder.get(dtypeFamily(a).id) : 99;
                const orderB = familyOrder.has(dtypeFamily(b).id) ? familyOrder.get(dtypeFamily(b).id) : 99;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                return a.localeCompare(b);
            });

            this.categories = sortedUnique(Array.from(categorySet));
        }

        _operator(key, records) {
            const first = records[0];
            const latest = records[records.length - 1];
            const dtypes = new Set();
            const structures = new Set();
            const categories = new Set();
            const attributeNames = new Set();
            let examples = 0;

            for (const record of records) {
                for (const constraint of record.type_constraints || []) {
                    for (const type of constraint.allowed_type_strs || []) {
                        const parsed = parseType(type);
                        for (const base of parsed.base) {
                            dtypes.add(base);
                        }
                        for (const structure of parsed.structures) {
                            structures.add(structure);
                        }
                    }
                }
                for (const attribute of record.attributes || []) {
                    attributeNames.add(attribute.name);
                }
                if (record.category) {
                    categories.add(record.category);
                }
                examples += (record.examples || []).length;
            }

            const path = `${first.module}/${first.name}`;
            return {
                key,
                name: first.name,
                module: first.module,
                path,
                records,
                versions: records.map((record) => record.version),
                first,
                latest,
                dtypes,
                structures,
                categories: Array.from(categories),
                category: latest.category || first.category || null,
                attributeNames,
                examples,
                namesakes: []
            };
        }

        // Links operators that share a name across different domains.
        linkNamesakes() {
            for (const operator of this.operators) {
                operator.namesakes = this.byName.get(operator.name).filter((other) => other.key !== operator.key);
            }
        }

        operator(key) {
            return this.byKey.get(key) || null;
        }

        // Highest-ranked record at or below a given opset version.
        effective(operator, opset) {
            let current = null;
            for (const record of operator.records) {
                if (record.version <= opset) {
                    current = record;
                }
            }
            return current || operator.first;
        }

        // Per-domain opset history: additions, revisions and active operator count.
        timeline(domain) {
            if (this.timelines.has(domain)) {
                return this.timelines.get(domain);
            }
            const operators = this.operators.filter((operator) => operator.module === domain);
            const latest = operators.length ? Math.max(...operators.map((operator) => operator.latest.version)) : 0;
            const steps = [];
            let active = 0;
            for (let version = 1; version <= latest; version++) {
                const added = [];
                const revised = [];
                for (const operator of operators) {
                    const match = operator.records.find((record) => record.version === version);
                    if (!match) {
                        continue;
                    }
                    if (operator.first.version === version) {
                        added.push(operator);
                    } else {
                        revised.push(operator);
                    }
                }
                active += added.length;
                steps.push({
                    version,
                    added,
                    revised,
                    active,
                    removed: operators.filter((operator) => operator.latest.version < version).length
                });
            }
            this.timelines.set(domain, steps);
            return steps;
        }

        // Describes the delta between two records of the same operator.
        diff(from, to) {
            const summary = [];
            const changes = {
                attributesAdded: [],
                attributesRemoved: [],
                attributesChanged: [],
                inputs: null,
                outputs: null,
                constraints: [],
                dtypesAdded: [],
                dtypesRemoved: [],
                descriptionChanged: from.description !== to.description,
                moduleChanged: from.module !== to.module
            };

            const before = attributeMap(from);
            const after = attributeMap(to);
            for (const name of after.keys()) {
                if (!before.has(name)) {
                    changes.attributesAdded.push(after.get(name));
                }
            }
            for (const name of before.keys()) {
                if (!after.has(name)) {
                    changes.attributesRemoved.push(before.get(name));
                }
            }
            for (const name of after.keys()) {
                if (!before.has(name)) {
                    continue;
                }
                const previous = before.get(name);
                const current = after.get(name);
                const fields = [];
                if (previous.type !== current.type) {
                    fields.push(`type ${previous.type} \u2192 ${current.type}`);
                }
                if (String(previous.default) !== String(current.default)) {
                    fields.push(`default ${previous.default === undefined ? '\u2014' : previous.default} \u2192 ${current.default === undefined ? '\u2014' : current.default}`);
                }
                if (Boolean(previous.required) !== Boolean(current.required)) {
                    fields.push(current.required ? 'now required' : 'now optional');
                }
                if (previous.description !== current.description) {
                    fields.push('description updated');
                }
                if (fields.length) {
                    changes.attributesChanged.push({ name, attribute: current, fields });
                }
            }

            const arity = (record, side) => {
                const singular = side === 'inputs' ? 'input' : 'output';
                const min = record[`min_${singular}`];
                const max = record[`max_${singular}`];
                const names = (record[side] || []).map((item) => item.name);
                return { min, max, names, changed: false, added: [], removed: [], rangeChanged: false };
            };
            const compareArity = (side) => {
                const previous = arity(from, side);
                const current = arity(to, side);
                current.rangeChanged = previous.min !== current.min || previous.max !== current.max;
                current.added = current.names.filter((name) => !previous.names.includes(name));
                current.removed = previous.names.filter((name) => !current.names.includes(name));
                current.changed = current.rangeChanged || current.added.length > 0 || current.removed.length > 0;
                if (current.max >= UNBOUNDED && previous.max < UNBOUNDED) {
                    current.changed = true;
                }
                return current;
            };
            changes.inputs = compareArity('inputs');
            changes.outputs = compareArity('outputs');

            const beforeConstraints = constraintMap(from);
            const afterConstraints = constraintMap(to);
            const params = sortedUnique([...beforeConstraints.keys(), ...afterConstraints.keys()]);
            const dtypeAdded = new Set();
            const dtypeRemoved = new Set();
            for (const param of params) {
                const previous = beforeConstraints.get(param);
                const current = afterConstraints.get(param);
                const previousTypes = new Set(previous ? previous.allowed_type_strs || [] : []);
                const currentTypes = new Set(current ? current.allowed_type_strs || [] : []);
                const added = [...currentTypes].filter((type) => !previousTypes.has(type));
                const removed = [...previousTypes].filter((type) => !currentTypes.has(type));
                for (const type of added) {
                    for (const base of parseType(type).base) {
                        dtypeAdded.add(base);
                    }
                }
                for (const type of removed) {
                    for (const base of parseType(type).base) {
                        dtypeRemoved.add(base);
                    }
                }
                const descriptionChanged = Boolean(previous && current) && previous.description !== current.description;
                if (added.length || removed.length || !previous || !current || descriptionChanged) {
                    changes.constraints.push({
                        param,
                        added,
                        removed,
                        descriptionChanged,
                        previousTypes: [...previousTypes],
                        currentTypes: [...currentTypes]
                    });
                }
            }
            changes.dtypesAdded = Array.from(dtypeAdded).sort();
            changes.dtypesRemoved = Array.from(dtypeRemoved).sort();

            for (const attribute of changes.attributesAdded) {
                summary.push({ kind: 'added', label: `+${attribute.name}`, detail: `${attribute.type} attribute added` });
            }
            for (const attribute of changes.attributesRemoved) {
                summary.push({ kind: 'removed', label: `\u2212${attribute.name}`, detail: `${attribute.type} attribute removed` });
            }
            for (const change of changes.attributesChanged) {
                summary.push({ kind: 'changed', label: `~${change.name}`, detail: change.fields.join(', ') });
            }
            if (changes.inputs.changed) {
                const detail = `${Atlas.format.rangeLabel(changes.inputs.min, changes.inputs.max)} inputs`;
                summary.push({ kind: 'changed', label: 'inputs', detail });
            }
            if (changes.outputs.changed) {
                summary.push({ kind: 'changed', label: 'outputs', detail: `${Atlas.format.rangeLabel(changes.outputs.min, changes.outputs.max)} outputs` });
            }
            if (changes.dtypesAdded.length) {
                summary.push({ kind: 'added', label: `+${changes.dtypesAdded.length} dtype${changes.dtypesAdded.length === 1 ? '' : 's'}`, detail: changes.dtypesAdded.join(', ') });
            }
            if (changes.dtypesRemoved.length) {
                summary.push({ kind: 'removed', label: `\u2212${changes.dtypesRemoved.length} dtype${changes.dtypesRemoved.length === 1 ? '' : 's'}`, detail: changes.dtypesRemoved.join(', ') });
            }
            if (changes.descriptionChanged) {
                summary.push({ kind: 'changed', label: 'doc', detail: 'description revised' });
            }

            return { from, to, summary, changes, weight: summary.length };
        }

        opsetSelection(opset) {
            const selected = new Map();
            for (const operator of this.operators) {
                const record = this.effective(operator, opset);
                if (record && record.version <= opset && operator.first.version <= opset) {
                    selected.set(operator.key, record);
                }
            }
            return selected;
        }
    };
})();
