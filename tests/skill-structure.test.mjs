import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createRunDirectory, formatLocalRunId } from "../skills/igapyon-miku-ai-assistant-builder/scripts/create-run-directory.mjs";

const ROOT = process.cwd();
const skillName = "igapyon-miku-ai-assistant-builder";
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
    "references/knowledge-sources/06-upload-file-budget.md",
    "references/runtime-artifacts.md",
    "references/platform/01-baseline.md",
    "references/platform/02-limitations.md",
    "references/platform/03-gemini-gems.md",
    "references/workflows/01-folder-conversion.md",
    "references/workflows/02-repeatable-conversion-job.md",
    "scripts/create-conversion-job.mjs",
    "scripts/create-run-directory.mjs",
    "scripts/run-conversion-job.mjs",
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
  assert.match(skillMd, /^---\n[\s\S]*?^name: igapyon-miku-ai-assistant-builder$[\s\S]*?^---$/m);
  assert.equal(fs.existsSync(path.resolve(ROOT, "SKILL.md")), false);
});

test("supported Node.js baseline starts at 22 and CI covers 22 and 24", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const ci = fs.readFileSync(path.resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const folderWorkflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.equal(packageJson.engines.node, ">=22");
  assert.match(ci, /node-version: \[22, 24\]/);
  assert.match(readme, /スキルの実行には、Node\.js 22以降が必須/);
  assert.match(readme, /Java版を明示的に選択する場合も、スキル全体の実行にはNode\.js 22以降が必要/);
  assert.match(skillMd, /本スキルの実行にはNode\.js 22以降を必要とする/);
  assert.match(folderWorkflow, /このワークフローの実行にはNode\.js 22以降が必須/);
  assert.doesNotMatch(readme, /Node\.js 20/);
});

test("GitHub Actions pin dependencies and fully verify release artifacts", () => {
  const ci = fs.readFileSync(path.resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
  const release = fs.readFileSync(path.resolve(ROOT, ".github/workflows/release-build.yml"), "utf8");

  for (const workflow of [ci, release]) {
    assert.doesNotMatch(workflow, /uses: [^\n]+@v\d+/);
    for (const line of workflow.split("\n").filter((entry) => entry.trimStart().startsWith("uses:"))) {
      assert.match(line, /@[0-9a-f]{40}(?:\s+#\s+v\d[^\n]*)?$/);
    }
  }
  assert.match(ci, /fail-fast: false/);
  assert.doesNotMatch(ci, /- run: npm test/);
  assert.match(release, /if: startsWith\(github\.event\.inputs\.tag_name \|\| github\.ref_name, 'v'\)/);
  assert.match(release, /git show-ref --verify --quiet "refs\/tags\/\$\{TAG_NAME\}"/);
  assert.match(release, /npm run build && npm run verify:reproducible/);
});

test("deployment workflow produces flat validated uploads with traceable source paths", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const docxReference = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/05-miku-md2docx.md"),
    "utf8"
  );
  assert.match(skillMd, /miku-md2docx/);
  assert.match(skillMd, /変換バックエンドの指定がなければNode\.js版を使用/);
  assert.match(skillMd, /選択形式の自動生成資料、手動Markdown、検証済みの準備済み資料/);
  assert.match(skillMd, /リポジトリルート基準の相対パス/);
  assert.match(docxReference, /DOCX間の相対リンクが解決されることを前提にしない/);
  assert.match(docxReference, /upload\/.*登録候補だけのフラット構成/);
});

test("folder conversion stops after preparation and resumes from persistent state", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
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
  assert.match(skillMd, /`manual-input\/`の解決済みフルパスと出力先基準の相対パス/);
  assert.match(skillMd, /`~`、未展開の環境変数.*相対パスだけで案内しない/);
  assert.match(workflow, /## 手動追加資料の配置案内/);
  assert.match(workflow, /ディレクトリが実在することを確認/);
  assert.match(workflow, /「`manual-input\/`へ置いてください」だけで終えず/);
  assert.match(workflow, /フルパスは人向けのローカル作業案内.*Knowledgeファイル.*含めない/);
  assert.match(readme, /解決済みフルパスと出力先基準の相対パスを利用者へ示します/);
});

test("stage 2 creates and runs a reusable fixed-structure conversion job", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );
  const repeatableJob = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/02-repeatable-conversion-job.md"),
    "utf8"
  );

  for (const content of [readme, skillMd, workflow, repeatableJob]) {
    assert.match(content, /conversion-plan\.json/);
    assert.match(content, /run-conversion\.mjs/);
  }
  assert.match(skillMd, /初回変換.*同じランナー/s);
  assert.match(workflow, /個別に本実行せず/);
  assert.match(repeatableJob, /内容だけを更新/);
  assert.match(repeatableJob, /既存.*upload\/.*変更せず停止/s);
  assert.match(repeatableJob, /意味上の正確性.*機密情報.*自動承認しない/s);
});

