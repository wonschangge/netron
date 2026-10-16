// Squarified treemap layout (Bruls, Huizing & van Wijk) in plain ECMAScript.
(function () {
    'use strict';

    const Atlas = (globalThis.Atlas = globalThis.Atlas || {});

    function worstRatio(row, side, scale) {
        let sum = 0;
        let max = -Infinity;
        let min = Infinity;
        for (const node of row) {
            const area = node.value * scale;
            sum += area;
            if (area > max) {
                max = area;
            }
            if (area < min) {
                min = area;
            }
        }
        if (sum <= 0 || min <= 0) {
            return Infinity;
        }
        const square = side * side;
        return Math.max((square * max) / (sum * sum), (sum * sum) / (square * min));
    }

    // Lays one row along the shorter side of the remaining rectangle and returns
    // the rectangle that is left over. `side` must match the side used by
    // worstRatio, i.e. the length of the strip.
    function placeRow(row, free, scale, out) {
        let sum = 0;
        for (const node of row) {
            sum += node.value * scale;
        }
        const side = Math.min(free.w, free.h);
        if (side <= 0) {
            return { x: free.x, y: free.y, w: 0, h: 0 };
        }
        const thickness = sum / side;
        if (free.h <= free.w) {
            // Landscape: a vertical column on the left, items stacked top to bottom.
            let y = free.y;
            for (const node of row) {
                const height = thickness > 0 ? (node.value * scale) / thickness : 0;
                out.push({ item: node.item, x: free.x, y, w: thickness, h: height });
                y += height;
            }
            return { x: free.x + thickness, y: free.y, w: Math.max(0, free.w - thickness), h: free.h };
        }
        // Portrait: a horizontal band on top, items laid left to right.
        let x = free.x;
        for (const node of row) {
            const width = thickness > 0 ? (node.value * scale) / thickness : 0;
            out.push({ item: node.item, x, y: free.y, w: width, h: thickness });
            x += width;
        }
        return { x: free.x, y: free.y + thickness, w: free.w, h: Math.max(0, free.h - thickness) };
    }

    Atlas.layoutTreemap = function (items, x, y, width, height) {
        const nodes = items
            .filter((item) => item.value > 0)
            .map((item) => ({ item, value: item.value }))
            .sort((a, b) => b.value - a.value);
        const out = [];
        const total = nodes.reduce((sum, node) => sum + node.value, 0);
        if (total <= 0 || width <= 0 || height <= 0) {
            return out;
        }
        const scale = (width * height) / total;
        let free = { x, y, w: width, h: height };
        let row = [];
        let index = 0;
        while (index < nodes.length) {
            const side = Math.min(free.w, free.h);
            const candidate = row.concat([nodes[index]]);
            if (row.length === 0 || worstRatio(row, side, scale) >= worstRatio(candidate, side, scale)) {
                row = candidate;
                index++;
            } else {
                free = placeRow(row, free, scale, out);
                row = [];
            }
        }
        if (row.length) {
            placeRow(row, free, scale, out);
        }
        return out;
    };
})();
