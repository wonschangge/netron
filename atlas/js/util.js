// Small DOM / formatting / colour helpers shared by every atlas view.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const SVG = 'http://www.w3.org/2000/svg';
    const UNBOUNDED = 1000000;

    function append(node, child) {
        if (child === null || child === undefined || child === false) {
            return;
        }
        if (Array.isArray(child)) {
            for (const item of child) {
                append(node, item);
            }
            return;
        }
        node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    }

    function create(tag, attributes, children, namespace) {
        const node = namespace ? document.createElementNS(namespace, tag) : document.createElement(tag);
        if (attributes) {
            for (const name of Object.keys(attributes)) {
                const value = attributes[name];
                if (value === null || value === undefined || value === false) {
                    continue;
                }
                if (name === 'text') {
                    node.textContent = String(value);
                } else if (name === 'html') {
                    node.innerHTML = value;
                } else if (name.startsWith('on') && typeof value === 'function') {
                    node.addEventListener(name.slice(2).toLowerCase(), value);
                } else if (name === 'class') {
                    node.setAttribute('class', value);
                } else {
                    node.setAttribute(name, value === true ? '' : String(value));
                }
            }
        }
        append(node, children);
        return node;
    }

    function clear(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
        return node;
    }

    function formatInteger(value) {
        return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function rangeLabel(min, max) {
        if (max >= UNBOUNDED) {
            return `${min} – \u221E`;
        }
        return min === max ? String(min) : `${min} – ${max}`;
    }

    function plural(count, one, many) {
        return `${count} ${count === 1 ? one : many || one + 's'}`;
    }

    // Domain -> hue. Keeps every module visually distinguishable.
    const DOMAIN_COLORS = {
        'ai.onnx': '#4c8dff',
        'ai.onnx.ml': '#34d399',
        'ai.onnx.preview': '#c084fc',
        'ai.onnx.preview.training': '#a78bfa',
        'com.microsoft': '#f59e0b',
        'com.microsoft.nchwc': '#f87171',
        'com.ms.internal.nhwc': '#22d3ee'
    };

    const DOMAIN_LABELS = {
        'ai.onnx': 'Core',
        'ai.onnx.ml': 'Classical ML',
        'ai.onnx.preview': 'Preview',
        'ai.onnx.preview.training': 'Training',
        'com.microsoft': 'Contrib',
        'com.microsoft.nchwc': 'NCHWc',
        'com.ms.internal.nhwc': 'Internal NHWC'
    };

    const CATEGORY_COLORS = {
        Activation: '#f472b6',
        Attention: '#a78bfa',
        Constant: '#94a3b8',
        Data: '#22d3ee',
        Dropout: '#fb923c',
        Layer: '#4c8dff',
        Normalization: '#34d399',
        Pool: '#facc15',
        Shape: '#f87171',
        Tensor: '#60a5fa',
        Transform: '#c084fc',
        Other: '#64748b'
    };

    const DTYPE_FAMILIES = [
        { id: 'float', label: 'Float', color: '#60a5fa', match: /^(float|double|bfloat16)/ },
        { id: 'quantized', label: 'Low precision', color: '#fb923c', match: /^(float[468]e|int2$|int4$|uint2$|uint4$)/ },
        { id: 'int', label: 'Signed int', color: '#34d399', match: /^int/ },
        { id: 'uint', label: 'Unsigned int', color: '#22d3ee', match: /^uint/ },
        { id: 'bool', label: 'Bool', color: '#facc15', match: /^bool$/ },
        { id: 'string', label: 'String', color: '#c084fc', match: /^string$/ },
        { id: 'complex', label: 'Complex', color: '#f472b6', match: /^complex/ }
    ];

    function dtypeFamily(dtype) {
        for (const family of DTYPE_FAMILIES) {
            if (family.match.test(dtype)) {
                return family;
            }
        }
        return { id: 'other', label: 'Other', color: '#94a3b8', match: /./ };
    }

    // Wrapper kinds a type string can carry: seq(tensor(float)), optional(...), etc.
    function parseType(type) {
        const structures = [];
        if (/(^|[^_])seq\(/.test(type)) {
            structures.push('seq');
        }
        if (/optional\(/.test(type)) {
            structures.push('optional');
        }
        if (/sparse_tensor\(/.test(type)) {
            structures.push('sparse');
        }
        if (/map\(/.test(type)) {
            structures.push('map');
        }
        const base = [];
        const re = /tensor\(([a-z0-9_]+)\)/g;
        let match = re.exec(type);
        while (match) {
            base.push(match[1]);
            match = re.exec(type);
        }
        if (base.length === 0) {
            const map = /^map\(([a-z0-9_]+),\s*([a-z0-9_]+)\)$/.exec(type);
            if (map) {
                base.push(map[1], map[2]);
            } else {
                base.push(type);
            }
        }
        return { structures, base };
    }

    function debounce(fn, delay) {
        let handle = null;
        return function (...args) {
            if (handle) {
                clearTimeout(handle);
            }
            handle = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function download(name, text) {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    Atlas.dom = { create, svg: (tag, attributes, children) => create(tag, attributes, children, SVG), clear, append };
    Atlas.format = { integer: formatInteger, escapeHtml, rangeLabel, plural };
    Atlas.color = { DOMAIN_COLORS, DOMAIN_LABELS, CATEGORY_COLORS, DTYPE_FAMILIES, dtypeFamily, parseType };
    Atlas.misc = { debounce, download, UNBOUNDED };
})();
