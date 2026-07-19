import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();
const repoName = "miku-ai-assistant-builder-skills";
const skillName = "igapyon-miku-ai-assistant-builder";

test("bundle installs directly under the agent home skills directory", () => {
  const sourceBundle = path.resolve(ROOT, "bundle", repoName);
  assert.equal(fs.existsSync(sourceBundle), true, "build the bundle before verification");
  const agentHome = fs.mkdtempSync(path.join(os.tmpdir(), `${repoName}-bundle-`));
  try {
    fs.cpSync(sourceBundle, agentHome, { recursive: true });
    assert.equal(fs.existsSync(path.resolve(agentHome, "skills", skillName, "SKILL.md")), true);
    assert.equal(fs.existsSync(path.resolve(agentHome, "skills", skillName, "index.json")), true);
    assert.equal(fs.existsSync(path.resolve(agentHome, "skills", "skills", skillName, "SKILL.md")), false);
    const runtimeRoot = path.resolve(agentHome, "skills", skillName, "runtime");
    assert.equal(
      execFileSync(process.execPath, [path.resolve(runtimeRoot, "miku-md2docx-1.0.1.mjs"), "--version"], { encoding: "utf8" }).trim(),
      "1.0.1"
    );
    assert.equal(
      execFileSync("java", ["-jar", path.resolve(runtimeRoot, "miku-md2docx-java-1.0.1.jar"), "--version"], { encoding: "utf8" }).trim(),
      "1.0.1"
    );
    assert.equal(
      execFileSync(process.execPath, [path.resolve(runtimeRoot, "miku-text-bundle-1.6.0.mjs"), "--version"], { encoding: "utf8" }).trim(),
      "1.6.0"
    );
    assert.equal(
      execFileSync("java", ["-jar", path.resolve(runtimeRoot, "miku-text-bundle-java-1.6.0.jar"), "--version"], { encoding: "utf8" }).trim(),
      "1.6.0"
    );
  } finally {
    fs.rmSync(agentHome, { recursive: true, force: true });
  }
});
