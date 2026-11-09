/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    function req(name) {
      if (name in stubs) return stubs[name];
      if (!name.startsWith(".")) return require(name);
      const base = path.resolve(path.dirname(file), name);
      return load(
        [base, base + ".ts", base + ".tsx"].find((p) => fs.existsSync(p)),
      );
    }
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
  }
  return load;
}
const load = loader(),
  policy = load("src/app/lib/documentEmailPolicy.ts"),
  review = load("src/app/lib/documentEmailReview.ts");
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test-key-not-a-credential";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.invalid";
process.env.RESEND_API_KEY = "synthetic-provider-never-transmitted";
assert.equal(
  policy.estimateDepositSentence(10000, "Deposit: 50%."),
  "A deposit of $5,000.00 (50% of your $10,000.00 project estimate) is required to reserve your spot on our schedule and order the necessary materials.",
);
assert(
  policy.estimateDepositSentence(10000, "Deposit: 25%.").includes("$2,500.00"),
);
assert(
  !policy.estimateDepositSentence(10000, "Deposit: $3000.00.").includes("%"),
);
assert.equal(policy.estimateDepositSentence(10000, "Deposit: none."), "");
assert.throws(() => policy.estimateDepositSentence(10000, "Legacy terms"));
assert.throws(() => policy.estimateDepositSentence(100, "Deposit: $101.00."));
assert.equal(
  policy.estimateMoney({ estimate_amount: 100, tax_mode: "no_tax" }, [
    { line_total: "324.205" },
  ]).total,
  324.21,
);
const a = [
    {
      filename: "a.pdf",
      content: Buffer.from("%PDF- test").toString("base64"),
    },
  ],
  snapshot = { user: "u", business: "b", total: 100 },
  token = review.issueEmailReview(snapshot, a, 1000);
review.verifyEmailReview(token, true, snapshot, a, 1001);
for (const [t, approved, s, p, now] of [
  [token, false, snapshot, a, 1001],
  [token, true, { ...snapshot, total: 101 }, a, 1001],
  [token, true, snapshot, [{ ...a[0], content: "tamper" }], 1001],
  [token, true, snapshot, a, 2000000],
  ["forged", true, snapshot, a, 1001],
])
  assert.throws(() => review.verifyEmailReview(t, approved, s, p, now));
