import { readFileSync } from "node:fs";
import { goldenCoverageBlockers } from "./fixtures/remittance/coverage.ts";
const blockers = goldenCoverageBlockers(JSON.parse(readFileSync("scripts/fixtures/remittance/golden.json", "utf8")));
if (blockers.length) {
  console.error("OCR release blocked:\n" + blockers.join("\n"));
  process.exitCode = 1;
} else console.log("Required OCR golden fixture coverage is complete.");
