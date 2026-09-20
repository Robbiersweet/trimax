/* eslint-disable @typescript-eslint/no-require-imports -- Evaluation labels never enter the optical module. */
const { orientationTransform } = require('../../src/app/lib/ocrOptical.ts');
exports.geometryMetrics = function (evidence, truth) {
    if (!truth.paperCorners)
        return { available: false, reason: 'No independent paper annotation' };
    const source = evidence.sourceImage, [a, b, c, d, e, f] = orientationTransform(source.exifOrientation || 1, source.width, source.height);
    const expected = truth.paperCorners.map(([x, y]) => ({ x: a * x + c * y + e, y: b * x + d * y + f })), actual = evidence.documentGeometry.corners;
    const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    const maxCornerError = Math.max(...expected.map(p => Math.min(...actual.map(q => distance(p, q)))));
    const inside = (x, y, polygon) => { let yes = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const p = polygon[i], q = polygon[j];
        if ((p.y > y) !== (q.y > y) && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x)
            yes = !yes;
    } return yes; };
    const { width, height } = evidence.normalization.originalNormalizedDimensions, step = Math.max(width, height) / 800;
    let intersection = 0, union = 0;
    for (let y = step / 2; y < height; y += step)
        for (let x = step / 2; x < width; x += step) {
            const p = inside(x, y, expected), q = inside(x, y, actual);
            if (p && q)
                intersection++;
            if (p || q)
                union++;
        }
    return { available: true, approximatePolygonIoU: intersection / union, maxCornerErrorPixels: maxCornerError, annotationTolerancePixels: 15, orientationCorrect: source.exifOrientation === 6 ? evidence.normalization.rotation === 270 : null, note: 'Manual approximate raw-pixel annotation; coordinates converted through EXIF before comparison. Not a generalization claim.' };
};
