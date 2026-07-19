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
    "runtime/miku-md2docx-1.0.1.mjs",
    "runtime/miku-md2docx-java-1.0.1.jar",
    "runtime/miku-text-bundle-1.6.0.mjs",
    "runtime/miku-text-bundle-java-1.6.0.jar"
  ]) assert.ok(paths.includes(requiredPath), `index lacks ${requiredPath}`);
});

test("bundled runtimes match declared versions and digests", () => {
  const runtimes = [
    {
      file: "miku-md2docx-1.0.1.mjs",
      command: process.execPath,
      version: "1.0.1",
      sha256: "85bae25e3e595c6b2f5f74955196da5e010797506ee1d360a0e987a8004c1fe4"
    },
    {
      file: "miku-md2docx-java-1.0.1.jar",
      command: "java",
      version: "1.0.1",
      sha256: "53c9810e73049579c51879c50e990f8657fa87a26cf0d6b93fac3a1adfbc4532"
    },
    {
      file: "miku-text-bundle-1.6.0.mjs",
      command: process.execPath,
      version: "1.6.0",
      sha256: "b1044ae7fbcc13b5998d8aa857445bf80de02392875c75ecd002186e1f353c8b"
    },
    {
      file: "miku-text-bundle-java-1.6.0.jar",
      command: "java",
      version: "1.6.0",
      sha256: "b05d78b142af4cb8f99989a7428c6516e4aec2abea4ade51e772eb4cb853df97"
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

test("deployment workflow produces flat validated uploads with traceable source paths", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const docxReference = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/05-miku-md2docx.md"),
    "utf8"
  );
  assert.match(skillMd, /miku-md2docx/);
  assert.match(skillMd, /バックエンド指定がなければNode\.js版を使用する/);
  assert.match(skillMd, /自動生成DOCX、手動Markdownから変換したDOCX、検証済みの準備済みOffice文書/);
  assert.match(skillMd, /リポジトリルート基準の相対パス/);
  assert.match(docxReference, /DOCX間の相対リンクが解決されることを前提にしない/);
  assert.match(docxReference, /upload\/.*登録候補だけのフラット構成/);
});

test("folder conversion stops after preparation and resumes from persistent state", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.match(skillMd, /第1段階と第2段階を同じターンで続けて実行しない/);
  assert.match(skillMd, /人間による追加資料の準備待ちとして必ず停止する/);
  assert.match(skillMd, /work\/preparation-status\.md/);
  assert.match(workflow, /awaiting-manual-input/);
  assert.match(workflow, /別セッションで推測せず再開/);
  assert.match(workflow, /第1段階では次を行わない/);
  assert.match(workflow, /番号付きMarkdownのDOCX変換/);
  assert.match(workflow, /追加資料がない場合も利用者の明示的な確認/);
});

test("deployment stays a human-controlled internal handoff", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.match(skillMd, /社内または組織テナント内の閉じたAgent Builder/);
  assert.match(skillMd, /Agent Builderへのアップロード、共有設定、外部Webや公開リポジトリへの公開を行わない/);
  assert.match(workflow, /ローカルの配備用フォルダを完成させるところで終了/);
  assert.match(workflow, /対象テナント.*共有範囲.*閲覧権限/);
});

test("manual inputs are immutable and conflicts stop before final uploads change", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.match(skillMd, /manual-input\/.*上書き、移動、削除しない/);
  assert.match(workflow, /入力元と`manual-input\/`を読み取り専用/);
  assert.match(workflow, /自動改名や上書きで解決しない/);
  assert.match(workflow, /大文字小文字だけが異なるbasename.*衝突/);
  assert.match(workflow, /`upload\/`を変更せず停止/);
  assert.match(workflow, /既存の正常な`upload\/`を部分更新しない/);
});

test("finalization converts Markdown and carries validated Office documents", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );
  const limitations = fs.readFileSync(
    path.resolve(skillRoot, "references/platform/02-limitations.md"),
    "utf8"
  );

  assert.match(skillMd, /manual-input\/`のMarkdownを一対一で`miku-md2docx`/);
  assert.match(skillMd, /DOCX、PPTX、XLSX/);
  assert.match(workflow, /準備済みOffice文書を一時的な出力場所へコピー/);
  assert.match(workflow, /状態を`finalized`へ更新/);
  assert.match(limitations, /\.docx.*\.pptx.*\.xlsx/);
  assert.match(limitations, /手動追加Markdownを直接登録せずDOCXへ変換/);
});

test("generated Agent Builder input uses knowledge-first instructions and flat registered names", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const inputFields = fs.readFileSync(
    path.resolve(skillRoot, "references/instructions/01-input-fields.md"),
    "utf8"
  );
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.match(skillMd, /登録済みKnowledge sourcesを優先して検索/);
  assert.match(skillMd, /upload\/.*付けず.*basename/);
  assert.match(inputFields, /knowledge-001\.docx/);
  assert.match(inputFields, /`upload\/knowledge-001\.docx`ではなく`knowledge-001\.docx`/);
  assert.match(inputFields, /最終`upload\/`に実在するファイルから表を作る/);
  assert.match(inputFields, /未記載ファイルを双方向に確認/);
  assert.match(inputFields, /情報がKnowledge sourcesに見つからない場合.*推測で補わない/);
  assert.match(workflow, /Knowledge sources欄が.*basenameだけ/);
});
