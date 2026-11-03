// Pure provider-diagnostics checks (no network).
// Run: node -r sucrase/register scripts/check-diagnostics.cjs
const assert = require("node:assert/strict");
const d = require("../lib/ai/provider-diagnostics.ts");

assert.equal(d.baseHostOf("https://api.meta.ai/v1"), "api.meta.ai");
assert.equal(d.baseHostOf("https://api.meta.ai/v1/chat/completions?key=secret"), "api.meta.ai");
assert.equal(d.baseHostOf(""), "unknown");

const evil = "Provider HTTP 401. Unauthorized key=sk-live-abcdef123456 Bearer sk-live-abcdef123456 PAN 4111111111111111 " + "x".repeat(600);
const clean = d.sanitizeErrorSnippet(new Error(evil));
assert.ok(clean.length <= 400, "snippet capped");
assert.ok(!clean.includes("sk-live-abcdef123456"), "key redacted");
assert.ok(!/4111111111111111/.test(clean), "PAN redacted");

const e401 = new Error("Provider HTTP 401. denied");
e401.status = 401;
assert.equal(d.classifyProviderError(e401), "http");
assert.equal(d.httpStatusOf(e401), 401);
const eTo = new Error("Provider timed out.");
assert.equal(d.classifyProviderError(eTo), "timeout");
const eCfg = new Error("META_API_KEY is not configured on the server.");
assert.equal(d.classifyProviderError(eCfg), "config");
const eEmpty = new Error("Primary model returned an empty response.");
assert.equal(d.classifyProviderError(eEmpty), "empty");

const a = d.buildErrorAttempt({ attempt: "meta-primary", provider: "meta", model: "muse-spark-1.3", baseUrl: "https://api.meta.ai/v1", maxTokens: 900, latencyMs: 12.5, error: new Error(evil) });
assert.equal(a.baseHost, "api.meta.ai");
assert.equal(a.maxTokens, 900);
assert.ok(!JSON.stringify(a).includes("sk-live"));
console.log("ok - provider-diagnostics pure checks");

