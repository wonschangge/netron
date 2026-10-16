// Shared UI building blocks: floating tooltip, badges, dtype tags, code blocks.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});
    const { create, svg, clear } = Atlas.dom;
    const { escapeHtml } = Atlas.format;
    const { dtypeFamily, DOMAIN_COLORS, DOMAIN_LABELS } = Atlas.color;

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Very small Python highlighter: enough to make the operator examples read well.
    function highlightPython(code) {
        const pattern = new RegExp(
            [
                '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|[fr]?"(?:\\\\.|[^"\\\\\\n])*"|[fr]?\'(?:\\\\.|[^\'\\\\\\n])*\')',
                '(#[^\\n]*)',
                '(\\b(?:import|from|as|def|return|for|in|if|else|elif|with|class|None|True|False|and|or|not|lambda|try|except|finally|raise|assert|while|yield|pass|global|del|is)\\b)',
                '([A-Za-z_]\\w*)(?=\\s*\\()',
                '\\b(\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)\\b'
            ].join('|'),
            'g'
        );
        let out = '';
        let last = 0;
        let match = pattern.exec(code);
        while (match) {
            out += escapeHtml(code.slice(last, match.index));
            if (match[1]) {
                out += `<span class="s">${escapeHtml(match[1])}</span>`;
            } else if (match[2]) {
                out += `<span class="c">${escapeHtml(match[2])}</span>`;
            } else if (match[3]) {
                out += `<span class="k">${escapeHtml(match[3])}</span>`;
            } else if (match[4]) {
                out += `<span class="f">${escapeHtml(match[4])}</span>`;
            } else {
                out += `<span class="n">${escapeHtml(match[5])}</span>`;
            }
            last = match.index + match[0].length;
            match = pattern.exec(code);
        }
        out += escapeHtml(code.slice(last));
        return out;
    }

    // Light formatting for the doc strings: headings, bullets, inline code,
    // emphasis and links. Everything is escaped first, so it is safe to inject.
    function formatDoc(text) {
        if (!text) {
            return '';
        }
        let out = escapeHtml(String(text));
        out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
        out = out.replace(/^#{1,6}[ \t]*(.+)$/gm, '<span class="doc-heading">$1</span>');
        out = out.replace(/^[ \t]*[-*][ \t]+/gm, '\u2022 ');
        out = out.replace(/\n{3,}/g, '\n\n');
        return out;
    }

    const tooltip = {
        element: null,
        ensure() {
            if (!this.element) {
                this.element = create('div', { class: 'tooltip' });
                document.body.appendChild(this.element);
            }
            return this.element;
        },
        show(html, event) {
            const node = this.ensure();
            node.innerHTML = html;
            node.classList.add('visible');
            this.move(event);
        },
        move(event) {
            const node = this.ensure();
            if (!event) {
                return;
            }
            const rect = node.getBoundingClientRect();
            let x = event.clientX + 14;
            let y = event.clientY + 14;
            if (x + rect.width > window.innerWidth - 8) {
                x = event.clientX - rect.width - 14;
            }
            if (y + rect.height > window.innerHeight - 8) {
                y = event.clientY - rect.height - 14;
            }
            node.style.left = `${Math.max(8, x)}px`;
            node.style.top = `${Math.max(8, y)}px`;
        },
        hide() {
            if (this.element) {
                this.element.classList.remove('visible');
            }
        },
        // Binds a tooltip whose content is produced lazily from the event target.
        attach(node, render) {
            const handler = (event) => this.show(typeof render === 'function' ? render(event) : render, event);
            node.addEventListener('mouseenter', handler);
            node.addEventListener('mousemove', (event) => this.move(event));
            node.addEventListener('mouseleave', () => this.hide());
            node.addEventListener('click', () => this.hide());
            return node;
        }
    };

    function badge(text, kind) {
        return create('span', { class: `badge ${kind || ''}`.trim(), text });
    }

    function domainChipText(module) {
        return DOMAIN_LABELS[module] || module;
    }

    function domainSwatch(module, size) {
        return create('span', {
            class: 'dot',
            style: `background:${DOMAIN_COLORS[module] || '#64748b'};width:${size || 7}px;height:${size || 7}px;border-radius:50%;display:inline-block;flex:none`
        });
    }

    function domainBadge(module) {
        return create('span', {
            class: 'badge',
            style: `border-color:${(DOMAIN_COLORS[module] || '#64748b') + '66'};color:${DOMAIN_COLORS[module] || '#94a3b8'}`
        }, [module]);
    }

    function dtypeTag(dtype, extra) {
        const family = dtypeFamily(dtype);
        return create('span', {
            class: `dtype-tag ${extra || ''}`.trim(),
            style: `color:${family.color};border-color:${family.color}55`,
            title: `${family.label} · ${dtype}`
        }, [dtype]);
    }

    function section(title, note, children) {
        return create('div', { class: 'section' }, [
            create('div', { class: 'section-head' }, [
                create('div', { class: 'section-title', text: title }),
                note ? create('div', { class: 'section-note' }, [note]) : null
            ]),
            ...(Array.isArray(children) ? children : [children])
        ]);
    }

    function card(children, extraClass) {
        return create('div', { class: `card ${extraClass || ''}`.trim() }, children);
    }

    function codeBlock(code) {
        return create('pre', { class: 'code', html: highlightPython(code) });
    }

    function emptyState(text) {
        return create('div', { class: 'empty', html: formatDoc(text) });
    }

    function kv(pairs) {
        const rows = [];
        for (const [key, value] of pairs) {
            rows.push(create('div', { class: 'k', text: key }));
            rows.push(create('div', { class: 'v' }, [value]));
        }
        return create('div', { class: 'kv' }, rows);
    }

    // A row of selectable chips used by every filter group.
    function chipRow(items, isActive, onToggle, options) {
        const settings = options || {};
        const row = create('div', { class: 'chip-row' });
        for (const item of items) {
            const active = isActive(item);
            const children = [];
            if (settings.color) {
                children.push(create('span', { class: 'dot', style: `background:${settings.color(item)}` }));
            }
            children.push(create('span', { text: settings.label ? settings.label(item) : item.label || item }));
            if (item.count !== undefined || typeof item === 'object') {
                const count = typeof item === 'object' ? item.count : undefined;
                if (count !== undefined) {
                    children.push(create('span', { class: 'count', text: String(count) }));
                }
            }
            const chip = create('button', {
                class: `chip ${active ? 'active' : ''}`.trim(),
                onclick: () => onToggle(item),
                title: settings.title ? settings.title(item) : null
            }, children);
            if (settings.tooltip) {
                tooltip.attach(chip, settings.tooltip);
            }
            row.appendChild(chip);
        }
        return row;
    }

    Atlas.tooltip = tooltip;
    Atlas.ui = {
        badge,
        card,
        chipRow,
        codeBlock,
        dtypeTag,
        domainBadge,
        domainChipText,
        domainSwatch,
        emptyState,
        escapeRegExp,
        formatDoc,
        highlightPython,
        kv,
        section,
        svg,
        create,
        clear
    };
})();
