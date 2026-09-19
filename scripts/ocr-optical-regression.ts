import assert from "node:assert/strict";
import sharp from "sharp";
import { probeOrientation } from "../src/app/lib/ocrOrientationServer.ts";
import {
  jpegOrientation,
  opticalScore,
  orientationTransform,
} from "../src/app/lib/ocrOptical.ts";
const lines = [
  "REMITTANCE PAYMENT",
  "PAYOR: EXAMPLE APARTMENTS",
  "CHECK 1234 DATE 09/19/2026",
  "INVOICE       UNIT       AMOUNT",
  "INV-0520      B06        1099.00",
  "INV-0521      P01        1300.00",
  "INV-0522      P01         458.40",
  "INV-0524      V10        1300.00",
  "INV-0525      V10         348.50",
  "TOTAL                   4505.90",
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100"><rect width="100%" height="100%" fill="white"/>${lines.map((l, i) => `<text x="90" y="${95 + i * 95}" font-family="monospace" font-size="45" fill="black">${l}</text>`).join("")}</svg>`;
const upright = await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
let baseline = "";
for (const rotation of [0, 90, 180, 270]) {
  const input = await sharp(upright)
    .rotate(rotation)
    .jpeg({ quality: 95 })
    .toBuffer();
  const r = await probeOrientation(input);
  assert(
    r.resolved,
    JSON.stringify(r.passes.map((p) => ({ r: p.rotation, s: p.score }))),
  );
  assert.equal((rotation + r.rotation!) % 360, 0);
  const text = r.passes.find((p) => p.rotation === r.rotation)!.text;
  for (const inv of ["0520", "0521", "0522", "0524", "0525"])
    assert(text.includes(inv));
  assert(text.includes("4505.90"));
  if (rotation === 0) baseline = text;
  console.log(
    `Real optical OCR rotation ${rotation}: selected ${r.rotation}; ${r.probeDurationMs}ms; five invoice tokens and total recognized`,
  );
}
const exif = await sharp(upright)
  .rotate(90)
  .withMetadata({ orientation: 8 })
  .jpeg({ quality: 95 })
  .toBuffer();
assert.equal(jpegOrientation(exif).orientation, 8);
const tagged = await probeOrientation(exif);
assert(tagged.resolved);
assert.equal(tagged.rotation, 0);
const already = await sharp(exif).rotate().jpeg().toBuffer();
assert.equal(jpegOrientation(already).orientation, null);
assert.equal((await probeOrientation(already)).rotation, 0);
assert.equal(jpegOrientation(upright).orientation, null);
assert.equal(opticalScore("|", 99).credible, false);
assert(opticalScore(baseline, 20).score > opticalScore("|", 99).score);
assert.equal(opticalScore("aaa aaa xxx xxx !!!! 0 2 4", 99).credible, false);
for (let o = 1; o <= 8; o++)
  assert.equal(orientationTransform(o, 1600, 1100).length, 6);
console.log(
  "Optical image tests passed: actual OCR, four rotations, EXIF, already normalized JPEG, missing EXIF and noise scoring.",
);
