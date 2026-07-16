import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();
const skillName = "igapyon-miku-m365-agent-builder";
const skillRoot = path.resolve(ROOT, "skills", skillName);

test("generated index is required and current", () => {
  execFileSync("npm", ["run", "check:index"], { cwd: ROOT, encoding: "utf8" });
  const index = JSON.parse(fs.readFileSync(path.resolve(skillRoot, "index.json"), "utf8"));
  const paths = index.files.map((entry) => entry.path);
  for (const requiredPath of [
    "SKILL.md",
    "agents/openai.yaml",
    "references/instructions/01-input-fields.md",
    "references/knowledge-sources/03-miku-text-bundle.md",
    "references/knowledge-sources/05-miku-md2docx.md",
    "references/platform/01-baseline.md",
    "references/platform/02-limitations.md",
    "references/workflows/01-folder-conversion.md"
  ]) assert.ok(paths.includes(requiredPath), `index lacks ${requiredPath}`);
});

test("skill frontmatter and canonical location match the installable name", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  assert.match(skillMd, /^---\n[\s\S]*?^name: igapyon-miku-m365-agent-builder$[\s\S]*?^---$/m);
  assert.equal(fs.existsSync(path.resolve(ROOT, "SKILL.md")), false);
});

test("deployment workflow produces flat DOCX uploads with traceable source paths", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const docxReference = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/05-miku-md2docx.md"),
    "utf8"
  );
  assert.match(skillMd, /miku-md2docx/);
  assert.match(skillMd, /upload\/knowledge-NNN\.docx/);
  assert.match(skillMd, /リポジトリルート基準の相対パス/);
  assert.match(docxReference, /DOCX間の相対リンクが解決されることを前提にしない/);
  assert.match(docxReference, /upload\/.*フラット/);
});