test("conversion outputs use timestamped run directories without changing them on resume", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  for (const content of [readme, skillMd, workflow]) {
    assert.match(content, /workplace\/miku-ai-assistant-builder\/YYYYMMDD-HHmm/);
    assert.match(content, /-02/);
  }
  assert.match(skillMd, /第2段階では新しい日時ディレクトリを作らず/);
  assert.match(workflow, /既存の`work\/preparation-status\.md`が属する実行ディレクトリを再利用/);
  assert.match(workflow, /`temp1\/`など別の基準ディレクトリ/);
});

test("run directories use the OS local clock and atomically avoid minute collisions", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miku-ai-assistant-builder-run-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const localTime = new Date(2026, 6, 21, 16, 21, 37);

  assert.equal(formatLocalRunId(localTime), "20260721-1621");
  const first = createRunDirectory({ baseDirectory: temporaryRoot, now: localTime });
  const second = createRunDirectory({ baseDirectory: temporaryRoot, now: localTime });

  assert.equal(first.runId, "20260721-1621");
  assert.equal(second.runId, "20260721-1621-02");
  assert.equal(fs.statSync(first.outputDirectory).isDirectory(), true);
  assert.equal(fs.statSync(second.outputDirectory).isDirectory(), true);
  assert.match(first.createdAt, /^20260721T16:21:37[+-]\d{2}:\d{2}$/);
  assert.equal(typeof first.timeZone, "string");
});

test("folder conversion delegates timestamp creation to the bundled script", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.match(skillMd, /scripts\/create-run-directory\.mjs/);
  assert.match(skillMd, /会話中の時刻、モデルの推測、手入力した時分から実行IDを作らない/);
  assert.match(workflow, /node <skill-directory>\/scripts\/create-run-directory\.mjs --base-directory/);
  assert.match(workflow, /スクリプトのJSON出力にある`runId`、`outputDirectory`、`createdAt`、`timeZone`をそのまま採用/);
  assert.match(workflow, /スクリプトが失敗した場合.*代替生成せず.*停止/);
  assert.match(readme, /OSのローカル時計から生成/);
});

test("repeat conversion records prior choices but creates a fresh run directory", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  for (const content of [readme, skillMd, workflow]) {
    assert.match(content, /work\/execution-record\.md/);
    assert.match(content, /新しい日時付き実行ディレクトリ/);
  }
  assert.match(skillMd, /前回値を現在の指定とみなさず/);
  assert.match(skillMd, /過去の`manual-input\/`、`upload\/`、`work\/`を自動コピーまたは再利用しない/);
  assert.match(workflow, /## 前回条件を参照する反復実行/);
  assert.match(workflow, /前回記録は入力候補であり、現在の実行指示ではない/);
  assert.match(workflow, /現在の入力ファイル.*対象サービスの利用可否と上限.*再計算/s);
  assert.match(workflow, /## execution-record\.md/);
  assert.match(workflow, /Previous execution record/);
  assert.match(workflow, /Do not reuse this run directory/);
  assert.match(readme, /前回の作業フォルダや`manual-input\/`、`upload\/`は再利用・自動コピーしません/);
});

test("Gem handoff mirrors the shared Agent Builder input core", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const inputFields = fs.readFileSync(
    path.resolve(skillRoot, "references/instructions/01-input-fields.md"),
    "utf8"
  );
  const gemReference = fs.readFileSync(
    path.resolve(skillRoot, "references/platform/03-gemini-gems.md"),
    "utf8"
  );

  for (const content of [readme, skillMd, inputFields, gemReference]) {
    assert.match(content, /Name.*Description.*Custom instructions.*Knowledge.*Items to confirm/s);
  }
  assert.match(gemReference, /Custom instructions.*Gem作成画面のInstructions欄へ転記/s);
  assert.match(inputFields, /Starter promptsとCapabilities.*追加項目/);
});

