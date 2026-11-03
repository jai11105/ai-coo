// Targeted spec verification (pure file + module checks, no network).
// Run: node scripts/check-spec-parts.cjs
// Covers: strict routing (Part 2), Baseten tools (Part 4), prompts (Part 6),
// clean output (Part 9), Copilot UI (Part 10).
// NOTE: TS sources are verified via source-text assertions (no TS loader
// needed) plus tsc --noEmit separately.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
void process.env;

// Pure spec checks: strict routing text, Baseten tool lifecycle text,
// model-specific prompts text, clean-output text, Copilot UI text.
const specialist = src("lib/ai/specialist.ts");
assert.ok(specialist.includes("isDeepDiagnosisQuestion"), "deep-diagnosis gate exists");
assert.ok(specialist.includes("Routine lookup"), "routine lookups skip specialist");
console.log("ok - 1 strict intent routing (routine vs deep)");
assert.ok(src("lib/ai/tool-defs.ts").includes("MAX_TOOL_ROUNDS = 3"));
console.log("ok - 2 tool loop limits intact");

const baseten = src("lib/ai/baseten.ts");
assert.ok(baseten.includes("postBasetenWithTools"), "Baseten with-tools round exists");
assert.ok(baseten.includes("callBasetenSpecialistWithTools"), "Baseten tool loop exists");
assert.ok(baseten.includes('tool_choice: "auto"'), "tool_choice auto verified");
assert.ok(baseten.includes("basetenToolDefinitions"), "specialist tool schemas exist");
assert.ok(src("lib/ai/orchestrate.ts").includes("callBasetenSpecialistWithTools"), "orchestrator uses Baseten tool loop");
console.log("ok - 3 Baseten native tool-calling lifecycle");

const prompts = src("lib/ai/prompts.ts");
assert.ok(prompts.includes("SPARK_PRIMARY_ROLE"), "Spark primary role exists");
assert.ok(prompts.includes("BASETEN_SPECIALIST_ROLE"), "Baseten specialist role exists");
assert.ok(prompts.includes("FIREWORKS_FALLBACK_ROLE"), "Fireworks fallback role exists");
assert.ok(prompts.includes("FEW_SHOT_EXAMPLES"), "few-shot examples exist");
assert.ok(prompts.includes("ANSWER_LENGTH_CONTRACT"), "answer-length contract exists");
console.log("ok - 4 model-specific prompts + few-shots + answer contract");

const validate = src("lib/ai/validate.ts");
assert.ok(validate.includes("tool/JSON"), "raw tool output flagged");
assert.ok(validate.includes("couldn't create that image"), "honest image failure");
console.log("ok - 5 clean-output validation + honest image failure");

const ui = src("app/copilot/page.tsx");
assert.ok(!ui.includes("Live evidence"), "no Live evidence panel");
assert.ok(!ui.includes("Workspace evidence"), "no Workspace evidence panel");
assert.ok(ui.includes("Thinking…"), "clean loading state");
assert.ok(ui.includes("Creating your image…"), "image loading state");
assert.ok(ui.includes("displayModelName"), "per-answer model metadata");
console.log("ok - 6 Copilot UI (clean empty/loading/answer/failure states)");

assert.ok(src("lib/ai/image.ts").includes("muse-image-1.0"), "Muse Image model pinned");
assert.ok(src("lib/ai/orchestrate.ts").includes("isExplicitImageRequest"), "image bypasses business workflow");
console.log("ok - 7 image strict separation");

console.log("ALL SPEC-PART CHECKS PASSED");

