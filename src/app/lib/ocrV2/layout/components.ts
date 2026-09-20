import sharp from "sharp";
import type { TextComponent, TextBand } from "./types.ts";
export function median(values: number[]) { const sorted = values.slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; }
export async function textComponents(input: Buffer, maximumEdge = 3200, options: { minimumContrast?: number } = {}) {
    const meta = await sharp(input).metadata(), sourceWidth = meta.width!, sourceHeight = meta.height!;
    const image = await sharp(input).flatten({ background: 'white' }).resize({ width: maximumEdge, height: maximumEdge, fit: 'inside', withoutEnlargement: true }).grayscale().blur(.5).raw().toBuffer({ resolveWithObject: true });
    const { width, height } = image.info;
    const background = await sharp(image.data, { raw: { width, height, channels: 1 } }).blur(Math.max(3, Math.min(width, height) * .007)).grayscale().raw().toBuffer();
    const samples: number[] = [];
    for (let i = 0; i < image.data.length; i += 31)
        samples.push(Math.abs(background[i] - image.data[i]));
    const threshold = Math.max(options.minimumContrast ?? 2, Math.min(6, median(samples) * 1.8));
    const ink = new Uint8Array(width * height);
    for (let i = 0; i < ink.length; i++)
        ink[i] = background[i] - image.data[i] >= threshold ? 1 : 0;
    const seen = new Uint8Array(ink.length), queue = new Int32Array(ink.length), components: TextComponent[] = [];
    for (let start = 0; start < ink.length; start++) {
        if (seen[start] || !ink[start])
            continue;
        let head = 0, tail = 1, x0 = width, y0 = height, x1 = 0, y1 = 0;
        queue[0] = start;
        seen[start] = 1;
        while (head < tail) {
            const i = queue[head++], x = i % width, y = Math.floor(i / width);
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = x + dx, yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= width || yy >= height)
                        continue;
                    const j = yy * width + xx;
                    if (ink[j] && !seen[j]) {
                        seen[j] = 1;
                        queue[tail++] = j;
                    }
                }
        }
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        // Glyph-scale components; long rules, page edges and large creases are not text.
        if (h >= Math.max(3, height * .004) && h <= height * .09 && w >= 1 && w <= h * 5 && tail >= 5 && tail / (w * h) > .08 && x0 > 1 && y0 > 1 && x1 < width - 2 && y1 < height - 2)
            components.push({ left: x0, top: y0, width: w, height: h, pixels: tail, centerY: (y0 + y1) / 2 });
    }
    return { components, width, height, sourceWidth, sourceHeight, scaleX: sourceWidth / width, scaleY: sourceHeight / height, threshold };
}
export function horizontalBands(components: TextComponent[], width: number, height: number) {
    const tall = components.filter(c => c.height >= height * .009 && c.width >= 2);
    const characterHeight = median(tall.map(c => c.height)) || 10;
    const profile = new Float64Array(height);
    for (const c of components) {
        if (c.height < characterHeight * .4)
            continue;
        for (let y = c.top; y < c.top + c.height; y++)
            profile[y] += c.pixels / c.height;
    }
    const radius = Math.max(1, Math.round(characterHeight * .1)), smoothed = Array.from(profile, (_, y) => { let sum = 0, count = 0; for (let j = Math.max(0, y - radius); j <= Math.min(height - 1, y + radius); j++) {
        sum += profile[j];
        count++;
    } return sum / count; });
    const floor = median(smoothed), peak = Math.max(...smoothed), threshold = Math.max(floor * 2.5, peak * .13);
    const raw: Array<[
        number,
        number
    ]> = [];
    let start = -1;
    for (let y = 0; y <= height; y++) {
        if (y < height && smoothed[y] > threshold) {
            if (start < 0)
                start = y;
        }
        else if (start >= 0) {
            raw.push([start, y]);
            start = -1;
        }
    }
    const merged: Array<[
        number,
        number
    ]> = [];
    for (const band of raw) {
        const last = merged[merged.length - 1];
        if (last && band[0] - last[1] < characterHeight * .35)
            last[1] = band[1];
        else
            merged.push(band);
    }
    const bands: TextBand[] = merged.map(([top, bottom]) => {
        const selected = components.filter(c => c.centerY >= top && c.centerY < bottom && c.height >= characterHeight * .4);
        const left = selected.length ? Math.min(...selected.map(c => c.left)) : 0, right = selected.length ? Math.max(...selected.map(c => c.left + c.width)) : 0;
        return { left, top, width: right - left, height: bottom - top, centerY: (top + bottom) / 2, componentCount: selected.length, characterHeight: median(selected.map(c => c.height)) };
    }).filter(b => b.componentCount >= 3 && b.height >= characterHeight * .3);
    return { bands, characterHeight };
}
