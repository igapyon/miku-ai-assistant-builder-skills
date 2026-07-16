import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const repoName = "miku-m365-agent-builder-skills";
const skillName = "igapyon-miku-m365-agent-builder";

test("bundle installs directly under the agent home skills directory", () => {
  const sourceBundle = path.resolve(ROOT, "bundle", repoName);
  assert.equal(fs.existsSync(sourceBundle), true, "build the bundle before verification");
  const agentHome = fs.mkdtempSync(path.join(os.tmpdir(), `${repoName}-bundle-`));
  try {
    fs.cpSync(sourceBundle, agentHome, { recursive: true });
    assert.equal(fs.existsSync(path.resolve(agentHome, "skills", skillName, "SKILL.md")), true);
    assert.equal(fs.existsSync(path.resolve(agentHome, "skills", skillName, "index.json")), true);
    assert.equal(fs.existsSync(path.resolve(agentHome, "skills", "skills", skillName, "SKILL.md")), false);
  } finally {
    fs.rmSync(agentHome, { recursive: true, force: true });
  }
});
