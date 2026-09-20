/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness loads transpiled TS modules with injected dependencies. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
// React act() is a test-only API. Vercel invokes this harness with NODE_ENV=production.
// Scope test mode to this process before React loads; the subsequent app build keeps production mode.
process.env.NODE_ENV = "test";
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
      auto_split_enabled: true,
      service_address: "11401 3rd Ave SE, Everett, WA 98208",
      ...(withProfiles
        ? { tax_mode: "taxable", tax_label: "City A", tax_rate: 10 }
        : {}),
    },
    {
      id: "glen",
      name: "Glen North Creek",
      auto_split_enabled: false,
      property_aliases: ["The Glenn At North Creek Apartments"],
      service_address: "12115 Meridian Avenue S\nEverett, WA 98208",
      email: "manager@glenatnorthcreek.com",
      cc_email: "manager@northcreekateverett.com",
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
  const splitCheckbox = () =>
    tree.root
      .findAllByType("input")
      .find(
        (node) =>
          node.props.type === "checkbox" &&
          node.parent.findAll(
            (child) =>
              typeof child.props.children === "string" &&
              child.props.children.includes("Split this apartment paint"),
          ).length,
      );
  assert.equal(
    splitCheckbox().props.checked,
    true,
    "New North Creek document uses its configured ON default before the threshold is reached",
  );
  assert.equal(select("north").props.value, "north");
  await renderer.act(async () =>
    select("north").props.onChange({ target: { value: "glen" } }),
  );
  assert.equal(select("north").props.value, "glen");
  assert.equal(
    control("Service Address").props.value,
    clients[1].service_address,
  );
  if (withProfiles) {
    assert.equal(control("Tax Label").props.value, "City B");
    assert.equal(control("Tax Rate (%)").props.value, "9.9");
  }
  await renderer.act(async () =>
    select("paint").props.onChange({ target: { value: "paint" } }),
  );
  assert.equal(control("Unit Price").props.value, "1300");
  assert.equal(
    splitCheckbox().props.checked,
    false,
    "Paint pricing cannot turn the property split default ON",
  );
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
    splitCheckbox().props.checked,
    true,
    "Switching back restores North Creek default",
  );
  assert.equal(
    control("Service Address").props.value,
    clients[0].service_address,
  );
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

