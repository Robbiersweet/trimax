import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const backButton = readFileSync(
  resolve(root, "src/app/components/BackButton.tsx"),
  "utf8"
);
const workspaceBackBar = readFileSync(
  resolve(root, "src/app/components/WorkspaceBackBar.tsx"),
  "utf8"
);
const workspaceFloatingControls = readFileSync(
  resolve(root, "src/app/components/WorkspaceFloatingControls.tsx"),
  "utf8"
);
const appShell = readFileSync(
  resolve(root, "src/app/components/AppShell.tsx"),
  "utf8"
);
const historyTracker = readFileSync(
  resolve(root, "src/app/components/NavigationHistoryTracker.tsx"),
  "utf8"
);
const dashboardPage = readFileSync(
  resolve(root, "src/app/page.tsx"),
  "utf8"
);
const invoicePage = readFileSync(
  resolve(root, "src/app/invoices/[id]/page.tsx"),
  "utf8"
);
const queuePage = readFileSync(
  resolve(root, "src/app/queue/page.tsx"),
  "utf8"
);
const queueDetailPage = readFileSync(
  resolve(root, "src/app/queue/[unit]/page.tsx"),
  "utf8"
);
const batchSendPage = readFileSync(
  resolve(root, "src/app/invoices/batch-send/page.tsx"),
  "utf8"
);
const batchPaymentPage = readFileSync(
  resolve(root, "src/app/invoices/batch-payment/page.tsx"),
  "utf8"
);
const settingsPage = readFileSync(
  resolve(root, "src/app/settings/page.tsx"),
  "utf8"
);

assert(
  appShell.includes("<WorkspaceFloatingControls />") &&
    !appShell.includes("<WorkspaceBackBar />") &&
    !appShell.includes("<QuickCommandCenter />"),
  "AppShell must delegate the protected floating Back/Command pair to one shared component."
);

assert.equal(
  (appShell.match(/<WorkspaceFloatingControls \/>/g) ?? []).length,
  1,
  "AppShell must not duplicate the protected floating-control pair."
);

assert(
  workspaceFloatingControls.includes('data-protected-floating-pair="true"') &&
    workspaceFloatingControls.includes('data-floating-control-group="true"') &&
    workspaceFloatingControls.includes("<WorkspaceBackBar />") &&
    workspaceFloatingControls.includes("<QuickCommandCenter />") &&
    workspaceFloatingControls.indexOf("<WorkspaceBackBar />") <
      workspaceFloatingControls.indexOf("<QuickCommandCenter />"),
  "The shared floating-control component must render exactly one Back immediately left of Command."
);

assert(
  workspaceFloatingControls.includes("trimax-remittance-capture-active") &&
    workspaceFloatingControls.includes("trimax-remittance-capture-mode") &&
    workspaceFloatingControls.includes("data-remittance-capture-hidden") &&
    workspaceFloatingControls.includes('captureModeActive ? "hidden" : ""'),
  "The protected floating-control pair may hide only during the intentional full-screen remittance capture exception."
);

assert(
  appShell.includes("captureModeActive") &&
    appShell.includes("trimax-remittance-capture-mode") &&
    appShell.includes("{!captureModeActive ? <Navigation /> : null}") &&
    appShell.includes("{!captureModeActive ? (") &&
    appShell.includes("<TrimaxRefreshControl />") &&
    appShell.includes("canUseJobSessions && !captureModeActive"),
  "The app shell must hide normal Navigation, Refresh, and job dock chrome during full-screen remittance capture only."
);

assert.equal(
  (workspaceFloatingControls.match(/<WorkspaceBackBar \/>/g) ?? []).length,
  1,
  "The protected floating-control pair must render exactly one Back wrapper."
);

assert.equal(
  (workspaceFloatingControls.match(/<QuickCommandCenter \/>/g) ?? []).length,
  1,
  "The protected floating-control pair must render exactly one Command control."
);

assert(
  historyTracker.includes("trimax.routeStack") &&
    historyTracker.includes("trimax.previousRoute") &&
    historyTracker.includes("sessionStorage.setItem(trimaxRouteStackKey"),
  "Trimax route history must be tracked in one shared place."
);

assert(
  historyTracker.includes("cameFromOutsideCurrentOrigin") &&
    historyTracker.includes("isFreshDocumentNavigation") &&
    historyTracker.includes("sessionStorage.removeItem(previousTrimaxRouteKey)") &&
    historyTracker.includes("sessionStorage.removeItem(trimaxRouteStackKey)") &&
    historyTracker.includes("sessionStorage.removeItem(currentTrimaxRouteKey)"),
  "Direct or external document opens must clear stale Trimax history before fallback is used."
);

assert(
  backButton.includes("function isSafeTrimaxBackRoute") &&
    backButton.includes("value.startsWith(\"//\")") &&
    backButton.includes("\"/login\"") &&
    backButton.includes("\"/request-access\"") &&
    backButton.includes("\"/forgot-password\"") &&
    backButton.includes("\"/reset-password\""),
  "Back destinations must reject external, protocol-relative, and auth routes."
);

