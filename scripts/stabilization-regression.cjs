/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness loads transpiled TS modules with injected dependencies. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const renderer = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const input =
      process.env.STABILIZATION_BASELINE &&
      file.replaceAll("\\", "/").endsWith("/estimates/new/page.tsx")
        ? require("node:child_process").execFileSync(
            "git",
            ["show", "HEAD:src/app/estimates/new/page.tsx"],
            { encoding: "utf8" },
          )
        : fs.readFileSync(file, "utf8");
    const source = ts.transpileModule(input, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    function localRequire(spec) {
      if (spec in stubs) return stubs[spec];
      if (spec.endsWith("/supabase") && stubs["../../lib/supabase"])
        return stubs["../../lib/supabase"];
      if (stubs.components && spec.includes("/components/"))
        return {
          default: (props) =>
            React.createElement("test-control", props, props.children),
        };
      if (!spec.startsWith(".")) return require(spec);
      const base = path.resolve(path.dirname(file), spec);
      return load(
        [base, base + ".ts", base + ".tsx"].find((p) => fs.existsSync(p)),
      );
    }
    new Function("require", "module", "exports", source)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  return load;
}

async function formRegression(withProfiles, invoice = false) {
  const calls = [];
  const clients = [
    {
      id: "north",
      name: "North Creek Apartments",
      service_address: "Everett",
      ...(withProfiles
        ? { tax_mode: "taxable", tax_label: "City A", tax_rate: 10 }
        : {}),
    },
    {
      id: "glen",
      name: "Glen North Creek",
      property_aliases: ["The Glenn At North Creek Apartments"],
      service_address: "Glen address",
      ...(withProfiles
        ? { tax_mode: "taxable", tax_label: "City B", tax_rate: 9.9 }
        : {}),
    },
    {
      id: "exempt",
      name: "Exempt Client",
      tax_mode: "no_tax",
      service_address: "",
    },
  ];
  const service = {
    id: "paint",
    name: "Classic Paint",
    description: "Paint",
    default_quantity: 1,
    default_unit_price: 900,
  };
  const tables = {
    businesses: {
      id: "business",
      slug: "test",
      name: "Test",
      split_warning_amount: 0,
    },
    clients,
    service_items: [service],
    client_service_overrides: [
      {
        client_id: "glen",
        service_item_id: "paint",
        unit_price: 1300,
        is_active: true,
      },
    ],
    queue_items: {
      id: "11111111-1111-4111-8111-111111111111",
      property: "North Creek Apartments",
      unit: "C126",
      paint_type: "Classic Paint",
    },
  };
  const supabase = {
    from(table) {
      calls.push(table);
      const chain = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then")
              return (resolve) => resolve({ data: tables[table], error: null });
            if (["insert", "update", "delete"].includes(key))
              throw Error("Form edit attempted data mutation");
            return () => chain;
          },
        },
      );
      return chain;
    },
  };
  const params = new URLSearchParams(
    invoice
      ? "business=test&clientId=north"
      : "business=test&queueId=11111111-1111-4111-8111-111111111111",
  );
  const load = loader({
    components: true,
    "next/navigation": {
      useSearchParams: () => params,
      useRouter: () => ({ push() {} }),
    },
    "../../lib/supabase": { supabase },
  });
  const Page = load(
    invoice
      ? "src/app/invoices/new/page.tsx"
      : "src/app/estimates/new/page.tsx",
  ).default;
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Page));
  });
  const control = (label) =>
    tree.root.findAll(
      (node) => node.props.label === label && node.type === "test-control",
    )[0];
  const select = (id) =>
    tree.root
      .findAllByType("select")
      .find((node) =>
        node
          .findAllByType("option")
          .some((option) => option.props.value === id),
      );
  const edit = async (label, value) =>
    renderer.act(async () => {
      control(label).props.onChange(value);
    });
  assert.equal(select("north").props.value, "north");
  await renderer.act(async () =>
    select("north").props.onChange({ target: { value: "glen" } }),
  );
  assert.equal(select("north").props.value, "glen");
  if (withProfiles) {
    assert.equal(control("Tax Label").props.value, "City B");
    assert.equal(control("Tax Rate (%)").props.value, "9.9");
  }
  await renderer.act(async () =>
    select("paint").props.onChange({ target: { value: "paint" } }),
  );
  assert.equal(control("Unit Price").props.value, "1300");
  const before = calls.length;
  for (const value of ["S", "Sn", "Sno", "Snoh", "Snoho", "Snohomish"]) {
    await edit("Tax Label", value);
    assert.equal(
      select("north").props.value,
      "glen",
      "Tax typing must not reselect queue client",
    );
    assert.equal(control("Tax Label").props.value, value);
  }
  for (const [label, value] of [
    ["Unit Price", "1325"],
    ["Description", "Document-only prep"],
    ["Qty", "2"],
    ["Project Title", "Unrelated project title"],
  ]) {
    await edit(label, value);
    assert.equal(select("north").props.value, "glen");
  }
  await edit("Tax Rate (%)", "8.75");
  assert.equal(select("north").props.value, "glen");
  assert.equal(
    calls.length,
    before,
    "No business or queue refetch on unrelated tax edits",
  );
  await renderer.act(async () =>
    select("north").props.onChange({ target: { value: "exempt" } }),
  );
  assert.equal(control("Service Address").props.value, "");
  assert.equal(control("Tax Rate (%)").props.value, "");
  await renderer.act(async () =>
    select("north").props.onChange({ target: { value: "north" } }),
  );
  assert.equal(select("north").props.value, "north");
  if (withProfiles) assert.equal(control("Tax Label").props.value, "City A");
  assert.equal(control("Unit Price").props.value, "900");
  assert.equal(service.default_unit_price, 900);
  assert.equal(
    control("Qty").props.value,
    "2",
    "Client repricing preserves document quantity",
  );
  await renderer.act(async () => tree.unmount());
}

