/* eslint-disable @typescript-eslint/no-require-imports */
process.env.NODE_ENV = "test";
global.IS_REACT_ACT_ENVIRONMENT = true;
const fs = require("fs"),
  path = require("path"),
  assert = require("node:assert/strict"),
  ts = require("typescript"),
  React = require("react"),
  renderer = require("react-test-renderer");
const storage = new Map();
global.sessionStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
const requests = [];
let accepted = 0,
  closed = 0;
const fixture = {
  subject: "Estimate EST-1",
  message:
    "Hello,\n\nDocument details\nProject estimate: $10,000.00\n\nThank you.",
  recipientEmail: "customer@example.test",
  ccEmail: "cc@example.test",
  bccEmail: "",
  from: "Synthetic sender",
  replyToEmail: "owner@example.test",
  html: "<p>Synthetic review</p>",
  facts: "Document details\nProject estimate: $10,000.00",
  reviewToken: "synthetic-approved-preview",
  attachments: [
    {
      filename: "synthetic.pdf",
      content: Buffer.from("%PDF- synthetic").toString("base64"),
    },
  ],
};
const savedFetch = global.fetch;
global.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  requests.push(body);
  return new Response(
    JSON.stringify(
      body.mode === "send"
        ? { message: "accepted" }
        : {
            ...fixture,
            ...(body.mode === "review"
              ? {
                  subject: body.subject,
                  message: body.message,
                  recipientEmail: body.recipientEmail,
                  ccEmail: body.ccEmail,
                }
              : {}),
          },
    ),
    { status: 200 },
  );
};
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const req = (name) => {
    if (name.endsWith("/supabase"))
      return {
        supabase: {
          auth: {
            getSession: async () => ({
              data: {
                session: {
                  user: { id: "synthetic-owner" },
                  access_token: "synthetic",
                },
              },
            }),
          },
        },
      };
    if (name === "next/navigation")
      return { useRouter: () => ({ refresh() {}, push() {} }) };
    if (name === "next/link")
      return {
        default: (props) => React.createElement("a", props, props.children),
      };
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(file), name);
      return load(
        [base, base + ".ts", base + ".tsx"].find((p) => fs.existsSync(p)),
      );
    }
    return require(name);
  };
  new Function("require", "module", "exports", source)(req, mod, mod.exports);
  return mod.exports;
}
const Review = load("src/app/components/DocumentEmailReview.tsx").default;
const props = {
  documentId: "doc",
  businessSlug: "rnl-creations",
  recipientEmail: "customer@example.test",
  onClose: () => closed++,
  onSent: () => accepted++,
};
function button(tree, label) {
  return tree.root.findAllByType("button").find((b) =>
    b.children
      .filter((v) => typeof v === "string")
      .join("")
      .includes(label),
  );
}
async function click(tree, label) {
  await renderer.act(async () => {
    const b = button(tree, label);
    assert(b, "Missing " + label);
    assert(!b.props.disabled, "Disabled " + label);
    await b.props.onClick();
  });
}
(async () => {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Review, props));
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].preflightOnly, true);
  assert.equal(requests.filter((r) => r.mode === "send").length, 0);
  assert.equal(button(tree, "Confirm and Send").props.disabled, true);
  await renderer.act(async () => {
    await button(tree, "Confirm and Send").props.onClick();
  });
  assert.equal(
    requests.filter((r) => r.mode === "send").length,
    0,
    "Calling a disabled final handler cannot bypass approval",
  );

  await renderer.act(async () => {
    tree.root.findByProps({ "aria-label": "Message" }).props.onChange({
      target: { value: fixture.message.replace("Hello,", "Dear customer,") },
    });
  });
  assert(storage.size > 0);
  assert(
    !button(tree, "Confirm and Send"),
    "Editing invalidates prior approval",
  );
  await click(tree, "Cancel");
  assert.equal(closed, 1);
  assert.equal(accepted, 0);
  await renderer.act(async () => tree.unmount());
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Review, props));
  });
  assert(
    tree.root
      .findByProps({ "aria-label": "Message" })
      .props.value.startsWith("Dear customer"),
  );
  assert(!button(tree, "Confirm and Send"));
  await click(tree, "Refresh and validate");
  assert.equal(button(tree, "Confirm and Send").props.disabled, true);
  const checkbox = tree.root
    .findAllByType("input")
    .find((i) => i.props.type === "checkbox");
  await renderer.act(async () =>
    checkbox.props.onChange({ target: { checked: true } }),
  );
  await click(tree, "Confirm and Send");
  assert.equal(accepted, 1);
  assert.equal(requests.filter((r) => r.mode === "send").length, 1);
  assert.equal(requests.at(-1).finalApproval, true);
  assert.deepEqual(requests.at(-1).reviewAttachments, fixture.attachments);
  assert.equal(storage.size, 0);
  await renderer.act(async () => tree.unmount());
  // Compact/queue and ordinary initial actions are equally review-only.
  const Panel = load("src/app/components/InvoiceEmailSendPanel.tsx").default;
  for (const compact of [false, true]) {
    const count = requests.length;
    await renderer.act(async () => {
      tree = renderer.create(
        React.createElement(Panel, {
          ...props,
          compact,
          documentNumber: "INV-1",
          businessName: "R&L Creations",
          customerName: "Synthetic",
          amountDue: "$100.00",
          dueDate: "",
          printHref: "/print",
        }),
      );
    });
    assert.equal(requests.length, count);
    await click(tree, "Review Email");
    assert.equal(requests.at(-1).mode, "prepare");
    await click(tree, "Cancel");
    assert.equal(requests.filter((r) => r.mode === "send").length, 1);
    await renderer.act(async () => tree.unmount());
  }
  // Batch selection opens each review without silently submitting any selected message.
  const Batch = load("src/app/components/InvoiceBatchSendActions.tsx").default;
  const invoices = [1, 2].map((n) => ({
    id: "batch" + n,
    displayId: "INV-" + n,
    customerName: "Synthetic",
    projectTitle: "Synthetic",
    invoiceAmount: 100,
    status: "Draft",
    recipientEmail: "customer@example.test",
    href: "/invoices/batch" + n,
    issueDate: "2026-01-01",
    createdAt: null,
    splitParentInvoiceId: null,
    splitChildrenCount: 0,
    splitParentDisplayId: null,
    splitSequence: null,
    splitCount: null,
  }));
  await renderer.act(async () => {
    tree = renderer.create(
      React.createElement(Batch, {
        businessSlug: "rnl-creations",
        businessName: "R&L Creations",
        invoices,
      }),
    );
  });
  await click(tree, "Select All");
  const sendButton = tree.root
    .findAllByType("button")
    .find(
      (b) =>
        b.props.onClick &&
        b.children
          .flat()
          .some((c) => typeof c === "string" && c.includes("Send")) &&
        !b.children.includes("Select All Send-Ready Drafts"),
    );
  assert(sendButton);
  await renderer.act(async () => sendButton.props.onClick());
  assert(tree.root.findAllByProps({ role: "dialog" }).length);
  assert.equal(requests.at(-1).mode, "prepare");
  const firstBatchApproval=tree.root.findAllByType("input").find(i=>i.props.type==="checkbox" && !i.props["aria-label"]);
  await renderer.act(async()=>firstBatchApproval.props.onChange({target:{checked:true}}));
  await click(tree,"Confirm and Send");
  assert.equal(requests.filter(r=>r.mode==='send').length,2,'Only the explicitly approved first batch email is submitted');
  assert.equal(requests.at(-1).mode,'prepare','The second selected email only opens review');
  assert.equal(button(tree,'Confirm and Send').props.disabled,true,'Next batch item needs fresh explicit approval');
  await click(tree,"Cancel");
  assert.equal(requests.filter(r=>r.mode==='send').length,2,'Canceling the second item sends nothing else');
  await renderer.act(async () => tree.unmount());
  console.log(
    "PASS actual React review interactions: initial/compact/batch actions do not transmit; final approval only; edit invalidation; cancellation; draft restoration; exact PDF payload; no real network.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => (global.fetch = savedFetch));
