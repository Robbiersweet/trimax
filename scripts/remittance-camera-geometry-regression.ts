import { execFileSync } from "node:child_process";
// Rendered containment and capture tests supersede the removed object-fit-cover/crop geometry.
execFileSync(process.execPath, ["scripts/remittance-camera-browser.cjs"], { stdio: "inherit" });
