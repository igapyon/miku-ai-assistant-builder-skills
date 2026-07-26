import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createConversionJob } from "../skills/igapyon-miku-ai-assistant-builder/scripts/create-conversion-job.mjs";

const ROOT = process.cwd();
const skillRoot = path.resolve(ROOT, "skills/igapyon-miku-ai-assistant-builder");

function digestDirectory(directory) {
  const hash = crypto.createHash("sha256");
  for (const name of fs.readdirSync(directory).sort()) {
    hash.update(name);
    hash.update(fs.readFileSync(path.resolve(directory, name)));
  }
  return hash.digest("hex");
}

test("a generated conversion job is reusable while file structure stays fixed", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miku-conversion-job-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceDirectory = path.resolve(temporaryRoot, "source");
  const runDirectory = path.resolve(temporaryRoot, "run");
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(path.resolve(runDirectory, "manual-input"), { recursive: true });
  fs.mkdirSync(path.resolve(runDirectory, "work"), { recursive: true });
  fs.writeFileSync(path.resolve(sourceDirectory, "alpha.md"), "automatic version one\n", "utf8");
  fs.writeFileSync(path.resolve(runDirectory, "manual-input/guide.md"), "manual version one\n", "utf8");

  const job = createConversionJob({
    runDirectory,
    skillDirectory: skillRoot,
    plan: {
      targetPlatform: "gem",
      knowledgeFormat: "markdown",
      totalFileLimit: 2,
      sourceDirectory,
      automaticInputPaths: ["alpha.md"],
      automaticOutputCount: 1,
      manualInputs: [
        { relativePath: "guide.md", kind: "markdown", outputBasename: "guide.md" }
      ],
      textBundle: {
        backend: "node",
        filenamePrefix: "knowledge",
        maxChars: 120000,
        maxInputFileBytes: 200000000,
        encoding: "utf-8",
        encodingExtensions: [],
        addExcludeExtensions: [],
        addExcludeDirectories: []
      },
      md2docx: { backend: "node" }
    }
  });

  assert.equal(fs.existsSync(job.planPath), true);
  assert.equal(fs.existsSync(job.runnerPath), true);
  execFileSync(process.execPath, [job.runnerPath], { cwd: runDirectory, encoding: "utf8" });
  assert.match(fs.readFileSync(path.resolve(runDirectory, "upload/knowledge-001.md"), "utf8"), /automatic version one/);
  assert.equal(fs.readFileSync(path.resolve(runDirectory, "upload/guide.md"), "utf8"), "manual version one\n");

  fs.writeFileSync(path.resolve(sourceDirectory, "alpha.md"), "automatic version two\n", "utf8");
  fs.writeFileSync(path.resolve(runDirectory, "manual-input/guide.md"), "manual version two\n", "utf8");
  execFileSync(process.execPath, [job.runnerPath], { cwd: temporaryRoot, encoding: "utf8" });
  assert.match(fs.readFileSync(path.resolve(runDirectory, "upload/knowledge-001.md"), "utf8"), /automatic version two/);
  assert.equal(fs.readFileSync(path.resolve(runDirectory, "upload/guide.md"), "utf8"), "manual version two\n");
  assert.equal(fs.readFileSync(path.resolve(runDirectory, "work/conversion-history.jsonl"), "utf8").trim().split("\n").length, 2);
});

test("a generated conversion job rejects structural changes without replacing upload", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miku-conversion-guard-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceDirectory = path.resolve(temporaryRoot, "source");
  const runDirectory = path.resolve(temporaryRoot, "run");
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(path.resolve(runDirectory, "manual-input"), { recursive: true });
  fs.mkdirSync(path.resolve(runDirectory, "work"), { recursive: true });
  fs.writeFileSync(path.resolve(sourceDirectory, "alpha.md"), "alpha\n", "utf8");
  fs.writeFileSync(path.resolve(runDirectory, "manual-input/guide.md"), "guide\n", "utf8");

  const { runnerPath } = createConversionJob({
    runDirectory,
    skillDirectory: skillRoot,
    plan: {
      targetPlatform: "gem",
      knowledgeFormat: "markdown",
      totalFileLimit: 2,
      sourceDirectory,
      automaticInputPaths: ["alpha.md"],
      automaticOutputCount: 1,
      manualInputs: [
        { relativePath: "guide.md", kind: "markdown", outputBasename: "guide.md" }
      ],
      textBundle: {
        backend: "node",
        filenamePrefix: "knowledge",
        maxChars: 120000,
        maxInputFileBytes: 200000000,
        encoding: "utf-8"
      },
      md2docx: { backend: "node" }
    }
  });
  execFileSync(process.execPath, [runnerPath], { encoding: "utf8" });
  const before = digestDirectory(path.resolve(runDirectory, "upload"));

  fs.writeFileSync(path.resolve(sourceDirectory, "unexpected.md"), "unexpected\n", "utf8");
  assert.throws(
    () => execFileSync(process.execPath, [runnerPath], { encoding: "utf8", stdio: "pipe" }),
    /automatic input file set changed/
  );
  assert.equal(digestDirectory(path.resolve(runDirectory, "upload")), before);

  fs.rmSync(path.resolve(sourceDirectory, "unexpected.md"));
  fs.writeFileSync(path.resolve(runDirectory, "manual-input/unexpected.md"), "unexpected\n", "utf8");
  assert.throws(
    () => execFileSync(process.execPath, [runnerPath], { encoding: "utf8", stdio: "pipe" }),
    /manual-input file set changed/
  );
  assert.equal(digestDirectory(path.resolve(runDirectory, "upload")), before);
});