async function sendPanelRegression(ok, compact = true) {
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
        compact,
        documentId: "invoice",
        businessId: "business",
        businessSlug: "test",
        businessName: "Test",
        customerName: "Client",
        recipientEmail: "manager@glenatnorthcreek.com",
        clientCcEmail: "manager@northcreekateverett.com",
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
  const visibleRouting = JSON.stringify(tree.toJSON());
  assert.ok(visibleRouting.includes("manager@glenatnorthcreek.com"));
  assert.ok(visibleRouting.includes("manager@northcreekateverett.com"));
  const originalProps = tree.root.findByType(Panel).props;
  await renderer.act(async () =>
    tree.update(
      React.createElement(Panel, {
        ...originalProps,
        documentId: "north-invoice",
        recipientEmail: "manager@northcreekateverett.com",
        clientCcEmail: "asstmanager@northcreekateverett.com",
      }),
    ),
  );
  const northRouting = JSON.stringify(tree.toJSON());
  assert.ok(northRouting.includes("manager@northcreekateverett.com"));
  assert.ok(northRouting.includes("asstmanager@northcreekateverett.com"));
  assert.ok(
    !northRouting.includes("manager@glenatnorthcreek.com"),
    "Previous Glen recipient must not leak into North Creek",
  );
  await renderer.act(async () =>
    tree.update(React.createElement(Panel, originalProps)),
  );
  assert.ok(
    JSON.stringify(tree.toJSON()).includes("manager@glenatnorthcreek.com"),
  );
  if (!compact) {
    await renderer.act(async () => tree.unmount());
    global.fetch = originalFetch;
    return;
  }
  await renderer.act(async () =>
    tree.root
      .findAllByType("button")
      .find((button) => button.props.onClick)
      .props.onClick(),
  );
  assert.equal(payload.sendSplitGroup, true);
  assert.equal(payload.attachOfficialPdf, true);
  assert.equal(payload.recipientEmail, "manager@glenatnorthcreek.com");
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
    email: "manager@glenatnorthcreek.com",
    cc_email: "manager@northcreekateverett.com",
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
      assert.equal(result.recipientEmail, client.email);
      assert.equal(result.ccEmail, client.cc_email);
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

async function splitPreferenceRegression(
  kind,
  choice,
  propertyDefault,
  initialValue = !choice,
) {
  const record = {
    id: "doc",
    business_id: "business",
    client_id: "client",
    customer_name: "Glen North Creek",
    project_title: "Apartment Unit 8",
    service_address: "Everett",
    status: "Draft",
    tax_mode: "taxable",
    tax_label: "Saved tax",
    tax_rate: 9.9,
    amount_paid: 0,
    split_warning_enabled: initialValue,
    split_target_amount: 1300,
    split_parent_invoice_id: kind === "invoices" ? "existing-parent" : null,
  };
  let payload;
  const tables = {
    businesses: { id: "business", slug: "test", split_warning_amount: 1300 },
    [kind]: [record],
    clients: [
      {
        id: "client",
        name: record.customer_name,
        auto_split_enabled: propertyDefault,
        split_target_amount: 1300,
      },
    ],
    service_items: [],
    client_service_overrides: [],
    [kind === "invoices" ? "invoice_line_items" : "estimate_line_items"]: [
      {
        description: "Classic Paint",
        quantity: 1,
        unit_price: 1300,
        line_total: 1300,
      },
    ],
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from(table) {
      let single = false,
        update;
      const chain = new Proxy(
        {},
        {
          get(_t, key) {
            if (key === "then")
              return (resolve) => {
                if (update && table === kind) {
                  payload = { ...update };
                  Object.assign(record, update);
                }
                resolve({
                  data:
                    single && Array.isArray(tables[table])
                      ? tables[table][0]
                      : (tables[table] ?? []),
                  error: null,
                });
              };
            return (value) => {
              if (key === "maybeSingle") single = true;
              if (key === "update") update = value;
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  const router = { push() {} };
  const load = loader({
    components: true,
    "next/navigation": {
      useParams: () => ({ id: "doc" }),
      useSearchParams: () => new URLSearchParams("business=test"),
      useRouter: () => router,
    },
    "../../lib/supabase": { supabase },
    "../../../lib/maintenanceMode": {
      assertCanWriteDuringMaintenance: async () => {},
    },
    "../../../lib/activityLog": { logActivity: async () => {} },
  });
  const Page = load(`src/app/${kind}/[id]/edit/page.tsx`).default;
  let tree;
  const mount = async () =>
    renderer.act(async () => {
      tree = renderer.create(React.createElement(Page));
    });
  const checkbox = () =>
    tree.root
      .findAllByType("input")
      .find(
        (node) =>
          node.props.type === "checkbox" &&
          node.parent.findAll(
            (child) =>
              typeof child.props.children === "string" &&
              child.props.children.includes("Split this apartment paint"),
          ).length,
      );
  await mount();
  if (initialValue === null)
    assert.equal(
      checkbox().props.checked,
      false,
      "Legacy null does not hydrate a property default into an existing document",
    );
  await renderer.act(async () =>
    checkbox().props.onChange({ target: { checked: choice } }),
  );
  assert.equal(
    checkbox().props.checked,
    choice,
    "Explicit checkbox choice before save",
  );
  await renderer.act(async () =>
    tree.root
      .findAllByType("test-control")
      .find((node) => node.props.children === "Save Changes")
      .props.onClick(),
  );
  assert.equal(
    payload?.split_warning_enabled,
    choice,
    "Save payload preserves boolean choice",
  );
  assert.equal(
    record.split_warning_enabled,
    choice,
    "Stored choice matches save payload",
  );
  assert.equal(
    record.split_parent_invoice_id,
    kind === "invoices" ? "existing-parent" : null,
    "Existing split relationship preserved",
  );
  await renderer.act(async () => tree.unmount());
  await mount();
  console.log(
    `${kind} split cycle: UI=${choice}, payload=${payload.split_warning_enabled}, stored=${record.split_warning_enabled}, reopened=${checkbox().props.checked}, property=${propertyDefault}`,
  );
  assert.equal(
    checkbox().props.checked,
    choice,
    "Saved explicit choice must survive reopening",
  );
  await renderer.act(async () => tree.unmount());
}

async function conversionSplitPreferenceRegression(enabled) {
  const estimate = {
    id: "estimate",
    business_id: "business",
    client_id: "client",
    customer_name: "Client Alpha",
    project_title: "Client Alpha Unit 8",
    estimate_amount: 1428.7,
    tax_mode: "taxable",
    tax_label: "Saved tax",
    tax_rate: 9.9,
    split_warning_enabled: enabled,
    split_target_amount: 1300,
  };
  let inserted,
    splitCalls = 0;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from(table) {
      let payload;
      const chain = new Proxy(
        {},
        {
          get(_target, key) {
            if (key === "then")
              return (resolve) => {
                if (table === "invoices" && payload)
                  inserted = { ...payload, id: "new-invoice" };
                const data =
                  table === "estimates"
                    ? estimate
                    : table === "clients"
                      ? [
                          {
                            id: "client",
                            name: "Client Alpha",
                            auto_split_enabled: !enabled,
                          },
                        ]
                      : table === "estimate_line_items"
                        ? [
                            {
                              description: "Classic Paint",
                              quantity: 1,
                              unit_price: 1300,
                              line_total: 1300,
                            },
                          ]
                        : table === "invoices"
                          ? (inserted ?? null)
                          : null;
                resolve({ data, error: null });
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
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "../lib/supabase": { supabase },
    "../lib/maintenanceMode": {
      assertCanWriteDuringMaintenance: async () => {},
    },
    "../lib/activityLog": { logActivity: async () => {} },
    "../lib/documentNumbers": {
      getNextDocumentDisplayId: async () => "INV-TEST",
    },
    "../lib/splitInvoices": {
      createSplitInvoices: async () => {
        splitCalls++;
        return [];
      },
    },
  });
  const Convert = load(
    "src/app/components/ConvertEstimateToInvoiceButton.tsx",
  ).default;
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(
      React.createElement(Convert, {
        estimateId: estimate.id,
        businessId: estimate.business_id,
        businessSlug: "test",
        clientId: estimate.client_id,
        customerName: estimate.customer_name,
        projectTitle: estimate.project_title,
        invoiceAmount: "$1428.70",
        notes: "",
        splitTargetAmount: 1300,
      }),
    );
  });
  await renderer.act(async () =>
    tree.root.findByType("button").props.onClick(),
  );
  assert.equal(
    inserted?.split_warning_enabled,
    enabled,
    "Conversion copies the explicit estimate choice",
  );
  assert.equal(
    splitCalls,
    enabled ? 1 : 0,
    "Conversion only invokes splitting for explicit ON",
  );
  assert.equal(inserted.client_id, estimate.client_id);
  assert.equal(inserted.tax_rate, 9.9);
  await renderer.act(async () => tree.unmount());
}

async function queueBlockerRegression() {
  const load = loader({
    "next/link": { default: (props) => React.createElement("a", props, props.children) },
    "../../lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    "./InvoiceEmailSendPanel": { default: () => null },
  });
  const Component = load("src/app/components/QueueInvoiceAction.tsx").default;
  const { resolveQueueAction } = load("src/app/lib/queueAction.ts");
  const invoice = { id: "invoice", client_id: "client", customer_name: "Alpha", project_title: "Alpha Unit 2", status: "Draft", invoice_amount: 100, tax_mode: "no_tax", lineItems: [{ description: "Paint", quantity: 1, unit_price: 100 }] };
  const base = { queueId: "queue", businessSlug: "rnl-creations", invoice, estimate: null, packageInvoices: [], clients: [{ id: "client", name: "Alpha", email: "manager@example.com" }], sentIds: [], activeSession: false, closed: false };
  const priorObserver = global.IntersectionObserver;
  const priorFetch = global.fetch;
  global.IntersectionObserver = class { constructor(callback) { this.callback = callback; } observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} };
  try {
    const cases = [
      { name: "recipient", context: { ...base, clients: [{ ...base.clients[0], email: "" }] } },
      { name: "tax", context: { ...base, invoice: { ...invoice, tax_mode: null } } },
      { name: "identity", context: { ...base, invoice: { ...invoice, client_id: "missing" } } },
      { name: "split", context: { ...base, invoice: { ...invoice, split_count: 2 } } },
      { name: "multiple", context: { ...base, invoice: { ...invoice, client_id: "missing", tax_mode: null } } },
      { name: "pdf failure", context: base, error: "Official invoice PDF could not be generated." },
      { name: "ready", context: base, ready: true },
    ];
    for (const test of cases) {
      let requests = 0;
      global.fetch = async (_url, options) => {
        requests++;
        assert.equal(JSON.parse(options.body).preflightOnly, true);
        return { ok: Boolean(test.ready), json: async () => ({ ready: test.ready, error: test.error }) };
      };
      let tree;
      await renderer.act(async () => { tree = renderer.create(React.createElement(Component, { context: test.context, lifecycleStatus: "Ready To Send", email: { documentId: "invoice", businessSlug: "rnl-creations", recipientEmail: "manager@example.com" } }), { createNodeMock: () => ({}) }); });
      const output = JSON.stringify(tree.toJSON());
      const action = resolveQueueAction({ ...test.context, pdfReady: Boolean(test.ready), preflightError: test.error });
      if (test.ready) {
        assert.ok(output.includes("Send Invoice"));
        assert.ok(output.includes("Ready To Send"));
        assert.equal(tree.root.findAllByProps({ role: "status" }).length, 0);
      } else {
        assert.ok(output.includes("Finish Invoice"), test.name);
        assert.ok(output.includes("Needs Review"), test.name);
        assert.ok(!output.includes("Ready To Send"), test.name);
        const note = tree.root.findByProps({ role: "status" });
        assert.equal(note.children[0], action.blockedReason, test.name);
        if (action.missingRequirements.length > 1) assert.ok(JSON.stringify(note.children[1].props.children).includes(String(action.missingRequirements.length - 1)));
      }
      assert.equal(requests, test.ready || test.error ? 1 : 0);
      await renderer.act(async () => tree.unmount());
    }
  } finally { global.fetch = priorFetch; global.IntersectionObserver = priorObserver; }
  console.log("Queue blocker UI: recipient, tax, identity, split, priority, PDF failure, ready and consistent badges passed.");
}

async function contractHandoffRegression() {
  const contract = require('../src/app/lib/remittanceAttempt.ts');
  const source = fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8');
  const start = source.indexOf('  function loadExtractedRemittance(');
  const end = source.indexOf('  function loadCheckDetailsFromExtraction(',start);
  const fn = source.slice(start,end);
  const invoice = { id:'one', displayId:'INV-1234', customerName:'Fixture Property', projectTitle:'U05 Paint', invoiceAmount:220,amountPaid:0,amountDue:220,status:'sent' };
  const row = { rowId:'row-1',text:'INV1234 U05 Paint 220.00',source:{region:'document',variant:'original',pageMode:'sparse'},rawInvoiceLikeTokens:['INV1234'],normalizedInvoiceCandidates:['INV-1234'],unitLikeTokens:['U05'],dateTokens:[],amountCandidates:[{raw:'220.00',value:220,selected:true}] };
  const rawPasses = [{text:'PAYOR: Fixture Property\nCHECK 1234 TOTAL $220.00',region:'document',variant:'original',pageMode:'sparse',words:[]}];
  const evidence = contract.createRemittanceEvidence({attemptId:'handoff',capture:{source:'existing',image:{width:1000,height:800,bytes:1,mime:'image/jpeg'},quality:{},sources:[],selectionReason:'existing photo'},rawPasses,headerEvidence:contract.selectObservedHeader(rawPasses,[row]),physicalRows:[row],assignments:[],diagnostics:[]});
  const state = {};
  const bindings = {...contract, payableInvoices:[invoice], checkImageName:'fixture.jpg', formatMoney:value=>value.toFixed(2), matchInvoicesFromExtraction:()=>[], uniqueReviewMatchesById:matches=>({matches,duplicateIds:[]})};
  for(const name of new Set(fn.match(/set[A-Z][A-Za-z]+/g)))bindings[name]=value=>{state[name.slice(3)]=typeof value==='function'?value(state[name.slice(3)]):value;};
  const compiled=ts.transpileModule(fn+'\nreturn loadExtractedRemittance;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const load=new Function(...Object.keys(bindings),compiled)(...Object.values(bindings));
  const result=load({evidence,stubText:'Legacy conflicting INV9999 TOTAL 29',totalAmount:29,checkNumber:'wrong'},'', 'handoff',null,{invoices:[invoice],activities:[],role:'owner',receivedDate:'2026-09-17'});
  assert.equal(state.CheckAmount,'220.00');assert.equal(state.PaymentReference,'1234');assert.deepEqual(state.SelectedIds,['one']);assert.equal(state.OcrReconciliationVerified,true);
  assert.equal(result.attempt.evidence.rawPasses[0].text,rawPasses[0].text);
  const rejected=load({stubText:'INV1234 TOTAL $220.00',totalAmount:220},'', 'missing-contract',null,{invoices:[invoice],activities:[],role:'owner',receivedDate:'2026-09-17'});
  assert.equal(state.OcrReconciliationVerified,false);assert.deepEqual(state.SelectedIds,[]);assert.equal(rejected.attempt.reconciliationResult.eligible,false);
  console.log('Actual Payment Review handoff uses immutable contract, rejects missing contract, and ignores conflicting legacy totals/identifiers.');
}

async function retryStateRegression() {
  const source = fs.readFileSync("src/app/components/BatchInvoicePayments.tsx", "utf8");
  const gate = source.slice(source.indexOf("  const paymentCanApply =") + "  const paymentCanApply =".length, source.indexOf(";", source.indexOf("  const paymentCanApply =")));
  const validGate = { attemptAllowsApply: () => true, activeRemittanceAttempt: {}, selectedIds: ["one"], reviewMatchedInvoices: [{id:"one"}], duplicateRemittanceCheck: {status:"none"}, isSaving: false, paymentEntryMode: "photo", checkOcrStatus: "ready", ocrReconciliationVerified: true, selectedInvoices: [{ id: "one" }], enteredCheckAmount: 5495, checkAmountMatches: true, isRemittanceReview: true, isPreparingCrop: false, extractedPaymentAmount: 5495, selectedTotal: 5495, reviewMatchedTotal: 5495, hasDuplicateSelectedInvoiceIds: false, hasDuplicateReviewInvoiceIds: false, selectedReviewSetsMatch: true };
  const allowed = (overrides = {}) => { const values = { ...validGate, ...overrides }; return new Function(...Object.keys(values), "return (" + gate + ");")(...Object.values(values)); };
  assert.equal(allowed(), true);
  for (const overrides of [{ ocrReconciliationVerified: false }, { checkOcrStatus: "manual", isRemittanceReview: false }, { hasDuplicateSelectedInvoiceIds: true }, { selectedTotal: 4396 }, { isPreparingCrop: true }]) assert.equal(allowed(overrides), false);
  const start = source.indexOf("  async function extractCheckStubFromPhoto(");
  const end = source.indexOf("  async function readPreparedRemittanceFromFile", start);
  const functionSource = source.slice(start, end);
  const state = { PaymentReference: "old-check", ExtractedPaymentAmount: 2.49, SelectedIds: ["old-invoice"] };
  const pending = [];
  const calls = [];
  const historyWrites=[];
  const bindings = { observationScopeRef:{current:crypto.randomUUID()}, opticalRef:{current:{images:[],notes:[]}}, ...require("../src/app/lib/remittanceAttempt.ts"), ...require("../src/app/lib/ocrHistory.ts"), businessId:"test-workspace",lastOcrSourceType:"existing",process,scanLineage:{current:null},latestScan:{current:null},supabase:{auth:{getSession:async()=>({data:{session:null}})}},saveScan:async write=>{historyWrites.push(write);return 'saved';}, performance, crypto, preparedCaptureRef: {current:null}, immutableSnapshot: value => structuredClone(value), invoiceRecords: [], paymentActivities: [], workspaceRole: "owner", receivedDate: "2026-09-17", ocrAttemptVersion: { current: 0 },
    appendCameraStage: () => {}, ocrDiagnosticLines: () => [], remittanceReviewDiagnosticLines: () => [],
    ocrFailureMessage: () => "Incomplete", loadCheckDetailsFromExtraction: () => {},
    fetch: async (_url, options) => { calls.push(JSON.parse(options.body)); return new Promise(resolve => pending.push(resolve)); },
    loadExtractedRemittance: (data) => { state.PaymentReference = data.checkNumber; state.ExtractedPaymentAmount = data.totalAmount; const observed=require("../src/app/lib/remittanceAttempt.ts").resolveRemittanceAttempt(require("../src/app/lib/remittanceAttempt.ts").emptyRemittanceEvidence("mock",null,"test"),[],[],{role:"owner",receivedDate:"2026-09-17",fingerprint:""}); return { match: { issues: [] }, reviewMatches: [{ amountDue: data.totalAmount }], reconciledReview: { isComplete: true }, historicalDuplicateCheck: { status: "none" }, attempt: {...observed,reconciliationResult:{...observed.reconciliationResult,eligible:true,blockers:[]}} }; },
  };
  for (const name of new Set(functionSource.match(/set[A-Z][A-Za-z]+/g))) bindings[name] = value => { state[name.slice(3)] = value; };
  const compiled = ts.transpileModule(functionSource + "\nreturn extractCheckStubFromPhoto;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const read = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
  const first = read("current-image", "remittance_stub", "primary", "standard", [], "fingerprint");
  assert.equal(state.PaymentReference, "");
  assert.equal(state.ExtractedPaymentAmount, null);
  assert.deepEqual(state.SelectedIds, []);
  await new Promise(setImmediate);
  pending.shift()({ ok: true, status: 200, json: async () => ({ stubText: "", rawText: "partial" }) });
  await first;
  assert.equal(state.CheckOcrStatus, "manual");
  const second = read("current-image", "remittance_stub", "primary", "alternate", [], "fingerprint");
  await new Promise(setImmediate);
  pending.shift()({ ok: true, status: 200, json: async () => ({ stubText: "complete", checkNumber: "2797", totalAmount: 5495, totalEvidence: { payable: true } }) });
  await second;
  assert.equal(state.PaymentReference, "2797");
  assert.equal(state.ExtractedPaymentAmount, 5495);
  assert.equal(state.CheckOcrStatus, "ready");
  assert.deepEqual(calls.map(call => Object.keys(call).sort()), [ ["attemptId", "businessId", "debugContext", "documentType", "history", "imageDataUrl", "retryStrategy"], ["attemptId", "businessId", "debugContext", "documentType", "history", "imageDataUrl", "retryStrategy"] ]);
  assert.equal(calls[1].retryStrategy, "alternate");
  assert.notEqual(calls[0].attemptId, calls[1].attemptId);
  const old = read("old-image", "remittance_stub", "primary", "standard", [], "old");
  const latest = read("new-image", "remittance_stub", "primary", "alternate", [], "new");
  await new Promise(setImmediate);
  const staleResponse = pending.shift();
  pending.shift()({ ok: true, status: 200, json: async () => ({ stubText: "new", checkNumber: "3124", totalAmount: 220 }) });
  await latest;
  staleResponse({ ok: true, status: 200, json: async () => ({ stubText: "old", checkNumber: "279", totalAmount: 2.49 }) });
  await old;
  assert.equal(state.PaymentReference, "3124");
  assert.equal(state.ExtractedPaymentAmount, 220);
  assert.equal(historyWrites.filter(write=>write.phase===2).length,4);
  assert.equal(historyWrites.filter(write=>write.phase===2)[1].summary.parentId,calls[0].attemptId);
  assert.equal(historyWrites.filter(write=>write.phase===2)[3].summary.result,'review');
  console.log("Actual Retry Reading request flow: incomplete -> retry, cleared fields, isolated request and stale response rejection passed.");
}

async function duplicatePreflightAndViewRegression() {
  const source = fs.readFileSync("src/app/components/BatchInvoicePayments.tsx", "utf8");
  const compile = (text, bindings) => new Function("require", "exports", ...Object.keys(bindings), ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(require, {}, ...Object.values(bindings));
  const preflightSource = source.slice(source.indexOf("  async function runDuplicateRemittancePreflight("), source.indexOf("  async function extractCheckStubFromPhoto("));
  const writes = [];
  let responseStatus = "possible";
  const bindings = { businessId: "workspace", supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ documentFingerprint: { hash: "f".repeat(256) }, duplicateRemittance: { status: responseStatus, payment: { id: "prior", invoiceIds: ["0506", "0507"] }, reasons: ["document fingerprint distance 77"] } }) }),
  };
  for (const name of new Set(preflightSource.match(/set[A-Z][A-Za-z]+/g))) bindings[name] = value => writes.push([name, value]);
  const preflight = compile(preflightSource + "\nreturn runDuplicateRemittancePreflight;", bindings);
  for (responseStatus of ["possible", "active", "reversed", "none"]) {
    writes.length = 0;
    const result = await preflight(new File(["image"], "stub.jpg"), [], { checkNumber: "", amount: null, checkDate: "", receivedDate: "2026-09-16", payor: "", invoiceIds: [], invoiceNumbers: [] });
    assert.equal(result.stoppedOcr, false);
    assert.equal(result.fingerprint.length, 256);
    assert.ok(writes.every(([name]) => ["setRemittanceDocumentFingerprint", "setLastOcrPrepDiagnosticLines", "setLastOcrDiagnosticLines"].includes(name)));
  }
  const modalSource = source.slice(source.indexOf("  function duplicatePaymentHref()"), source.indexOf("  if (payableInvoices.length === 0)"));
  const events = [];
  const modal = compile(modalSource + "\nreturn duplicateRemittanceModalView;", {
    businessSlug: "rnl-creations", duplicateRemittanceModal: { intent: "possible", result: { canOverride: true, payment: { checkNumber: "", amount: 2252.95, invoiceNumbers: ["INV-0506", "INV-0507"], invoiceCount: 2 } } },
    createPortal: element => element, document: { body: {} }, formatMoney: String, formatDate: String,
    setDuplicateRemittanceModal: value => events.push(["modal", value]),
    setDuplicateOverrideClearedKey: () => { throw new Error("View must not grant override"); },
    setReversedDuplicateReviewedKey: () => { throw new Error("View must not commit review"); },
    setToast: () => { throw new Error("View must not show success toast"); },
    duplicateEvidenceKey: "current", fetch: () => { throw new Error("View must not call payment APIs"); },
    supabase: new Proxy({}, { get: () => { throw new Error("View must not write data"); } }),
  });
  let tree;
  await renderer.act(async () => { tree = renderer.create(modal()); });
  const link = tree.root.findByType("a");
  assert.equal(link.props.children, "View Possible Match");
  assert.equal(link.props.href, "/payments?business=rnl-creations#payment-history");
  await renderer.act(async () => link.props.onClick());
  assert.deepEqual(events, [["modal", null]]);
  await renderer.act(async () => tree.unmount());
  console.log("Duplicate preflight continues OCR; View Possible Match only closes modal and links to history, with zero writes or overrides.");
}

async function main() {
  require("./capture-gate-integration-regression.cjs")();
  require("node:child_process").execFileSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--experimental-strip-types","scripts/capture-readiness-regression.ts"],{stdio:"inherit"});
  require("node:child_process").execFileSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--experimental-strip-types","scripts/ocr-optical-regression.ts"],{stdio:"inherit"});
  require("node:child_process").execFileSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","scripts/ocr-latency-regression.cjs"],{stdio:"inherit"});
  require("node:child_process").execFileSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--experimental-strip-types","scripts/ocr-faint-regression.cjs"],{stdio:"inherit"});
  await require("./ocr-history-regression.cjs")(loader,React,renderer);
  await require("./ocr-debug-queue-regression.cjs")(loader,React,renderer);
  await require("./ocr-optical-ui-regression.cjs")(loader,React,renderer);
  await require("./ocr-structure-regression.cjs");
  await duplicatePreflightAndViewRegression();
  await contractHandoffRegression();
  await retryStateRegression();
  await queueBlockerRegression();
  await conversionSplitPreferenceRegression(false);
  await conversionSplitPreferenceRegression(true);
  await splitPreferenceRegression("invoices", false, true);
  await splitPreferenceRegression("invoices", true, false);
  await splitPreferenceRegression("estimates", false, true);
  await splitPreferenceRegression("estimates", true, false);
  await splitPreferenceRegression("invoices", false, true, null);
  await splitPreferenceRegression("estimates", false, true, null);
  const queueSource = fs.readFileSync("src/app/queue/page.tsx", "utf8");
  assert.ok(queueSource.includes("client.id === linkedInvoice?.client_id"));
  assert.ok(queueSource.includes("recipientEmail: invoiceClient?.email"));
  assert.ok(queueSource.includes("clientCcEmail: invoiceClient?.cc_email"));
  for (const kind of ["estimates", "invoices"]) {
    const detail = fs.readFileSync(`src/app/${kind}/[id]/page.tsx`, "utf8");
    const document = kind === "estimates" ? "estimate" : "invoice";
    assert.ok(detail.includes(`.eq("id", ${document}.client_id)`));
    assert.ok(
      detail.includes("clientCcEmail={clientContact?.cc_email ?? null}"),
    );
  }
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
  await sendPanelRegression(true, false);
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