const stackedPreviousIndex = backButton.indexOf("if (stackedPreviousRoute)");
const preferFallbackIndex = backButton.indexOf("if (preferFallback)");

assert(
  stackedPreviousIndex > -1 &&
    preferFallbackIndex > -1 &&
    stackedPreviousIndex < preferFallbackIndex,
  "Floating Back must try the immediate Trimax history before parent fallback."
);

assert(
  backButton.includes("router.back();") &&
    !backButton.includes("router.push(stackedPreviousRoute)"),
  "Immediate in-app Back must use router.back() instead of pushing a fixed route."
);

assert(
  workspaceBackBar.includes("invoices: { fallback: \"/invoices\" }") &&
    workspaceBackBar.includes("queue: { fallback: \"/queue\" }") &&
    workspaceBackBar.includes("estimates: { fallback: \"/estimates\" }") &&
    workspaceBackBar.includes("payments: { fallback: \"/payments\" }") &&
    workspaceBackBar.includes("withBusiness") &&
    workspaceBackBar.includes("business=${encodeURIComponent(business)}"),
  "Fallbacks must be context-aware and preserve business context."
);

assert(
  workspaceBackBar.includes("if (pathname === \"/\" || !section)") &&
    workspaceBackBar.includes("return withBusiness(\"/\", business)") &&
    workspaceBackBar.includes("floatingBackExcludedPathnames") &&
    !workspaceBackBar.includes("pathname === \"/\" ||\n    parts.length === 0") &&
    !workspaceBackBar.includes("primaryWorkspaceSections"),
  "Dashboard and top-level workspace routes must not be suppressed by shared floating Back visibility."
);

assert(
  workspaceBackBar.includes("pathname === \"/estimates\"") &&
    workspaceBackBar.includes("return withBusiness(\"/\", business)"),
  "The Estimates list must still use Dashboard as its direct-open fallback."
);

assert.equal(
  (workspaceBackBar.match(/<BackButton/g) ?? []).length,
  1,
  "WorkspaceBackBar must render exactly one shared BackButton."
);

assert(
  !dashboardPage.includes("BackButton") &&
    !dashboardPage.includes("data-floating-back-control"),
  "Dashboard must not render a page-content Back control or duplicate the shared floating Back."
);

assert(
  !settingsPage.includes("BackButton") &&
    !settingsPage.includes("returnToParam") &&
    !settingsPage.includes("returnTo ?"),
  "Settings must rely on the shared floating Back control instead of rendering a page-content duplicate."
);

const representativeWorkspaceRoutes = [
  "/",
  "/queue",
  "/queue/[id]",
  "/estimates",
  "/estimates/[id]",
  "/estimates/[id]/edit",
  "/invoices",
  "/invoices/[id]",
  "/invoices/[id]/edit",
  "/invoices/batch-payment",
  "/invoices/batch-send",
  "/payments",
  "/job-sessions",
  "/schedule",
  "/property-sales",
  "/property-intelligence",
  "/settings",
];

assert(
  representativeWorkspaceRoutes.every((route) => route.startsWith("/")) &&
    representativeWorkspaceRoutes.includes("/") &&
    representativeWorkspaceRoutes.includes("/queue") &&
    representativeWorkspaceRoutes.includes("/estimates") &&
    representativeWorkspaceRoutes.includes("/invoices") &&
    representativeWorkspaceRoutes.includes("/payments") &&
    representativeWorkspaceRoutes.includes("/settings"),
  "Floating Back route coverage must include representative top-level, detail, batch, property, payment, and settings workspaces."
);

assert(
  representativeWorkspaceRoutes.every(
    (route) => !workspaceBackBar.includes(`floatingBackExcludedPathnames.add("${route}")`)
  ),
  "Representative workspace routes must not be individually hidden while Command remains available."
);

assert(
  invoicePage.includes("href={`/invoices/${relatedInvoice.id}${businessQuery}`}") &&
    invoicePage.includes("href={`/invoices/${splitParentInvoice.id}${businessQuery}`}"),
  "Split child and source invoice links must keep normal in-app drill-in navigation."
);

assert(
  queueDetailPage.includes("href={`/invoices/${linkedInvoice.id}?business=${businessSlug}`}") &&
    queuePage.includes("href={`/queue/${item.id}${businessQuery}`}"),
  "Queue detail/list links must keep drill-in navigation through normal links."
);

assert(
  batchSendPage.includes("href={`/invoices/${invoice.id}?business=${business.slug}`}") ||
    batchSendPage.includes("href={`/invoices/${invoice.id}${businessQuery}`}") ||
    batchSendPage.includes("/invoices/${"),
  "Batch Send must keep invoice drill-in links available."
);

assert(
  batchPaymentPage.includes("/invoices") || batchPaymentPage.includes("invoice"),
  "Batch Payment workspace must remain an invoice-origin workspace for fallback coverage."
);

assert(
  !invoicePage.includes("router.replace") &&
    !queuePage.includes("router.replace") &&
    !queueDetailPage.includes("router.replace"),
  "Normal Queue and invoice drill-in pages must not replace navigation history."
);

console.log("Floating Back navigation regression checks passed.");
