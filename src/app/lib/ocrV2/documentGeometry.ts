import sharp from "sharp";
import type { Point, Quad, DocumentGeometry } from "./types.ts";
const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
export const polygonArea = (points: Point[]) => Math.abs(points.reduce((s, p, i) => s + p.x * points[(i + 1) % points.length].y - p.y * points[(i + 1) % points.length].x, 0)) / 2;
function hull(points: Point[]) {
    const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y), lower: Point[] = [], upper: Point[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    for (const p of sorted.slice().reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
            upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}
export function orderedQuad(points: Point[]): Quad {
    const cx = points.reduce((s, p) => s + p.x, 0) / 4, cy = points.reduce((s, p) => s + p.y, 0) / 4;
    const sorted = points.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const first = sorted.reduce((best, p, i) => p.x + p.y < sorted[best].x + sorted[best].y ? i : best, 0);
    return [...sorted.slice(first), ...sorted.slice(0, first)] as Quad;
}
function otsu(data: Uint8Array) {
    const hist = new Uint32Array(256);
    let sum = 0;
    for (const v of data) {
        hist[v]++;
        sum += v;
    }
    let left = 0, leftSum = 0, best = 0, threshold = 128;
    for (let t = 0; t < 255; t++) {
        left += hist[t];
        leftSum += hist[t] * t;
        if (!left || left === data.length)
            continue;
        const delta = leftSum / left - (sum - leftSum) / (data.length - left), score = left * (data.length - left) * delta * delta;
        if (score > best) {
            best = score;
            threshold = t;
        }
    }
    return threshold;
}
function edgeDistance(p: Point, a: Point, b: Point) { return Math.abs(cross(a, b, p)) / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)); }
function refineEdges(quad: Quad, boundary: Point[]): Quad {
    const lines = quad.map((a, i) => {
        const b = quad[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
        const points = boundary.filter(p => { const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared; return t > .15 && t < .85 && edgeDistance(p, a, b) < 6; });
        if (points.length < 8)
            return null;
        const x = points.reduce((s, p) => s + p.x, 0) / points.length, y = points.reduce((s, p) => s + p.y, 0) / points.length;
        const xx = points.reduce((s, p) => s + (p.x - x) ** 2, 0), yy = points.reduce((s, p) => s + (p.y - y) ** 2, 0), xy = points.reduce((s, p) => s + (p.x - x) * (p.y - y), 0);
        const angle = .5 * Math.atan2(2 * xy, xx - yy), nx = -Math.sin(angle), ny = Math.cos(angle);
        return { nx, ny, c: -nx * x - ny * y };
    });
    if (lines.some(l => !l))
        return quad;
    const refined: Point[] = [];
    for (let i = 0; i < 4; i++) {
        const a = lines[(i + 3) % 4]!, b = lines[i]!, det = a.nx * b.ny - b.nx * a.ny;
        if (Math.abs(det) < .1)
            return quad;
        refined.push({ x: (a.ny * b.c - b.ny * a.c) / det, y: (b.nx * a.c - a.nx * b.c) / det });
    }
    const ratio = polygonArea(refined) / polygonArea(quad);
    return ratio > .9 && ratio < 1.1 ? refined as Quad : quad;
}
export async function detectDocumentGeometry(input: Buffer): Promise<DocumentGeometry> {
    const meta = await sharp(input).metadata(), iw = meta.width!, ih = meta.height!;
    const fallback: DocumentGeometry = { coordinateSpace: "exif-normalized-full-image", bounds: { left: 0, top: 0, width: iw, height: ih }, corners: [{ x: 0, y: 0 }, { x: iw - 1, y: 0 }, { x: iw - 1, y: ih - 1 }, { x: 0, y: ih - 1 }], angle: 0, confidence: 0, reliable: false, method: "multi-threshold connected contour + convex quadrilateral + edge contrast", evidence: null, perspectiveTransform: null, reason: "Uncertain paper boundary: preserve full frame." };
    const scan = await sharp(input).resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).grayscale().blur(1).raw().toBuffer({ resolveWithObject: true });
    const w = scan.info.width, h = scan.info.height, data = scan.data, threshold = otsu(data);
    const thresholds = [...new Set([threshold, Math.round(threshold * .85), Math.min(230, threshold + 25)])];
    const candidates: Array<{
        quad: Quad;
        fill: number;
        fit: number;
        contrast: number;
        confidence: number;
        threshold: number;
        area: number;
    }> = [];
    for (const t of thresholds) {
        const seen = new Uint8Array(w * h), queue = new Int32Array(w * h);
        for (let start = 0; start < data.length; start++) {
            if (seen[start] || data[start] <= t)
                continue;
            let head = 0, tail = 1;
            queue[0] = start;
            seen[start] = 1;
            const boundary: Point[] = [];
            while (head < tail) {
                const i = queue[head++], x = i % w, y = Math.floor(i / w);
                let edge = false;
                for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]) {
                    if (j < 0 || data[j] <= t) {
                        edge = true;
                        continue;
                    }
                    if (!seen[j]) {
                        seen[j] = 1;
                        queue[tail++] = j;
                    }
                }
                if (edge)
                    boundary.push({ x, y });
            }
            if (tail < w * h * .04 || tail > w * h * .96 || boundary.length < 4)
                continue;
            const convex = hull(boundary), simple = convex.slice();
            while (simple.length > 4) {
                let remove = 0, loss = Infinity;
                for (let i = 0; i < simple.length; i++) {
                    const area = Math.abs(cross(simple[(i + simple.length - 1) % simple.length], simple[i], simple[(i + 1) % simple.length]));
                    if (area < loss) {
                        loss = area;
                        remove = i;
                    }
                }
                simple.splice(remove, 1);
            }
            if (simple.length !== 4)
                continue;
            const quad = refineEdges(orderedQuad(simple), boundary), area = polygonArea(quad);
            if (area <= 0)
                continue;
            if (quad.filter(p => p.x < 2 || p.y < 2 || p.x > w - 3 || p.y > h - 3).length > 1)
                continue;
            const fill = Math.min(1, tail / area), meanDistance = convex.reduce((sum, p) => sum + Math.min(...quad.map((a, i) => edgeDistance(p, a, quad[(i + 1) % 4]))), 0) / convex.length;
            const fit = Math.max(0, 1 - meanDistance / 10);
            let contrast = 0, count = 0;
            for (let side = 0; side < 4; side++) {
                const a = quad[side], b = quad[(side + 1) % 4], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length;
                for (let step = 1; step < 20; step++) {
                    const x = a.x + dx * step / 20, y = a.y + dy * step / 20;
                    const sample = (d: number) => { const sx = Math.max(0, Math.min(w - 1, Math.round(x + nx * d))), sy = Math.max(0, Math.min(h - 1, Math.round(y + ny * d))); return data[sy * w + sx]; };
                    contrast += sample(5) - sample(-5);
                    count++;
                }
            }
            contrast /= count;
            const confidence = .35 * fill + .35 * fit + .3 * Math.max(0, Math.min(1, contrast / 40));
            if (fill >= .75 && fit >= .75 && contrast >= 12)
                candidates.push({ quad, fill, fit, contrast, confidence, threshold: t, area });
        }
    }
    candidates.sort((a, b) => b.confidence - a.confidence || b.area - a.area);
    const best = candidates[0];
    if (!best || best.confidence < .85)
        return { ...fallback, confidence: best?.confidence ?? 0 };
    const corners = best.quad.map(p => ({ x: p.x * iw / w, y: p.y * ih / h })) as Quad;
    const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y)), right = Math.max(...corners.map(p => p.x)), bottom = Math.max(...corners.map(p => p.y));
    return { ...fallback, corners, bounds: { left, top, width: right - left, height: bottom - top }, angle: Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x) * 180 / Math.PI, confidence: best.confidence, reliable: true, evidence: { threshold: best.threshold, componentFill: best.fill, boundaryFit: best.fit, edgeContrast: best.contrast, candidates: candidates.length }, reason: "Four contour-supported paper edges with inside/outside contrast; not a bright-pixel size estimate." };
}
// Destination -> source homography, retained as provenance. No recognition data.
export function homography(destination: Quad, source: Quad): number[] {
    const rows: number[][] = [];
    for (let i = 0; i < 4; i++) {
        const { x, y } = destination[i], u = source[i].x, v = source[i].y;
        rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let col = 0; col < 8; col++) {
        let pivot = col;
        for (let r = col + 1; r < 8; r++)
            if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col]))
                pivot = r;
        [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
        const d = rows[col][col];
        if (Math.abs(d) < 1e-9)
            throw Error("Degenerate document quadrilateral");
        for (let j = col; j < 9; j++)
            rows[col][j] /= d;
        for (let r = 0; r < 8; r++)
            if (r !== col) {
                const factor = rows[r][col];
                for (let j = col; j < 9; j++)
                    rows[r][j] -= factor * rows[col][j];
            }
    }
    return rows.map(r => r[8]).concat(1);
}
export function transformPoint(matrix: number[], p: Point): Point { const z = matrix[6] * p.x + matrix[7] * p.y + matrix[8]; return { x: (matrix[0] * p.x + matrix[1] * p.y + matrix[2]) / z, y: (matrix[3] * p.x + matrix[4] * p.y + matrix[5]) / z }; }
export async function rectifyDocument(input: Buffer, geometry: DocumentGeometry) {
    if (!geometry.reliable)
        return { image: input, matrix: null };
    const raw = await sharp(input).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }), q = geometry.corners;
    const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4;
    // Keep a small optical margin around detected edges; never trim to printed ink.
    const padded = q.map(p => { const d = Math.hypot(p.x - cx, p.y - cy); return { x: p.x + (p.x - cx) * 10 / d, y: p.y + (p.y - cy) * 10 / d }; }) as Quad;
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const width = Math.ceil(Math.max(distance(padded[0], padded[1]), distance(padded[3], padded[2]))), height = Math.ceil(Math.max(distance(padded[0], padded[3]), distance(padded[1], padded[2])));
    if (width * height > 48000000)
        throw Error("Rectified image exceeds safe decode limit");
    const matrix = homography([{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }], padded), output = Buffer.alloc(width * height * 3, 255), sw = raw.info.width, sh = raw.info.height;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const p = transformPoint(matrix, { x, y });
            if (p.x < 0 || p.y < 0 || p.x >= sw - 1 || p.y >= sh - 1)
                continue;
            const ix = Math.floor(p.x), iy = Math.floor(p.y), dx = p.x - ix, dy = p.y - iy;
            for (let c = 0; c < 3; c++) {
                const at = (xx: number, yy: number) => raw.data[(yy * sw + xx) * 3 + c];
                output[(y * width + x) * 3 + c] = Math.round(at(ix, iy) * (1 - dx) * (1 - dy) + at(ix + 1, iy) * dx * (1 - dy) + at(ix, iy + 1) * (1 - dx) * dy + at(ix + 1, iy + 1) * dx * dy);
            }
        }
    return { image: await sharp(output, { raw: { width, height, channels: 3 } }).png().toBuffer(), matrix };
}
