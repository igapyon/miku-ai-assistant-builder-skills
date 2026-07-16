#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoName = "miku-m365-agent-builder-skills";
const skillName = "igapyon-miku-m365-agent-builder";
const bundleRoot = path.resolve(repoRoot, "bundle", repoName);
const sourceSkillRoot = path.resolve(repoRoot, "skills", skillName);
const bundleSkillRoot = path.resolve(bundleRoot, "skills", skillName);

assertSourceExists();
execFileSync("node", ["scripts/verify-miku-index.mjs"], { cwd: repoRoot, stdio: "inherit" });
fs.rmSync(bundleRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
fs.mkdirSync(path.dirname(bundleSkillRoot), { recursive: true });
fs.cpSync(sourceSkillRoot, bundleSkillRoot, { recursive: true, filter: shouldCopyBundleEntry });
normalizeMtime(bundleSkillRoot, new Date("1980-01-01T00:00:00Z"));

process.stdout.write([
  `[build:bundle] generated bundle/${repoName}`,
  "[build:bundle] copy this directory's contents under the agent home root",
  "[build:bundle] included:",
  `  - skills/${skillName}`
].join("\n") + "\n");

function assertSourceExists() {
  if (!fs.existsSync(sourceSkillRoot)) throw new Error(`missing source directory: skills/${skillName}`);
}

function shouldCopyBundleEntry(sourcePath) {
  const name = path.basename(sourcePath);
  if (name === ".DS_Store") return false;
  if (["tmp", "output", "state"].includes(name)) {
    return path.relative(sourceSkillRoot, sourcePath).split(path.sep).length > 1;
  }
  return true;
}

function normalizeMtime(dir, timestamp) {
  for (const name of fs.readdirSync(dir).sort(compareUtf16)) {
    const target = path.join(dir, name);
    if (fs.statSync(target).isDirectory()) normalizeMtime(target, timestamp);
    fs.utimesSync(target, timestamp, timestamp);
  }
  fs.utimesSync(dir, timestamp, timestamp);
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