async function tiersRegression(entered, supported) {
  global.window = { setTimeout() {} };
  const saved = [];
  const supabase = {
    from(table) {
      let payload;
      const chain = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then")
              return (resolve) => {
                if (payload && !supported && "easy_unit_price" in payload)
                  return resolve({
                    data: null,
                    error: { message: "easy_unit_price column is missing" },
                  });
                if (payload) saved.push({ ...payload, id: "service" });
                resolve({
                  data:
                    table === "businesses"
                      ? { id: "business", name: "Test", slug: "test" }
                      : saved,
                  error: null,
                });
              };
            return (value) => {
              if (key === "insert") payload = value;
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  const load = loader({
    components: true,
    "next/navigation": {
      useSearchParams: () => new URLSearchParams("business=test"),
    },
    "../../lib/supabase": { supabase },
    "../lib/supabase": { supabase },
  });
  const Page = load("src/app/services/page.tsx").default;
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Page));
  });
  const controls = () => tree.root.findAllByType("test-control");
  const button = (text) =>
    controls().find((n) => n.props.children === text && n.props.onClick);
  await renderer.act(async () => button("+ New Service").props.onClick());
  const edit = async (label, value) =>
    renderer.act(async () =>
      controls()
        .find((n) => n.props.label === label)
        .props.onChange(value),
    );
  await edit("Service Name", "Test Service");
  await edit("Default Unit Price", "100");
  if (entered) {
    const tierButton = tree.root
      .findAllByType("button")
      .find(
        (n) =>
          n.props.onClick &&
          n.findAll(
            (node) =>
              typeof node.props.children === "string" &&
              node.props.children.includes("Pricing"),
          ).length,
      );
    if (tierButton) await renderer.act(async () => tierButton.props.onClick());
    else {
      const b = controls().find(
        (n) =>
          n.props.onClick &&
          JSON.stringify(n.props.children)?.includes("Pricing"),
      );
      if (b) await renderer.act(async () => b.props.onClick());
    }
    await edit("Easy Unit Price", "80");
    await edit("Normal Unit Price", "100");
    await edit("Difficult Unit Price", "150");
  }
  await renderer.act(async () => button("Create Service").props.onClick());
  assert.equal(saved.length, 1);
  const toast = controls().find((n) => n.props.message);
  assert.equal(toast.props.type, entered && !supported ? "error" : "success");
  assert.ok(!toast.props.message.includes("SQL"));
  if (entered && supported)
    assert.deepEqual(
      [
        saved[0].easy_unit_price,
        saved[0].normal_unit_price,
        saved[0].difficult_unit_price,
      ],
      [80, 100, 150],
    );
  await renderer.act(async () => tree.unmount());
}