let checks = 0;
async function scenario(
  kind,
  {
    split = false,
    slug = "rnl-creations",
    purpose = "send",
    terms = "Deposit: 50%.",
    providerFailure = false,
    pdfFailure = false,
  } = {},
) {
  const record = {
    id: "doc",
    business_id: "b",
    client_id: "c",
    display_id: kind === "estimate" ? "EST-1" : "INV-1",
    customer_name: "Synthetic customer",
    project_title: "PRIVATE PLANNER TITLE",
    notes: "PRIVATE INTERNAL NOTES",
    invoice_amount: 10000,
    estimate_amount: 10000,
    amount_paid: 0,
    status: "Draft",
    tax_mode: "no_tax",
    tax_rate: 0,
    terms,
    deposit_status: purpose === "deposit" ? "requested" : "none",
    deposit_requested_amount: 5000,
    due_date: "2026-12-01",
  };
  if (split)
    Object.assign(record, {
      split_parent_invoice_id: "root",
      split_sequence: 1,
      split_count: 2,
    });
  const docs = split
    ? [
        record,
        { ...record, id: "doc2", display_id: "INV-2", split_sequence: 2 },
      ]
    : [record];
  let calls = 0,
    pdfs = 0,
    writes = [],
    lastPayload = null;
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "owner", email: "owner@example.test" } },
        error: null,
      }),
    },
    from(table) {
      let single = false,
        selected = "",
        filters = [],
        operation = null;
      const chain = new Proxy(
        {},
        {
          get(_t, k) {
            if (k === "then")
              return (resolve) => {
                let rows = [];
                if (table === kind + "s")
                  rows = selected === "split_parent_invoice_id" ? [] : docs;
                if (table === "clients")
                  rows = [
                    {
                      id: "c",
                      business_id: "b",
                      name: "Synthetic customer",
                      email: "customer@example.test",
                      cc_email: "cc@example.test",
                    },
                    { id: "other", name: "Other", email: "other@example.test" },
                  ];
                if (table === "businesses")
                  rows = [
                    {
                      id: "b",
                      slug,
                      name:
                        slug === "just-kleen" ? "Just Kleen" : "R&L Creations",
                    },
                  ];
                if (table === "business_users")
                  rows = [{ id: "membership", role: "owner" }];
                if (table === "business_settings")
                  rows = [{ value: { senderEmail: "owner@example.test" } }];
                if (table === kind + "_line_items")
                  rows = docs.map((d) => ({
                    id: "line-" + d.id,
                    business_id: "b",
                    invoice_id: d.id,
                    estimate_id: d.id,
                    description: "Synthetic service",
                    quantity: 1,
                    unit_price: 10000,
                    line_total: 10000,
                  }));
                for (const [k, v] of filters)
                  rows = rows.filter(
                    (r) =>
                      r[k] === undefined ||
                      (Array.isArray(v) ? v.includes(r[k]) : r[k] === v),
                  );
                resolve({
                  data: single ? (rows[0] ?? null) : rows,
                  error: null,
                });
              };
            return (...args) => {
              if (k === "select") selected = args[0];
              if (k === "eq" || k === "in") filters.push(args);
              if (k === "maybeSingle" || k === "single") single = true;
              if (["insert", "update", "delete"].includes(k)) {
                operation = k;
                writes.push({ table, operation, payload: args[0] });
              }
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  const oldFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://api.resend.com/emails",
      "No network except mocked provider",
    );
    calls++;
    lastPayload = JSON.parse(options.body);
    return new Response(
      JSON.stringify(
        providerFailure
          ? { message: "synthetic rejection" }
          : { id: "synthetic-provider-id" },
      ),
      { status: providerFailure ? 503 : 200 },
    );
  };
  const route = loader({
    "@supabase/supabase-js": { createClient: () => db },
    "../../../../lib/printPagePdf": {
      createPrintPagePdfAttachment: async () => {
        pdfs++;
        if (pdfFailure) throw Error("Synthetic PDF failure");
        return {
          filename: "synthetic-" + pdfs + ".pdf",
          content: Buffer.from("%PDF- synthetic-" + pdfs).toString("base64"),
        };
      },
    },
  })(`src/app/api/${kind}s/[id]/send-email/route.ts`);
  const base = {
    businessSlug: slug,
    recipientEmail: "customer@example.test",
    emailPurpose: purpose,
    sendSplitGroup: split,
    sendIdempotencyKey: "synthetic-" + kind,
  };
  async function post(body) {
    const res = await route.POST(
      new Request("https://app.example.test/api/" + kind + "s/doc/send-email", {
        method: "POST",
        headers: {
          authorization: "Bearer synthetic",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...base, ...body }),
      }),
      { params: Promise.resolve({ id: "doc" }) },
    );
    return { status: res.status, body: await res.json() };
  }
  try {
    const bypass = await post({ subject: "Bypass", message: "No review" });
    assert.equal(bypass.status, 409);
    assert.equal(calls, 0);
    assert.equal(writes.length, 0);
    if (kind === "invoice") {
      assert.equal(
        (
          await post({
            preflightOnly: true,
            mode: "prepare",
            recipientEmail: "other@example.test",
          })
        ).status,
        409,
        "Another known customer address is blocked",
      );
      if (purpose === "deposit") {
        record.amount_paid = 5000;
        assert.equal(
          (await post({ preflightOnly: true, mode: "prepare" })).status,
          409,
          "Already-paid deposit is blocked",
        );
        record.amount_paid = 0;
      } else if (!split) {
        record.deposit_status = "requested";
        record.deposit_requested_amount = 5000;
        assert.equal(
          (await post({ preflightOnly: true, mode: "prepare" })).status,
          409,
          "Deposit cannot be issued as final balance",
        );
        record.deposit_status = "none";
      }
    }
    const prepared = await post({ preflightOnly: true, mode: "prepare" });
    if (pdfFailure) {
      assert.equal(prepared.status, 502);
      assert.equal(calls, 0);
      assert.equal(writes.length, 0);
      return;
    }
    if (kind === "estimate" && !policy.readEstimatePolicy(terms)) {
      assert.equal(prepared.status, 409);
      assert.equal(calls, 0);
      return;
    }
    assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
    const draft = prepared.body;
    assert.equal(calls, 0);
    assert.equal(writes.length, 0);
    assert.equal(draft.attachments.length, split ? 2 : 1);
    assert(!draft.message.includes("PRIVATE"));
    assert(!draft.html.includes("PRIVATE"));
    assert(draft.message.includes("$10,000.00") || purpose === "deposit");
    if (slug === "just-kleen") {
      assert(!draft.html.includes("rnlcreations.com"));
      assert(!draft.html.includes("425-350"));
    } else
      assert.equal(draft.html.split("/v4/request-service.png").length - 1, 1);
    const send = {
      subject: draft.subject,
      message: draft.message,
      recipientEmail: draft.recipientEmail,
      ccEmail: draft.ccEmail,
      reviewAttachments: draft.attachments,
      reviewToken: draft.reviewToken,
      finalApproval: true,
    };
    assert.equal((await post({ ...send, finalApproval: false })).status, 409);
    assert.equal(
      (await post({ ...send, ccEmail: "changed@example.test" })).status,
      409,
    );
    assert.equal(
      (
        await post({
          ...send,
          message: draft.message + "\nNo deposit is needed.",
        })
      ).status,
      409,
    );
    record.amount_paid = 1;
    assert.equal(
      (await post(send)).status,
      409,
      "Stale document approval blocked",
    );
    record.amount_paid = 0;
    const badPdf = structuredClone(draft.attachments);
    badPdf[0].content = Buffer.from("%PDF- replaced").toString("base64");
    assert.equal(
      (await post({ ...send, reviewAttachments: badPdf })).status,
      409,
    );
    const cover = {
      subject: draft.subject,
      message: draft.message.replace("Hello,", "Dear customer,"),
      recipientEmail: "alternate@example.test",
      ccEmail: "",
    };
    const edited = await post({
      ...cover,
      preflightOnly: true,
      mode: "review",
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(calls, 0);
    assert.equal(writes.length, 0);
    const result = await post({
      ...cover,
      reviewAttachments: edited.body.attachments,
      reviewToken: edited.body.reviewToken,
      finalApproval: true,
    });
    assert.equal(
      result.status,
      providerFailure ? 503 : 200,
      JSON.stringify(result.body),
    );
    assert.equal(calls, 1);
    assert.deepEqual(lastPayload.attachments, edited.body.attachments);
    assert.equal(lastPayload.to[0], "alternate@example.test");
    assert(!lastPayload.cc);
    assert.equal(
      pdfs,
      (split ? 2 : 1) * 2,
      "Final send reuses exactly reviewed PDF bytes",
    );
    const statusWrites = writes.filter(
      (w) => w.table === kind + "s" && w.operation === "update",
    );
    assert.equal(
      statusWrites.length,
      providerFailure || purpose === "deposit" ? 0 : 1,
    );
    checks++;
  } finally {
    global.fetch = oldFetch;
  }
}
(async () => {
  const old = console.info;
  console.info = () => {};
  try {
    for (const terms of [
      "Deposit: 50%.",
      "Deposit: 25%.",
      "Deposit: $2500.00.",
      "Deposit: none.",
      "Legacy terms",
    ])
      await scenario("estimate", { terms });
    await scenario("invoice");
    await scenario("invoice", { split: true });
    await scenario("invoice", { purpose: "deposit" });
    await scenario("invoice", { slug: "just-kleen" });
    await scenario("estimate", { slug: "just-kleen" });
    await scenario("invoice", { providerFailure: true });
    await scenario("estimate", { providerFailure: true });
    await scenario("invoice", { pdfFailure: true });
    await scenario("estimate", { pdfFailure: true });
  } finally {
    console.info = old;
  }
  console.log(
    `PASS mandatory email review: ${checks} actual-route scenarios; signed approval/tampering/stale documents/exact PDFs/recipient+CC edits/deposits/splits/branding/provider failures. All network mocked.`,
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