test("new conversion waits for explicit platform and automatic-input scope", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );
  const openaiYaml = fs.readFileSync(
    path.resolve(skillRoot, "agents/openai.yaml"),
    "utf8"
  );

  assert.match(skillMd, /## 開始確認ゲート/);
  assert.match(skillMd, /Microsoft 365 Copilot Agent Builder.*Google Gemini Gem Classic/);
  assert.match(skillMd, /自動処理の入力範囲/);
  assert.match(skillMd, /どちらか一方でも未確定なら.*回答を待って停止する/);
  assert.match(skillMd, /質問する前から、現在の作業ディレクトリ.*リポジトリルート.*開いているファイル.*決め込まない/);
  assert.match(skillMd, /`特に指定なし`、`おまかせ`.*回答後に合理的な想定で補完してよい/);
  assert.match(skillMd, /無回答、曖昧な返答、話題の変更を委任とみなさない/);
  assert.match(workflow, /## 開始前に人へ確認すること/);
  assert.match(workflow, /確認前は入力フォルダの一覧取得や内容確認を行わず/);
  assert.match(workflow, /委任された項目だけを補完する/);
  assert.match(readme, /「特に指定なし」「おまかせ」.*回答後に初めて/);
  assert.match(openaiYaml, /wait for the answers before inspecting files/);
  assert.match(openaiYaml, /explicitly says there is no preference or delegates the choice/);
});

