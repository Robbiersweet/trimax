/* eslint-disable @typescript-eslint/no-require-imports -- Regression harness injects storage and browser adapters. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
module.exports = async function historyRegression(load, React, renderer) {
  const history = require("../src/app/lib/ocrHistory.ts");
  const contract = require("../src/app/lib/remittanceAttempt.ts");
  const base = history.scanSummary(
    crypto.randomUUID(),
    "original",
    null,
    "existing",
    "regression",
  );
  const attempt = contract.resolveRemittanceAttempt(
    contract.emptyRemittanceEvidence(base.attemptId, null, "No text"),
    [],
    [],
    { role: "owner", receivedDate: "2026-09-18", fingerprint: "" },
  );
  for (const result of [
    "failed",
    "review",
    "duplicate",
    "apply blocked",
    "success",
  ]) {
    const summary = history.finishScan(base, attempt, result, 20, [
      "No readable rows",
    ]);
    assert.equal(summary.result, result);
    assert.equal(summary.paymentCanApply, false);
    assert.ok(history.failureSummary(summary).length < 8000);
  }
  assert.deepEqual(
    history.diagnosticPayload({
      imageDataUrl: "data:image/png;base64,AAA",
      password: "secret",
      rawText: "OCR words",
    }),
    { rawText: "OCR words" },
  );
  const report = history.debugFile(
    history.finishScan(base, attempt, "failed", 50),
    { attempt, extra: "complete retained report" },
  );
  assert.ok(report.name.endsWith(".txt"));
  assert.ok(report.text.includes("complete retained report"));
  const slim = history.slimAttempt(attempt);
  assert.deepEqual(slim.reconciliationResult, attempt.reconciliationResult);
  assert.deepEqual(slim.resolverResult, attempt.resolverResult);
  let summaries = 0,
    blobs = 0,
    copied = "";
  const record = {
    id: base.attemptId,
    created_at: base.timestamp,
    original_id: base.attemptId,
    parent_id: null,
    result: "failed",
    summary: history.finishScan(base, attempt, "failed", 50, [
      "No readable rows",
    ]),
    pinned: false,
    diagnostics_expires_at: "2026-10-18",
    diagnostic_bytes: 100,
  };
  const client = {
    flushScans: async () => {},
    pendingScans: async () => [],
    recentScans: async () => {
      summaries++;
      return [record];
    },
    scanDiagnostics: async () => {
      blobs++;
      return { attempt, extra: "complete retained report" };
    },
    pinScan: async () => {},
  };
  const component = load({ "../lib/ocrHistoryClient": client })(
    "src/app/components/RecentScans.tsx",
  ).default;
  const oldWindow = global.window,
    oldNavigator = global.navigator;
  global.window = { addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        },
      },
    },
  });
  let root;
  try {
    await renderer.act(async () => {
      root = renderer.create(
        React.createElement(component, {
          businessId: "workspace",
          role: "owner",
          savedStatus: "Attempt saved ✓",
        }),
      );
    });
    assert.equal(summaries, 0);
    assert.equal(blobs, 0);
    const label = (node) =>
      typeof node === "string"
        ? node
        : Array.isArray(node)
          ? node.map(label).join("")
          : node?.props
            ? label(node.props.children)
            : "";
    const click = async (text) => {
      const button = root.root
        .findAllByType("button")
        .find((b) => label(b.props.children).includes(text));
      assert.ok(button, text);
      await renderer.act(async () => {
        await button.props.onClick();
      });
    };
    await click("Recent Scans");
    assert.equal(summaries, 1);
    assert.equal(blobs, 0);
    await click("Original Scan");
    assert.equal(blobs, 0);
    await click("Copy Failure Summary");
    assert.ok(copied.includes(base.attemptId));
    assert.equal(blobs, 0);
    await click("Create Debug File");
    assert.equal(blobs, 1);
    assert.ok(root.root.findAllByType("a").find(link=>link.props.download).props.download.endsWith(".txt"));
    await renderer.act(async () => root.unmount());
    await renderer.act(async () => {
      root = renderer.create(
        React.createElement(component, {
          businessId: "workspace",
          role: "owner",
          savedStatus: "",
        }),
      );
    });
    await click("Recent Scans");
    assert.equal(summaries, 2);
    assert.equal(blobs, 1);
  } finally {
    if (root) await renderer.act(async () => root.unmount());
    global.window = oldWindow;
    Object.defineProperty(global, "navigator", {
      configurable: true,
      value: oldNavigator,
    });
  }
  const clientSource = fs.readFileSync(
    "src/app/lib/ocrHistoryClient.ts",
    "utf8",
  );
  assert.match(
    clientSource,
    /\.select\(\s*["']id,created_at,original_id,parent_id,result,summary,pinned,diagnostics_expires_at,diagnostic_bytes["']/,
  );
  // Exercise the real client outbox across independent module instances (reload).
  const stores = new Map([
    ["attempts", new Map()],
    ["diagnostics", new Map()],
  ]);
  let blobReads = 0,
    offline = true;
  const sent = [];
  const oldIndexedDB = global.indexedDB;
  global.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: (name) => stores.has(name) },
          close() {},
          transaction() {
            const tx = {
              objectStore(name) {
                const data = stores.get(name);
                const result = (value) => ({ result: structuredClone(value) });
                return {
                  getAll() {
                    if (name === "diagnostics") blobReads++;
                    return result([...data.values()]);
                  },
                  get(key) {
                    if (name === "diagnostics") blobReads++;
                    return result(data.get(key));
                  },
                  put(value) {
                    data.set(value.key, structuredClone(value));
                    return result(value.key);
                  },
                  delete(key) {
                    data.delete(key);
                    return result(undefined);
                  },
                };
              },
            };
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  let rejectId=null;
  const remote = {
    rpc: async (_name, args) => {
      if (args.p_id===rejectId)return {error:{message:"one malformed payload"}};
      if (offline) return { error: { message: "offline" } };
      sent.push(args);
      return { error: null };
    },
  };
  const openClient = () =>
    load({ "./supabase": { supabase: remote } })(
      "src/app/lib/ocrHistoryClient.ts",
    );
  try {
    const clientOne = openClient(),
      summary = history.finishScan(base, attempt, "failed", 12);
    assert.equal(
      await clientOne.saveScan({
        businessId: "workspace",
        phase: 2,
        summary,
        payload: { attempt, marker: "survives restart" },
      }),
      "device",
    );
    const restarted = openClient(),
      beforeReads = blobReads;
    const pending = await restarted.pendingScans("workspace");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].payload, null);
    assert.equal(
      blobReads,
      beforeReads,
      "Summary listing must not load local blobs",
    );
    assert.equal(
      (await restarted.scanDiagnostics("workspace", base.attemptId)).marker,
      "survives restart",
    );
    offline = false;
    await restarted.flushScans("workspace");
    assert.equal(sent[0].p_payload.marker, "survives restart");
    assert.equal((await restarted.pendingScans("workspace")).length, 0);
    await restarted.saveScan({
      businessId: "workspace",
      phase: 2,
      summary: { ...summary, result: "success" },
      payload: { giant: "should not be stored" },
    });
    assert.equal(sent.at(-1).p_payload, null);
    rejectId=crypto.randomUUID();
    assert.equal(await restarted.saveScan({businessId:"workspace",phase:2,summary:{...summary,attemptId:rejectId},payload:{bad:true}}),"device");
    assert.equal(await restarted.saveScan({businessId:"workspace",phase:2,summary:{...summary,attemptId:crypto.randomUUID()},payload:{good:true}}),"saved");
    assert.equal((await restarted.pendingScans("workspace")).length,1,"Only rejected attempt stays queued");
  } finally {
    global.indexedDB = oldIndexedDB;
  }
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  const checkpoints = [];
  let opticalReadFails=false;
  const raster=label=>({label,mime:"image/png",base64:"AAAA",width:1,height:1});
  const server = load({
    "@supabase/supabase-js": {
      createClient: () => ({
        from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{if(opticalReadFails)throw Error("read unavailable");return {data:{evidence:{images:[raster("Original capture")],notes:[]}},error:null};}})})}),
        rpc: async (name, args) => {
          checkpoints.push(args);
          return { error: null };
        },
      }),
    },
  })("src/app/lib/ocrHistoryServer.ts");
  try {
    const request = new Request("https://trimax.test/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test",
      },
      body: JSON.stringify({
        businessId: crypto.randomUUID(),
        history: { ...base, originalId: base.attemptId },
        debugContext: { preparation: ["crop evidence"] },
      }),
    });
    const response = await server.checkpointOcr(
      request,
      async () =>
        new Response(
          JSON.stringify({
            rawText: "full evidence",
            error: "OCR unavailable",
          }),
          { status: 503 },
        ),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).rawText, "full evidence");
    assert.equal(checkpoints[0].p_phase, 1);
    assert.equal(checkpoints[0].p_payload.response.rawText, "full evidence");
    assert.equal(checkpoints[0].p_summary.paymentCanApply, false);
    const opticalRun=()=>server.checkpointOcr(request.clone(),async()=>Response.json({rawText:"faint evidence",optical:{images:[raster("Chosen OCR variant")],notes:[]}}));
    const opticalResponse=await opticalRun();
    assert.equal(opticalResponse.status,200);
    assert.equal((await opticalResponse.json()).optical.images.length,1);
    assert.deepEqual(checkpoints.at(-1).p_payload.optical.images.map(i=>i.label),["Chosen OCR variant","Original capture"]);
    assert.equal(checkpoints.at(-1).p_payload.response.optical,undefined,"No duplicate image bytes in ordinary diagnostics");
    opticalReadFails=true;
    assert.equal((await opticalRun()).status,200,"Diagnostic read failure must not fail OCR");
    assert.equal(checkpoints.at(-1).p_payload.optical,undefined,"Failed read must not overwrite original image retention");
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
  const current = fs.readFileSync(
    "src/app/components/BatchInvoicePayments.tsx",
    "utf8",
  );
  const canonical = current
    .slice(
      current.indexOf("  async function filePaymentImage("),
      current.indexOf("  async function runDuplicateRemittancePreflight("),
    )
    .replaceAll("\r\n", "\n");
  assert.equal(
    require("node:crypto").createHash("sha256").update(canonical).digest("hex"),
    "c34ebc79a2911f0a0b725205bfc6d450b1d79871a6dfd5117bc1d44c555e8481",
    "Canonical payment image workflow unchanged from 5ddec37",
  );
  console.log(
    "OCR history: result summaries, immutable authority, image exclusion, compact copy, complete debug file, lazy summaries/payload, remount, canonical image unchanged passed.",
  );
};
