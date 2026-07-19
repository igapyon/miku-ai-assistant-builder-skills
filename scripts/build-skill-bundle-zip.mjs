#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoName = "miku-ai-assistant-builder-skills";
const packageJson = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "package.json"), "utf8"));
const bundleRoot = path.resolve(repoRoot, "bundle", repoName);
const zipName = `igapyon-${repoName}-${packageJson.version}.zip`;
const zipPath = path.resolve(repoRoot, "bundle", zipName);
const checksumPath = `${zipPath}.sha256`;

execFileSync("node", ["scripts/build-skill-bundle.mjs"], { cwd: repoRoot, stdio: "inherit" });

for (const name of fs.readdirSync(path.dirname(zipPath))) {
  if (name.startsWith(`igapyon-${repoName}-`) && (name.endsWith(".zip") || name.endsWith(".zip.sha256"))) {
    fs.rmSync(path.resolve(path.dirname(zipPath), name), { force: true });
  }
}

const files = listFiles(bundleRoot);
execFileSync("zip", ["-Xq", zipPath, "-@"], {
  cwd: bundleRoot,
  input: `${files.join("\n")}\n`,
  stdio: ["pipe", "inherit", "inherit"]
});

const checksum = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(zipPath)}\n`);
process.stdout.write(`[build:bundle:zip] generated bundle/${zipName}\n`);
process.stdout.write(`[build:bundle:zip] generated bundle/${path.basename(checksumPath)}\n`);

function listFiles(dir, relativeDir = "") {
  const entries = [];
  for (const name of fs.readdirSync(dir).sort(compareUtf16)) {
    const absolutePath = path.join(dir, name);
    const relativePath = path.posix.join(relativeDir, name);
    if (fs.statSync(absolutePath).isDirectory()) entries.push(...listFiles(absolutePath, relativePath));
    else entries.push(relativePath);
  }
  return entries;
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