test("manual files determine the remaining automatic upload budget", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );
  const budget = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/06-upload-file-budget.md"),
    "utf8"
  );
  const bundleReference = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/03-miku-text-bundle.md"),
    "utf8"
  );

  assert.match(skillMd, /第1段階では`miku-text-bundle`を実行せず/);
  assert.match(skillMd, /人力資料は最大19件/);
  assert.match(skillMd, /A = 20 - M/);
  assert.match(skillMd, /T = min\(N, A\)/);
  assert.match(skillMd, /max\(120000, ceil\(C \/ T\)\)/);
  assert.match(workflow, /空き枠を埋めるための分割は行わない/);
  assert.match(workflow, /Agent Builderでは.*最終登録候補総数が20以下/);
  assert.match(budget, /M`が20以上.*19件以下への削減/);
  assert.match(budget, /`N`が0.*停止/);
  assert.match(budget, /推定Knowledgeファイル数が`A`を超える場合/);
  assert.match(budget, /Microsoftの製品制限ではない/);
  assert.match(bundleReference, /<calculatedMaxChars>/);
  assert.match(bundleReference, /本実行結果が自動生成枠を超えた場合/);
});

test("automatic processing includes eligible text through miku-text-bundle by default", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );
  const budget = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/06-upload-file-budget.md"),
    "utf8"
  );
  const bundleReference = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/03-miku-text-bundle.md"),
    "utf8"
  );

  assert.match(skillMd, /\.md.*\.mjs.*\.js.*原則すべて自動処理対象/);
  assert.match(workflow, /既定で`Auto include`/);
  assert.match(workflow, /旧版、重複候補だけを理由に対象を絞り込まない/);
  assert.match(budget, /関連性、旧版、重複の推定だけで`N`を減らさない/);
  assert.match(bundleReference, /原則すべて収集対象/);
  assert.doesNotMatch(workflow, /Convert first/);
});

test("non-text files are not automatically converted into bundle inputs", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );
  const bundleReference = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/03-miku-text-bundle.md"),
    "utf8"
  );

  assert.match(skillMd, /非テキスト資料を自動でテキスト化せず/);
  assert.match(workflow, /非テキスト資料を自動変換せず/);
  assert.match(workflow, /`Manual candidate`/);
  assert.match(bundleReference, /自動でテキスト化.*しない/);
});

test("deployment stays a human-controlled internal handoff", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.match(skillMd, /利用者が管理するAgent BuilderまたはGemへ人が配備/);
  assert.match(skillMd, /ファイルのアップロード、共有設定、外部Webや公開リポジトリへの公開を行わない/);
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

test("Gem deployment supports explicit Markdown or DOCX selection", () => {
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const gemReference = fs.readFileSync(
    path.resolve(skillRoot, "references/platform/03-gemini-gems.md"),
    "utf8"
  );
  const workflow = fs.readFileSync(
    path.resolve(skillRoot, "references/workflows/01-folder-conversion.md"),
    "utf8"
  );

  assert.match(skillMd, /Google GeminiのGem/);
  assert.match(skillMd, /Agent Builderを主対象.*Gemにも対応/);
  assert.match(skillMd, /Gemの場合.*`markdown`.*`docx`.*推測で選ばない/);
  assert.match(skillMd, /Gemの`markdown`選択では`miku-md2docx`を実行せず/);
  assert.match(gemReference, /GemのKnowledgeへファイルを追加できる/);
  assert.match(gemReference, /対象サービスごとに機能、上限、検証条件が異なる.*同一仕様とはみなさない/);
  assert.match(gemReference, /`gem-input\.md`.*Knowledgeへ添付しない/);
  assert.match(workflow, /Gemでは20件を流用しない/);
});

test("beta status is visible in primary user-facing descriptions", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const openaiYaml = fs.readFileSync(
    path.resolve(skillRoot, "agents/openai.yaml"),
    "utf8"
  );

  assert.match(readme, /本スキル全体はベータ版/);
  assert.match(skillMd, /description: ベータ版/);
  assert.match(skillMd, /本スキル全体はベータ版/);
  assert.match(openaiYaml, /display_name: "Miku AI Assistant Builder \(Beta\)"/);
  assert.match(openaiYaml, /short_description: "ベータ版:/);
  assert.match(openaiYaml, /Use the beta \$igapyon-miku-ai-assistant-builder skill/);
});

test("knowledge preparation does not promise exhaustive runtime retrieval", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const principles = fs.readFileSync(
    path.resolve(skillRoot, "references/knowledge-sources/01-principles.md"),
    "utf8"
  );
  const limitations = fs.readFileSync(
    path.resolve(skillRoot, "references/platform/02-limitations.md"),
    "utf8"
  );

  assert.match(readme, /入力範囲.*全情報を常に検索・取得・参照できること.*保証するものではありません/s);
  assert.match(readme, /配備後は代表的な質問で回答を確認/);
  assert.match(skillMd, /準備・登録と、配備後の検索・取得・回答を区別/);
  assert.match(principles, /登録と実行時の検索を分ける/);
  assert.match(principles, /完全な全件検索が必要な用途には使わない/);
  assert.match(limitations, /Knowledge sourcesに存在する情報を必ず発見すること/);
});

test("file-backed deployment requires an eligible platform environment", () => {
  const readme = fs.readFileSync(path.resolve(ROOT, "README.md"), "utf8");
  const skillMd = fs.readFileSync(path.resolve(skillRoot, "SKILL.md"), "utf8");
  const limitations = fs.readFileSync(
    path.resolve(skillRoot, "references/platform/02-limitations.md"),
    "utf8"
  );

  assert.match(readme, /Agent Builderでは.*ファイル添付を利用できるライセンスまたは従量課金環境/);
  assert.match(skillMd, /Gemは.*Knowledgeへのファイル追加を利用できるアカウント、プラン、管理者設定/);
  assert.match(limitations, /端末からの埋め込みファイルを利用できるライセンスまたは従量課金環境だけを対象/);
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
