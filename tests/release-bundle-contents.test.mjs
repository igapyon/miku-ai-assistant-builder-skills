import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();
const repoName = "miku-m365-agent-builder-skills";
const skillName = "igapyon-miku-m365-agent-builder";
const packageJson = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
const zipPath = path.resolve(ROOT, `bundle/igapyon-${repoName}-${packageJson.version}.zip`);
const checksumPath = `${zipPath}.sha256`;

test("release zip contains exactly the indexed installable files", () => {
  assert.equal(fs.existsSync(zipPath), true, "build the zip before verification");
  assert.equal(fs.existsSync(checksumPath), true, "build the checksum before verification");
  const entries = execFileSync("unzip", ["-Z1", zipPath], { cwd: ROOT, encoding: "utf8" })
    .trim().split(/\n/).filter(Boolean).filter((entry) => !entry.endsWith("/"));
  const index = JSON.parse(fs.readFileSync(path.resolve(ROOT, "skills", skillName, "index.json"), "utf8"));
  const expected = new Set(index.files.map((entry) => `skills/${skillName}/${entry.path}`));
  expected.add(`skills/${skillName}/index.json`);
  assert.deepEqual(new Set(entries), expected);

  const checksum = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex"), checksum);
});
