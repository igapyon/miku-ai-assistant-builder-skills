#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "package.json"), "utf8"));
const zipPath = path.resolve(repoRoot, `bundle/igapyon-miku-m365-agent-builder-skills-${packageJson.version}.zip`);

const hashes = [];
for (let attempt = 0; attempt < 2; attempt += 1) {
  execFileSync("npm", ["run", "build:bundle:zip"], { cwd: repoRoot, stdio: "inherit" });
  hashes.push(crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex"));
}
assert.equal(hashes[0], hashes[1], "release zip is not reproducible");
process.stdout.write(`[verify:reproducible] ${hashes[0]}\n`);
