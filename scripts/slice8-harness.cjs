// Slice 8 checks part A (mocked, no network). Run: node scripts/check-slice8.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
function readSrc(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
module.exports = { assert, readSrc, ROOT };