async function sendPanelRegression(ok) {
  let sent = false,
    refreshed = false,
    payload;
  const supabase = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
      getUser: async () => ({ data: { user: { email: "owner@example.com" } } }),
    },
    from() {
      const chain = new Proxy(
        {},
        {
          get(_t, key) {
            if (key === "then")
              return (resolve) => resolve({ data: null, error: null });
            return () => chain;
          },
        },
      );
      return chain;
    },
  };
  const originalFetch = global.fetch;
  global.fetch = async (url, request) => {
    assert.equal(url, "/api/invoices/invoice/send-email");
    payload = JSON.parse(request.body);
    return {
      ok,
      json: async () =>
        ok
          ? { sentAt: "2026-09-16T00:00:00Z", attachmentCount: 2 }
          : { error: "Provider unavailable" },
    };
  };
  const load = loader({
    "next/navigation": {
      useRouter: () => ({
        refresh() {
          refreshed = true;
        },
      }),
    },
    "../lib/supabase": { supabase },
    "../../lib/supabase": { supabase },
  });
  const Panel = load("src/app/components/InvoiceEmailSendPanel.tsx").default;
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(
      React.createElement(Panel, {
        compact: true,
        documentId: "invoice",
        businessId: "business",
        businessSlug: "test",
        businessName: "Test",
        customerName: "Client",
        recipientEmail: "client@example.com",
        documentNumber: "INV-1",
        amountDue: "$100",
        dueDate: "",
        printHref: "/",
        sendSplitGroup: true,
        splitGroupCount: 2,
        onSent() {
          sent = true;
        },
      }),
    );
  });
  await renderer.act(async () =>
    tree.root
      .findAllByType("button")
      .find((button) => button.props.onClick)
      .props.onClick(),
  );
  assert.equal(payload.sendSplitGroup, true);
  assert.equal(payload.attachOfficialPdf, true);
  assert.equal(payload.recipientEmail, "client@example.com");
  assert.equal(sent, ok);
  assert.equal(refreshed, ok);
  await renderer.act(async () => tree.unmount());
  global.fetch = originalFetch;
}

