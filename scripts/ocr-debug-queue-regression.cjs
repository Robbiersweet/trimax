/* eslint-disable @typescript-eslint/no-require-imports -- Test harness injects authenticated server and browser adapters. */
const assert = require("node:assert/strict");
module.exports = async function debugQueueRegression(loader, React, renderer) {
  const helpers = loader()("src/app/lib/ocrDebug.ts");
  const history = require("../src/app/lib/ocrHistory.ts");
  const id = crypto.randomUUID(),
    retryId = crypto.randomUUID(),
    businessId = crypto.randomUUID();
  const summary = history.scanSummary(
    id,
    id,
    null,
    "existing",
    "build-verified",
  );
  const original = {
    id,
    business_id: businessId,
    created_at: summary.timestamp,
    original_id: id,
    parent_id: null,
    result: "failed",
    summary: {
      ...summary,
      result: "failed",
      reasons: ["No authoritative total"],
    },
    pinned: false,
    diagnostics_expires_at: null,
    diagnostic_bytes: 0,
    debug_status: "Needs Investigation",
    investigation_note: "",
    regression_id: "",
    investigated_at: null,
    resolved_at: null,
    debug_updated_at: null,
    debug_worthy: true,
  };
  const retry = {
    ...original,
    id: retryId,
    parent_id: id,
    result: "review",
    summary: {
      ...original.summary,
      attemptId: retryId,
      parentId: id,
      kind: "retry",
      result: "review",
    },
  };
  const cleanId = crypto.randomUUID();
  const clean = {
    ...original,
    id: cleanId,
    original_id: cleanId,
    result: "success",
    debug_worthy: false,
    summary: {
      ...summary,
      result: "success",
      reconciled: true,
      paymentCanApply: true,
    },
  };
  const business = {
    id: businessId,
    name: "Test workspace",
    slug: "test-workspace",
  };
  let user = true,
    admin = true;
  const calls = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: user ? { id: "user" } : null },
        error: null,
      }),
    },
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      return { data: admin, error: null };
    },
    from(table) {
      calls.push({ table });
      let rows = table === "businesses" ? [business] : [original, retry, clean];
      const chain = {
        select(columns) {
          calls.push({ table, columns });
          return chain;
        },
        eq(key, value) {
          rows = rows.filter((row) => row[key] === value);
          return chain;
        },
        neq(key, value) {
          rows = rows.filter((row) => row[key] !== value);
          return chain;
        },
        order() {
          return chain;
        },
        limit(count) {
          rows = rows.slice(0, count);
          return chain;
        },
        or() {
          return chain;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then(resolve) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  const nav = {
    redirect: (path) => {
      throw new Error("redirect:" + path);
    },
    notFound: () => {
      throw new Error("not-found");
    },
  };
  const load = loader({
    "./supabaseServer": { createSupabaseServerClient: async () => client },
    "next/navigation": nav,
  });
  const server = load("src/app/lib/ocrDebugServer.ts");
  const queue = await server.loadDebugQueue(
    business.slug,
    "Needs Investigation",
  );
  assert.deepEqual(
    queue.attempts.map((row) => row.id),
    [id, retryId],
  );
  assert.ok(calls.every((call) => !call.columns?.includes("payload")));
  assert.equal(
    (await server.loadDebugQueue(business.slug, "Failed")).attempts.length,
    1,
  );
  assert.equal(
    (await server.loadDebugQueue(business.slug, "Review Required")).attempts[0]
      .id,
    retryId,
  );
  assert.equal(
    (await server.loadDebugQueue(business.slug, "All Recent")).attempts.length,
    3,
  );
  const detail = await server.loadDebugAttempt(retryId);
  assert.equal(detail.attempt.parent_id, id);
  assert.equal(detail.family.length, 2);
  assert.ok(calls.every((call) => call.table !== "ocr_attempt_diagnostics"));
  admin = false;
  await assert.rejects(
    () => server.loadDebugQueue(business.slug, "All Recent"),
    /not-found/,
  );
  await assert.rejects(() => server.loadDebugAttempt(id), /not-found/);
  user = false;
  const count = calls.length;
  await assert.rejects(() => server.loadDebugAttempt(id), /redirect:\/login/);
  assert.equal(
    calls.length,
    count,
    "Unauthenticated requests must stop before data access",
  );
  user = true;
  admin = true;
  await assert.rejects(
    () => server.loadDebugAttempt("invalid-id"),
    /not-found/,
  );
  assert.equal(
    helpers.attemptPath(id, business.slug),
    `/admin/ocr-attempts/${id}?business=test-workspace`,
  );
  assert.equal(helpers.diagnosticsAvailable(original), false);
  assert.equal(
    helpers.diagnosticsAvailable({
      ...original,
      pinned: true,
      diagnostic_bytes: 1,
    }),
    true,
  );
  const secretView = helpers.safeDiagnosticView({
    api_key: "secret",
    nested: {
      accessToken: "secret",
      rawTokens: [{ token: "INV-0520", y: 10 }],
    },
  });
  assert.equal(secretView.api_key, "[REDACTED]");
  assert.equal(secretView.nested.accessToken, "[REDACTED]");
  assert.equal(secretView.nested.rawTokens[0].token, "INV-0520");
  let payloadLoads = 0,
    historyLoads = 0,
    clipboard = "";
  const oldWindow = global.window,
    oldNavigator = global.navigator;
  global.window = {
    location: { origin: "https://app.rnlcreations.com" },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => {
          clipboard = text;
        },
      },
    },
  });
  const clientStub = {
    flushScans: async () => {},
    pendingScans: async () => [],
    recentScans: async () => {
      historyLoads++;
      return [];
    },
    scanDiagnostics: async () => {
      payloadLoads++;
      return { report: "retained" };
    },
    pinScan: async () => {},
  };
  const moduleLoader = loader({ "../lib/ocrHistoryClient": clientStub });
  const RecentScans = moduleLoader(
    "src/app/components/RecentScans.tsx",
  ).default;
  let root;
  try {
    await renderer.act(async () => {
      root = renderer.create(
        React.createElement(RecentScans, {
          businessId,
          role: "admin",
          businessSlug: business.slug,
          standalone: true,
          initialAttempt: original,
          savedStatus: "",
        }),
      );
    });
    assert.equal(payloadLoads, 0);
    assert.equal(historyLoads, 0);
    assert.ok(JSON.stringify(root.toJSON()).includes(id));
    assert.equal(
      root.root
        .findAllByType("button")
        .find((node) => node.props.children === "Create Debug File").props
        .disabled,
      true,
      "Expired reports leave a readable summary",
    );
    const disclosure = root.root.findAllByType("details").at(-1);
    await renderer.act(async () => {
      await disclosure.props.onToggle({ currentTarget: { open: true } });
    });
    assert.equal(payloadLoads, 1);
    await renderer.act(async () => root.unmount());
    const writes = [];
    const metadataLoader = loader({
      "../lib/supabase": {
        supabase: {
          rpc: async (name, args) => {
            writes.push({ name, args });
            return { error: null };
          },
          from: (table) => {
            assert.equal(table, "ocr_attempt_debug");
            const chain = {
              select: () => chain,
              eq: () => chain,
              single: async () => ({
                data: { investigated_at: "2026-09-19", resolved_at: null },
                error: null,
              }),
            };
            return chain;
          },
        },
      },
    });
    const Metadata = metadataLoader(
      "src/app/components/OcrDebugMetadata.tsx",
    ).default;
    const before = JSON.stringify(original);
    await renderer.act(async () => {
      root = renderer.create(
        React.createElement(Metadata, {
          attempt: original,
          businessSlug: business.slug,
        }),
      );
    });
    await renderer.act(async () => {
      root.root
        .findAllByType("button")
        .find((node) => node.props.children === "Copy Attempt Link")
        .props.onClick();
    });
    assert.equal(
      clipboard,
      "https://app.rnlcreations.com" + helpers.attemptPath(id, business.slug),
    );
    await renderer.act(async () => {
      root.root
        .findByType("select")
        .props.onChange({ target: { value: "Investigated" } });
      root.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Observed unresolved header" } });
    });
    await renderer.act(async () => {
      await root.root
        .findByType("form")
        .props.onSubmit({ preventDefault() {} });
    });
    assert.deepEqual(writes, [
      {
        name: "trimax_update_ocr_debug",
        args: {
          p_id: id,
          p_status: "Investigated",
          p_note: "Observed unresolved header",
          p_regression_id: "",
        },
      },
    ]);
    assert.equal(JSON.stringify(original), before);
  } finally {
    if (root) await renderer.act(async () => root.unmount());
    global.window = oldWindow;
    Object.defineProperty(global, "navigator", {
      configurable: true,
      value: oldNavigator,
    });
  }
  console.log(
    "OCR Debug Queue: server authorization, default/quick filters, direct lookup, retry relations, summary-only reads, lazy evidence, expired summary, credential redaction, stable copy link and separate metadata writes passed.",
  );
};
