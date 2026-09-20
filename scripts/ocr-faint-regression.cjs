/* eslint-disable @typescript-eslint/no-require-imports -- Actual OCR plus an isolated route loader; no database credentials or payments. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const ts = require("typescript");
const { createWorker, OEM, PSM } = require("tesseract.js");
const {
  prepareFaintRegions,
  recognizeFaintVariants,
} = require("../src/app/lib/ocrFaint.ts");
const { opticalScore } = require("../src/app/lib/ocrOptical.ts");
const { probeOrientation } = require("../src/app/lib/ocrOrientationServer.ts");

// Execute the production route with its real libraries. Only expose its private
// word mapper to assert crop offsets. No expected OCR text is supplied to OCR.
function loadRoute() {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    let source = fs.readFileSync(file, "utf8");
    if (file.endsWith("route.ts"))
      source += "\nexports.mapWords=extractOcrWords;";
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (spec) => {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) return require(spec);
      const base = spec.startsWith("@/")
        ? path.resolve("src", spec.slice(2))
        : path.resolve(path.dirname(file), spec);
      return load(
        [base, base + ".ts", base + ".tsx"].find((p) => fs.existsSync(p)),
      );
    };
    new Function("require", "module", "exports", js)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  return load(path.resolve("src/app/api/payments/extract-check-stub/route.ts"));
}

(async () => {
  const input = fs.readFileSync("scripts/fixtures/faint-remittance.png");
  const prepared = await prepareFaintRegions(input);
  assert.equal(prepared.scale, 1);
  assert.equal(prepared.inputWidth, 2918);
  assert(prepared.estimatedCharacterHeight >= 8);
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    cachePath: path.join(os.tmpdir(), "trimax-optical-tesseract"),
    gzip: true,
  });
  let result;
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const oldImage = await sharp(input)
      .resize({
        width: 1500,
        height: 1500,
        fit: "inside",
        withoutEnlargement: true,
      })
      .grayscale()
      .normalize()
      .png()
      .toBuffer();
    const old = await worker.recognize(
      oldImage,
      {},
      { text: true, imageBinary: true },
    );
    assert.equal(
      opticalScore(old.data.text, old.data.confidence).credible,
      false,
      "Old physical probe must fail this image",
    );
    assert.equal(
      old.data.text.trim(),
      "",
      "Baseline must reproduce complete ink loss",
    );
    const oldBinary = Buffer.from(old.data.imageBinary.split(",")[1], "base64");
    const oldInk = await sharp(oldBinary)
      .extract({ left: 412, top: 145, width: 100, height: 190 })
      .grayscale()
      .raw()
      .toBuffer();
    const newInk = await sharp(prepared.binary)
      .extract({
        left: 800 - prepared.bounds.left,
        top: 282 - prepared.bounds.top,
        width: 200,
        height: 380,
      })
      .grayscale()
      .raw()
      .toBuffer();
    assert.equal(
      oldInk.filter((value) => value < 128).length,
      0,
      "Old Tesseract binary erases invoice-column ink at the pixel level",
    );
    assert(
      newInk.filter((value) => value < 128).length > 500,
      "Local binary retains visible strokes in the same physical invoice region",
    );
    const artifacts = path.join(os.tmpdir(), "trimax-faint-regression");
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, "old-prepared.png"), oldImage);
    fs.writeFileSync(
      path.join(artifacts, "old-tesseract-binary.png"),
      oldBinary,
    );
    fs.writeFileSync(path.join(artifacts, "new-local-gray.png"), prepared.gray);
    fs.writeFileSync(
      path.join(artifacts, "new-local-binary.png"),
      prepared.binary,
    );
    result = await recognizeFaintVariants(worker, prepared, 12000);
    const chosen = result.selected;
    assert(chosen.score.credible);
    assert(chosen.score.headers >= 2);
    assert(chosen.score.invoices >= 5);
    assert(chosen.score.money >= 5);
    for (const id of ["9001", "9002", "9003", "9004", "9005"])
      assert(chosen.data.text.includes(id));
    assert(
      chosen.data.text.includes("1,500.00"),
      "Bottom total must survive region selection",
    );
    assert(
      chosen.data.text.includes("PAYOR"),
      "Top header must survive region selection",
    );
    const table = result.passes.map((p) => ({
      variant: p.variant,
      width: p.outputWidth,
      height: p.outputHeight,
      confidence: p.data.confidence,
      ...p.score,
    }));
    console.log("Actual faint-image OCR:", JSON.stringify(table));
    const route = loadRoute();
    const mapped = route.mapWords(
      chosen.data,
      {
        name: "full-document",
        image: prepared.color,
        width: prepared.bounds.width,
        height: prepared.bounds.height,
        bounds: prepared.bounds,
      },
      prepared.bounds.width,
      prepared.bounds.height,
      {
        variant: chosen.variant,
        pageMode: { name: "sparse-text", value: PSM.SPARSE_TEXT },
      },
      0,
    );
    const invoiceWords = mapped.filter((w) => /^INV-900[1-5]$/.test(w.text));
    assert.equal(invoiceWords.length, 5);
    invoiceWords.forEach((word, i) => {
      assert(
        Math.abs(word.bbox.y1 - (320 + i * 80)) < 12,
        "Rows retain physical Y positions after crop",
      );
      assert(
        word.bbox.x0 >= 790 && word.bbox.x0 <= 815,
        "Original X coordinate retained",
      );
    });
    const post = async (body) => {
      const response = await route.POST(
        new Request("http://localhost/api/payments/extract-check-stub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      assert.equal(response.status, 200);
      return response.json();
    };
    const imageDataUrl = "data:image/png;base64," + input.toString("base64");
    const preflight = await post({
      mode: "capture-source-selection",
      captureCandidates: [{ id: "fixture", label: "fixture", imageDataUrl }],
    });
    assert.equal(
      preflight.selectedCandidateId,
      "fixture",
      JSON.stringify(preflight),
    );
    assert(preflight.evaluations[0].opticalVariants.length >= 1);
    assert.equal(preflight.evaluations[0].variantOutcomes.length,3);
    const detail = await post({
      imageDataUrl,
      documentType: "remittance_stub",
    });
    assert(!detail.error, detail.error);
    assert(detail.diagnostics.opticalVariants.length >= 3);
    console.log("LATENCY",JSON.stringify({preflightMs:preflight.durationMs,detailedMs:detail.diagnostics.detailedOcrDurationMs,recoveryMs:detail.diagnostics.targetedRecoveryDurationMs,passes:detail.evidence?.rawPasses?.length,progress:detail.diagnostics.evidenceProgress}));
    assert(
      detail.structuredRowEvidence.length >= 5,
      "Actual OCR must reach physical row reconstruction",
    );
    assert.equal(detail.optical.images[0].label, "Chosen OCR variant");
    assert(!/merge|reconstruction/.test(detail.optical.images[0].source),'Retain an actual recognition image, not a synthetic merged result');
    assert(detail.optical.images[0].base64.length > 0);
    console.log(
      "Actual production preflight and detailed OCR passed; physical rows:",
      detail.structuredRowEvidence.length,
    );
  } finally {
    await worker.terminate();
  }
  for (const angle of [0, 90, 180, 270]) {
    const rotated = await sharp(input).rotate(angle).png().toBuffer();
    const probe = await probeOrientation(rotated);
    assert(probe.resolved, JSON.stringify(probe.passes));
    assert.equal((angle + probe.rotation) % 360, 0);
  }
  const blank = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await probeOrientation(blank)).resolved,
    false,
    "Blank must not establish direction",
  );
  let timeoutCalls = 0;
  const timedOut = await recognizeFaintVariants({recognize:()=>{timeoutCalls++;return new Promise(()=>{});},terminate:async()=>{}},prepared,5);
  assert.equal(timedOut.passes.length,0);
  assert.equal(timedOut.outcomes[0].status,"timed-out");
  assert.equal(
    timeoutCalls,
    1,
    "Expired worker is not reused for another variant",
  );
  const prose = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="32"><text x="50" y="100">Ordinary document without accounting identifiers</text><text x="50" y="200">Printed words establish readable horizontal lines</text><text x="50" y="300">Direction does not require perfect invoice recognition</text></g></svg>',
  );
  const ordinary = await probeOrientation(await sharp(prose).png().toBuffer());
  assert.equal(ordinary.rotation, 0);
  assert.equal(
    ordinary.passes.find((p) => p.rotation === 0).score.credible,
    false,
  );
  console.log(
    "Faint regression passed: old ink loss, bounded variants, headers/five rows/total, native pixels, coordinate provenance, four rotations, prose direction, blank fails closed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