test("an Agent Builder conversion job creates DOCX through the same generated runner", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miku-conversion-docx-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceDirectory = path.resolve(temporaryRoot, "source");
  const runDirectory = path.resolve(temporaryRoot, "run");
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(path.resolve(runDirectory, "manual-input"), { recursive: true });
  fs.mkdirSync(path.resolve(runDirectory, "work"), { recursive: true });
  fs.writeFileSync(path.resolve(sourceDirectory, "alpha.md"), "# Automatic\n\nBody\n", "utf8");
  fs.writeFileSync(path.resolve(runDirectory, "manual-input/guide.md"), "# Manual\n\nBody\n", "utf8");

  const { runnerPath } = createConversionJob({
    runDirectory,
    skillDirectory: skillRoot,
    plan: {
      targetPlatform: "agent-builder",
      knowledgeFormat: "docx",
      totalFileLimit: 20,
      sourceDirectory,
      automaticInputPaths: ["alpha.md"],
      automaticOutputCount: 1,
      manualInputs: [
        { relativePath: "guide.md", kind: "markdown", outputBasename: "guide.docx" }
      ],
      textBundle: {
        backend: "node",
        filenamePrefix: "knowledge",
        maxChars: 120000,
        maxInputFileBytes: 200000000,
        encoding: "utf-8"
      },
      md2docx: { backend: "node" }
    }
  });
  execFileSync(process.execPath, [runnerPath], { encoding: "utf8" });
  for (const basename of ["knowledge-001.docx", "guide.docx"]) {
    const content = fs.readFileSync(path.resolve(runDirectory, "upload", basename));
    assert.equal(content.subarray(0, 2).toString("ascii"), "PK");
  }
});

test("a conversion job creates one XLSX workbook for one reviewed JSON input", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miku-conversion-json2xlsx-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceDirectory = path.resolve(temporaryRoot, "source");
  const runDirectory = path.resolve(temporaryRoot, "run");
  const mappingDirectory = path.resolve(runDirectory, "work/json2xlsx-mappings");
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(path.resolve(runDirectory, "manual-input"), { recursive: true });
  fs.mkdirSync(mappingDirectory, { recursive: true });
  fs.writeFileSync(path.resolve(sourceDirectory, "records.json"), JSON.stringify([
    { id: 1, name: "alpha" },
    { id: 2, name: "beta" }
  ]), "utf8");
  const mappingPath = path.resolve(mappingDirectory, "records.mapping.json");
  fs.writeFileSync(mappingPath, `${JSON.stringify({
    schemaVersion: 1,
    sheets: [{
      name: "Records",
      kind: "root",
      sourcePath: "$",
      recordIdColumn: "record_id",
      sourceRecordColumn: "source_record",
      columns: [
        { name: "id", sourcePath: "$.id", type: "number" },
        { name: "name", sourcePath: "$.name", type: "string" }
      ]
    }]
  }, null, 2)}\n`, "utf8");
  const mappingSha256 = crypto.createHash("sha256").update(fs.readFileSync(mappingPath)).digest("hex");

  const { runnerPath } = createConversionJob({
    runDirectory,
    skillDirectory: skillRoot,
    plan: {
      targetPlatform: "agent-builder",
      knowledgeFormat: "docx",
      totalFileLimit: 20,
      sourceDirectory,
      automaticInputPaths: [],
      automaticOutputCount: 0,
      jsonWorkbookInputs: [{
        relativePath: "records.json",
        mappingPath: "json2xlsx-mappings/records.mapping.json",
        mappingSha256,
        outputBasename: "records.xlsx"
      }],
      manualInputs: [],
      textBundle: {
        backend: "node",
        filenamePrefix: "knowledge",
        maxChars: 120000,
        maxInputFileBytes: 200000000,
        encoding: "utf-8",
        addExcludeExtensions: [".json", ".jsonl"]
      },
      md2docx: { backend: "node" },
      json2xlsx: { backend: "node" }
    }
  });

  const firstResult = JSON.parse(execFileSync(process.execPath, [runnerPath], { encoding: "utf8" }));
  const workbookPath = path.resolve(runDirectory, "upload/records.xlsx");
  assert.equal(fs.readFileSync(workbookPath).subarray(0, 2).toString("ascii"), "PK");
  assert.equal(firstResult.jsonWorkbookInputCount, 1);
  assert.deepEqual(firstResult.finalBasenames, ["records.xlsx"]);
  assert.deepEqual(firstResult.jsonWorkbookResults[0].warningCodes, []);

  fs.writeFileSync(path.resolve(sourceDirectory, "records.json"), JSON.stringify([
    { id: 3, name: "gamma" }
  ]), "utf8");
  const secondResult = JSON.parse(execFileSync(process.execPath, [runnerPath], { encoding: "utf8" }));
  assert.equal(secondResult.jsonWorkbookInputCount, 1);
  assert.equal(fs.readFileSync(workbookPath).subarray(0, 2).toString("ascii"), "PK");

  const beforeMappingChange = digestDirectory(path.resolve(runDirectory, "upload"));
  fs.appendFileSync(mappingPath, "\n", "utf8");
  assert.throws(
    () => execFileSync(process.execPath, [runnerPath], { encoding: "utf8", stdio: "pipe" }),
    /JSON workbook mapping digest changed/
  );
  assert.equal(digestDirectory(path.resolve(runDirectory, "upload")), beforeMappingChange);
  fs.writeFileSync(mappingPath, fs.readFileSync(mappingPath, "utf8").trimEnd() + "\n", "utf8");

  fs.writeFileSync(path.resolve(sourceDirectory, "unexpected.jsonl"), "{\"id\":4,\"name\":\"delta\"}\n", "utf8");
  assert.throws(
    () => execFileSync(process.execPath, [runnerPath], { encoding: "utf8", stdio: "pipe" }),
    /JSON workbook input file set changed/
  );
});