async function sendApiRegression(scenario) {
  const invoice = {
    id: "invoice",
    business_id: "business",
    client_id: "client",
    customer_name: "Client Alpha",
    project_title: "Client Alpha Unit 2",
    display_id: "INV-1",
    invoice_amount: 100,
    amount_paid: 0,
    status: "Draft",
    tax_mode: "no_tax",
  };
  const client = {
    id: "client",
    name: "Client Alpha",
    email: "client@example.com",
    cc_email: null,
  };
  const split = scenario.startsWith("split");
  if (split) {
    invoice.split_parent_invoice_id = "root";
    invoice.split_count = 2;
    invoice.split_sequence = 1;
  }
  const members = split
    ? [
        invoice,
        { ...invoice, id: "second", display_id: "INV-2", split_sequence: 2 },
      ]
    : [invoice];
  let pdfCount = 0,
    mutations = 0,
    networkCalls = 0;
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "user", email: "owner@example.com" } },
        error: null,
      }),
    },
    from(table) {
      const filters = [];
      let single = false,
        selected = "";
      const chain = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then")
              return (resolve) => {
                let rows = [];
                if (table === "invoices")
                  rows = selected === "split_parent_invoice_id" ? [] : members;
                if (table === "clients") rows = [client];
                if (table === "businesses")
                  rows = [{ id: "business", slug: "test", name: "Test" }];
                if (table === "business_users")
                  rows = [{ id: "membership", role: "owner" }];
                if (table === "business_settings")
                  rows = [{ value: { senderEmail: "owner@example.com" } }];
                if (table === "activity_logs" && scenario === "already_sent")
                  rows = [{ entity_id: "invoice" }];
                if (table === "invoice_line_items")
                  rows = members.map((item) => ({
                    invoice_id: item.id,
                    description: "Paint",
                    quantity: 1,
                    unit_price: 100,
                    line_total: 100,
                  }));
                for (const [column, value] of filters)
                  rows = rows.filter(
                    (row) => row[column] === undefined || row[column] === value,
                  );
                resolve({
                  data: single ? (rows[0] ?? null) : rows,
                  error:
                    scenario === "proof_error" && table === "activity_logs"
                      ? { message: "unavailable" }
                      : null,
                });
              };
            return (...args) => {
              if (["insert", "update", "delete"].includes(key)) {
                mutations++;
                throw Error("Preflight must not mutate data");
              }
              if (key === "select") selected = args[0];
              if (key === "eq") filters.push(args);
              if (key === "maybeSingle") single = true;
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  const savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-key";
  const oldFetch = global.fetch,
    oldLog = console.info,
    oldError = console.error;
  global.fetch = async () => {
    networkCalls++;
    throw Error("No real provider calls in preflight tests");
  };
  console.info = () => {};
  console.error = () => {};
  try {
    const load = loader({
      "@supabase/supabase-js": { createClient: () => supabase },
      "../../../../lib/printPagePdf": {
        createPrintPagePdfAttachment: async () => {
          pdfCount++;
          if (scenario === "pdf_error") throw Error("PDF unavailable");
          return { filename: "invoice.pdf", content: "mock-pdf" };
        },
      },
    });
    const { POST } = load("src/app/api/invoices/[id]/send-email/route.ts");
    const response = await POST(
      new Request("https://app.example.com/api/invoices/invoice/send-email", {
        method: "POST",
        headers: {
          authorization: "Bearer mock",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          preflightOnly: true,
          businessSlug: "test",
          recipientEmail:
            scenario === "wrong_recipient" ? "other@example.com" : client.email,
          subject: "Readiness",
          message: "Readiness",
          sendSplitGroup: split && scenario !== "split_single",
        }),
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );
    const result = await response.json();
    const ready = ["ready", "split_ready"].includes(scenario);
    assert.equal(response.ok, ready, JSON.stringify(result));
    if (ready) {
      assert.equal(result.ready, true);
      assert.equal(pdfCount, split ? 2 : 1);
      assert.equal(result.attachmentCount, pdfCount);
    }
    assert.equal(mutations, 0);
    assert.equal(networkCalls, 0);
  } finally {
    global.fetch = oldFetch;
    console.info = oldLog;
    console.error = oldError;
    if (savedEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
    if (savedEnv.key === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key;
  }
}

async function main() {
  for (const kind of ["estimates", "invoices"]) {
    const record = {
      id: "doc",
      business_id: "business",
      client_id: "client",
      customer_name: "Client",
      project_title: "Saved project",
      service_address: "Everett",
      tax_mode: "taxable",
      tax_label: "Tax",
      tax_rate: 0,
      status: "Draft",
      amount_paid: 0,
    };
    const tables = {
      businesses: { id: "business", slug: "test" },
      [kind]: [record],
      clients: [
        {
          id: "client",
          name: "Client",
          tax_mode: "taxable",
          tax_label: "New default",
          tax_rate: 15,
        },
      ],
      service_items: [],
      client_service_overrides: [],
      [kind === "invoices" ? "invoice_line_items" : "estimate_line_items"]: [
        { description: "Paint", quantity: 1, unit_price: 100, line_total: 100 },
      ],
    };
    const supabase = {
      from(table) {
        let single = false;
        const chain = new Proxy(
          {},
          {
            get(_target, key) {
              if (key === "then")
                return (resolve) =>
                  resolve({
                    data:
                      single && Array.isArray(tables[table])
                        ? tables[table][0]
                        : (tables[table] ?? []),
                    error: null,
                  });
              return () => {
                if (key === "maybeSingle") single = true;
                return chain;
              };
            },
          },
        );
        return chain;
      },
    };
    const router = {
      push() {
        throw Error("Unexpected navigation");
      },
    };
    const load = loader({
      components: true,
      "next/navigation": {
        useParams: () => ({ id: "doc" }),
        useSearchParams: () => new URLSearchParams("business=test"),
        useRouter: () => router,
      },
      "../../lib/supabase": { supabase },
    });
    const Page = load(`src/app/${kind}/[id]/edit/page.tsx`).default;
    let tree;
    await renderer.act(async () => {
      tree = renderer.create(React.createElement(Page));
    });
    const control = (label) =>
      tree.root
        .findAllByType("test-control")
        .find((node) => node.props.label === label);
    assert.equal(control("Tax Label").props.value, "Tax");
    assert.equal(control("Tax Rate (%)").props.value, "0");
    await renderer.act(async () =>
      control("Tax Label").props.onChange("Document override"),
    );
    assert.equal(control("Tax Label").props.value, "Document override");
    assert.equal(control("Tax Rate (%)").props.value, "0");
    await renderer.act(async () => tree.unmount());
  }
  for (const scenario of [
    "ready",
    "split_ready",
    "split_single",
    "already_sent",
    "proof_error",
    "wrong_recipient",
    "pdf_error",
  ])
    await sendApiRegression(scenario);
  await sendPanelRegression(false);
  await sendPanelRegression(true);
  await tiersRegression(false, false);
  await tiersRegression(true, true);
  await tiersRegression(true, false);
  await formRegression(false);
  await formRegression(true);
  await formRegression(true, true);
  const load = loader();
  const { resolveQueueAction } = load("src/app/lib/queueAction.ts");
  const clients = [
    { id: "a", name: "Client Alpha", email: "a@example.com" },
    { id: "b", name: "Client Beta", email: "b@example.com" },
  ];
  const doc = {
    id: "d",
    client_id: "a",
    customer_name: "Client Alpha",
    project_title: "Client Alpha Unit 2",
    status: "Draft",
    invoice_amount: 100,
    estimate_amount: 100,
    tax_mode: "no_tax",
    lineItems: [
      { description: "Paint", quantity: 1, unit_price: 100, line_total: 100 },
    ],
  };
  const base = {
    queueId: "q",
    businessSlug: "test",
    estimate: null,
    invoice: null,
    packageInvoices: [],
    clients,
    sentIds: [],
    activeSession: false,
    closed: false,
    pdfReady: true,
  };
  assert.equal(resolveQueueAction(base).label, "Create Estimate");
  assert.equal(
    resolveQueueAction({ ...base, estimate: { ...doc, lineItems: [] } }).label,
    "Finish Estimate",
  );
  assert.equal(
    resolveQueueAction({ ...base, estimate: doc }).label,
    "Create Invoice",
  );
  const ready = { ...base, estimate: doc, invoice: doc };
  assert.equal(resolveQueueAction(ready).label, "Send Invoice");
  for (const invoice of [
    { ...doc, lineItems: [] },
    { ...doc, client_id: "b" },
    { ...doc, tax_mode: "taxable", tax_rate: null },
    { ...doc, status: "Superseded" },
    { ...doc, split_parent_invoice_id: "root", split_count: 2 },
  ])
    assert.notEqual(
      resolveQueueAction({ ...ready, invoice }).label,
      "Send Invoice",
    );
  assert.notEqual(
    resolveQueueAction({ ...ready, clients: [{ ...clients[0], email: null }] })
      .label,
    "Send Invoice",
  );
  assert.notEqual(
    resolveQueueAction({
      ...ready,
      clients: [{ ...clients[0], cc_email: "bad" }],
    }).label,
    "Send Invoice",
  );
  assert.notEqual(
    resolveQueueAction({ ...ready, pdfReady: false }).label,
    "Send Invoice",
  );
  assert.equal(
    resolveQueueAction({ ...ready, sentIds: ["d"] }).label,
    "Start Job",
  );
  assert.equal(
    resolveQueueAction({ ...ready, activeSession: true }).label,
    "Manage Session",
  );
  const split = [
    { ...doc, id: "one", split_parent_invoice_id: "d", split_count: 2 },
    { ...doc, id: "two", split_parent_invoice_id: "d", split_count: 2 },
  ];
  assert.equal(
    resolveQueueAction({ ...ready, packageInvoices: split }).label,
    "Send Invoice",
  );
  assert.notEqual(
    resolveQueueAction({ ...ready, packageInvoices: split, sentIds: ["one"] })
      .label,
    "Send Invoice",
  );
  console.log(
    "Stabilization regressions passed: real React hydration, client switching, tax overrides, queue lifecycle, recipient/CC, identity, PDF gate, split and session behavior.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
