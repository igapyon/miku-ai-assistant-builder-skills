import assert from "node:assert/strict";
import crypto from "node:crypto";
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
    "references/runtime-artifacts.md",
    "references/platform/01-baseline.md",
    "references/platform/02-limitations.md",
    "references/workflows/01-folder-conversion.md",
    "runtime/miku-md2docx-0.9.2.mjs",
    "runtime/miku-md2docx-java-0.9.1.jar",
    "runtime/miku-text-bundle-1.5.1.mjs",
    "runtime/miku-text-bundle-java-1.5.0.jar"
  ]) assert.ok(paths.includes(requiredPath), `index lacks ${requiredPath}`);
});

test("bundled runtimes match declared versions and digests", () => {
  const runtimes = [
    {
      file: "miku-md2docx-0.9.2.mjs",
      command: process.execPath,
      version: "0.9.2",
      sha256: "da473724bb1f28876c1adda55f22fc87f387fbaadce04d31f8840f9409557f3a"
    },
    {
      file: "miku-md2docx-java-0.9.1.jar",
      command: "java",
      version: "0.9.1",
      sha256: "77168ad5f8eaeb06837cee780c28d4dba47c3a33310167644d23b1fdbdb77a23"
    },
    {
      file: "miku-text-bundle-1.5.1.mjs",
      command: process.execPath,
      version: "1.5.1",
      sha256: "2bb9bebc9344253375141736ca435309724da8f2a26caf7bf0120abcc22bd45c"
    },
    {
      file: "miku-text-bundle-java-1.5.0.jar",
      command: "java",
      version: "1.5.0",
      sha256: "77315a89f0d9f474d67aeddc964b7cca350af7557068c3f905c533d8532d410a"
    }
  ];

  for (const runtime of runtimes) {
    const runtimePath = path.resolve(skillRoot, "runtime", runtime.file);
    assert.equal(fs.existsSync(runtimePath), true, `missing runtime: ${runtime.file}`);
    const digest = crypto.createHash("sha256").update(fs.readFileSync(runtimePath)).digest("hex");
    assert.equal(digest, runtime.sha256, `digest mismatch: ${runtime.file}`);
    const args = runtime.command === "java"
      ? ["-jar", runtimePath, "--version"]
      : [runtimePath, "--version"];
    const actualVersion = execFileSync(runtime.command, args, { cwd: ROOT, encoding: "utf8" }).trim();
    assert.equal(actualVersion, runtime.version, `version mismatch: ${runtime.file}`);
  }
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
  assert.match(skillMd, /バックエンド指定がなければNode\.js版を使用する/);
  assert.match(skillMd, /upload\/knowledge-NNN\.docx/);
  assert.match(skillMd, /リポジトリルート基準の相対パス/);
  assert.match(docxReference, /DOCX間の相対リンクが解決されることを前提にしない/);
  assert.match(docxReference, /upload\/.*フラット/);
});
