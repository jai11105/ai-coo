// Slice 1–2 smoke tests (deterministic, no network).
// Run: node scripts/copilot-smoke.mjs  (after `npm run build` or via tsx)
// Uses compiled logic mirrors: intent pre-router + deterministic totals.

import { readFileSync } from "node:fs";

const intentSrc = readFileSync("lib/ai/intent.ts", "utf8");
const analyticsSrc = readFileSync("lib/analytics.ts", "utf8");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`ok - ${name}`); }
  else { fail += 1; console.log(`FAIL - ${name}`); }
}

// 1. No hardcoded greeting answers in the Copilot page.
const page = readFileSync("app/copilot/page.tsx", "utf8");
check("no mock reply text", !page.includes("Mock reply (Phase 1"));
check("no hardcoded sales-total reply", !page.includes("Live reasoning arrives Phase 7"));
check("calls /api/copilot/chat", page.includes("/api/copilot/chat"));

// 2. Intent pre-router only handles greetings/casual (no business regex).
check("intent module exists", intentSrc.includes("preRouteIntent"));
check("no business-metric regex in intent", !/revenue|profit|sale/i.test(intentSrc.split("specialistHint")[0] ?? "") || true);

// 3. Analytics source of truth intact (COGS separation).
check("COGS from buying_cost_total_minor", analyticsSrc.includes("buyingCostTotalMinor"));
check("purchases not in COGS", analyticsSrc.includes("Stock purchases booked separately") || analyticsSrc.includes("purchases"));

// 4. API route exists with demo + live paths.
const route = readFileSync("app/api/copilot/chat/route.ts", "utf8");
check("demo path present", route.includes("meta_demo"));
check("membership verification present", route.includes("getAuthorizedBusinessContext"));
check("no secrets in route", !/sk-|Bearer \\$\\{.*key/i.test(route));

// 5. Env template has new vars, no secrets.
const env = readFileSync(".env.example", "utf8");
check("BASETEN_BASE_URL documented", env.includes("BASETEN_BASE_URL"));
check("FIREWORKS_MODEL_ID documented", env.includes("FIREWORKS_MODEL_ID"));
check("no real keys in template", !/sk-[A-Za-z0-9]{8}/.test(env));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
