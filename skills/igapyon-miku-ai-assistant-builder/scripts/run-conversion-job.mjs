#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPPORTED_COPY_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx", ".pdf"]);
const DEFAULT_DISCOVERY_EXCLUDE_DIRECTORIES = new Set([
  ".git", ".codex", ".vscode", ".idea", "node_modules", "dist", "build",
  "target", "coverage", "workplace", "tmp", "temp"
]);

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function requireSafeRelativePath(value, label) {
  requireNonEmptyString(value, label);
  const normalized = toPosix(path.normalize(value));
  if (path.isAbsolute(value) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} must stay inside its declared root: ${value}`);
  }
  return normalized;
}

function assertUniqueCaseInsensitive(values, label) {
  const seen = new Map();
  for (const value of values) {
    const folded = value.toLocaleLowerCase("en-US");
    if (seen.has(folded)) throw new Error(`${label} collision: ${seen.get(folded)} and ${value}`);
    seen.set(folded, value);
  }
}

function listRegularFiles(rootDirectory) {
  const result = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareUtf16(left.name, right.name))) {
      const absolutePath = path.resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are not allowed in manual-input: ${absolutePath}`);
      if (entry.isDirectory()) walk(absolutePath);
      else if (entry.isFile()) result.push(toPosix(path.relative(rootDirectory, absolutePath)));
      else throw new Error(`unsupported manual-input entry: ${absolutePath}`);
    }
  }
  walk(rootDirectory);
  return result.sort(compareUtf16);
}

function assertSameSet(actual, expected, label) {
  const actualSorted = [...new Set(actual)].sort(compareUtf16);
  const expectedSorted = [...new Set(expected)].sort(compareUtf16);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(`${label} changed; expected ${JSON.stringify(expectedSorted)}, found ${JSON.stringify(actualSorted)}`);
  }
}

function isExcludedDirectory(relativePath, excludedDirectories) {
  const normalizedPath = toPosix(relativePath).replace(/\/+$/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  for (const excludedDirectory of excludedDirectories) {
    const normalizedExcluded = toPosix(excludedDirectory).replace(/^\.\/|\/+$/g, "");
    if (normalizedExcluded.includes("/")) {
      if (normalizedPath === normalizedExcluded || normalizedPath.startsWith(`${normalizedExcluded}/`)) return true;
    } else if (segments.includes(normalizedExcluded)) {
      return true;
    }
  }
  return false;
}

function listJsonSourceFiles(rootDirectory, additionalExcludedDirectories = []) {
  const excludedDirectories = new Set([...DEFAULT_DISCOVERY_EXCLUDE_DIRECTORIES, ...additionalExcludedDirectories]);
  const result = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareUtf16(left.name, right.name))) {
      const absolutePath = path.resolve(directory, entry.name);
      const relativePath = toPosix(path.relative(rootDirectory, absolutePath));
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are not allowed in JSON workbook inputs: ${absolutePath}`);
      if (entry.isDirectory()) {
        if (!isExcludedDirectory(relativePath, excludedDirectories)) walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if ([".json", ".jsonl"].includes(path.extname(entry.name).toLowerCase())) result.push(relativePath);
    }
  }
  walk(rootDirectory);
  return result.sort(compareUtf16);
}

function runtimeCommand(skillDirectory, family, backend) {
  if (family === "textBundle" && backend === "node") {
    return { command: process.execPath, prefix: [path.resolve(skillDirectory, "runtime/miku-text-bundle-1.6.0.mjs")] };
  }
  if (family === "textBundle" && backend === "java") {
    return { command: "java", prefix: ["-jar", path.resolve(skillDirectory, "runtime/miku-text-bundle-java-1.6.0.jar")] };
  }
  if (family === "md2docx" && backend === "node") {
    return { command: process.execPath, prefix: [path.resolve(skillDirectory, "runtime/miku-md2docx-1.1.0.mjs")] };
  }
  if (family === "md2docx" && backend === "java") {
    return { command: "java", prefix: ["-jar", path.resolve(skillDirectory, "runtime/miku-md2docx-java-1.1.0.jar")] };
  }
  if (family === "json2xlsx" && backend === "node") {
    return { command: process.execPath, prefix: [path.resolve(skillDirectory, "runtime/miku-json2xlsx-0.5.0.mjs")] };
  }
  throw new Error(`unsupported ${family} backend: ${backend}`);
}

function executeRuntime(runtime, args, options = {}) {
  return execFileSync(runtime.command, [...runtime.prefix, ...args], {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
}

function addRepeatedArguments(args, flag, values = []) {
  for (const value of values) args.push(flag, requireNonEmptyString(value, flag));
}

function executeStructuredRuntime(runtime, args, label) {
  const execution = spawnSync(runtime.command, [...runtime.prefix, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (execution.error) throw execution.error;
  let result;
  try {
    result = JSON.parse(execution.stdout);
  } catch {
    throw new Error(`${label} did not return valid JSON; exit=${execution.status}; stderr=${execution.stderr.trim()}`);
  }
  if (execution.status !== 0 || result?.status !== "success") {
    const codes = Array.isArray(result?.diagnostics)
      ? result.diagnostics.map((entry) => entry?.code).filter(Boolean).join(", ")
      : "";
    throw new Error(`${label} failed; exit=${execution.status}; diagnostics=${codes || "none"}; stderr=${execution.stderr.trim()}`);
  }
  return result;
}

function buildBundleArguments(plan, outputDirectory, dryRun) {
  const bundle = requirePlainObject(plan.textBundle, "textBundle");
  const args = [
    "--input", path.resolve(plan.sourceDirectory),
    "--output", outputDirectory,
    "--mode", "knowledge-source",
    "--filename-prefix", requireNonEmptyString(bundle.filenamePrefix, "textBundle.filenamePrefix"),
    "--max-chars", String(requirePositiveInteger(bundle.maxChars, "textBundle.maxChars")),
    "--max-input-file-bytes", String(requirePositiveInteger(bundle.maxInputFileBytes, "textBundle.maxInputFileBytes")),
    "--encoding", bundle.encoding ?? "utf-8"
  ];
  addRepeatedArguments(args, "--encoding-extension", bundle.encodingExtensions);
  addRepeatedArguments(args, "--add-exclude-extension", bundle.addExcludeExtensions);
  addRepeatedArguments(args, "--add-exclude-directory", bundle.addExcludeDirectories);
  if (bundle.verbose) args.push("--verbose");
  if (dryRun) args.push("--dry-run");
  return args;
}

function parseSourcePaths(indexText) {
  const section = indexText.match(/## Source Mapping\s*\n([\s\S]*?)(?:\n## |$)/)?.[1];
  if (!section) throw new Error("knowledge index lacks Source Mapping");
  const sources = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^\| `((?:\\`|[^`])+)` \| `/);
    if (match) sources.push(match[1].replaceAll("\\`", "`"));
  }
  return [...new Set(sources)].sort(compareUtf16);
}

function validatePlan(rawPlan, planPath) {
  const plan = requirePlainObject(rawPlan, "plan");
  if (plan.schemaVersion !== 1) throw new Error(`unsupported schemaVersion: ${plan.schemaVersion}`);
  if (!['agent-builder', 'gem'].includes(plan.targetPlatform)) {
    throw new Error(`unsupported targetPlatform: ${plan.targetPlatform}`);
  }
  if (!['docx', 'markdown'].includes(plan.knowledgeFormat)) {
    throw new Error(`unsupported knowledgeFormat: ${plan.knowledgeFormat}`);
  }
  if (plan.targetPlatform === "agent-builder" && plan.knowledgeFormat !== "docx") {
    throw new Error("agent-builder requires knowledgeFormat docx");
  }
  requireNonEmptyString(plan.skillDirectory, "skillDirectory");
  requireNonEmptyString(plan.sourceDirectory, "sourceDirectory");
  if (!fs.statSync(path.resolve(plan.sourceDirectory)).isDirectory()) throw new Error("sourceDirectory is not a directory");
  if (!Array.isArray(plan.automaticInputPaths)) throw new Error("automaticInputPaths must be an array");
  plan.automaticInputPaths = plan.automaticInputPaths.map((entry, index) => requireSafeRelativePath(entry, `automaticInputPaths[${index}]`));
  assertUniqueCaseInsensitive(plan.automaticInputPaths, "automaticInputPaths");
  for (const relativePath of plan.automaticInputPaths) {
    const basename = path.basename(relativePath).toLowerCase();
    if (basename === ".env" || basename.startsWith(".env.")) {
      throw new Error(`automaticInputPaths must not include environment files: ${relativePath}`);
    }
  }
  requireNonNegativeInteger(plan.automaticOutputCount, "automaticOutputCount");
  if (plan.automaticInputPaths.length === 0 && plan.automaticOutputCount !== 0) {
    throw new Error("automaticOutputCount must be 0 when automaticInputPaths is empty");
  }
  if (plan.automaticInputPaths.length > 0 && plan.automaticOutputCount === 0) {
    throw new Error("automaticOutputCount must be positive when automaticInputPaths is not empty");
  }
  requirePositiveInteger(plan.totalFileLimit, "totalFileLimit");
  if (!Array.isArray(plan.manualInputs)) throw new Error("manualInputs must be an array");
  plan.manualInputs = plan.manualInputs.map((entry, index) => {
    requirePlainObject(entry, `manualInputs[${index}]`);
    const relativePath = requireSafeRelativePath(entry.relativePath, `manualInputs[${index}].relativePath`);
    const outputBasename = path.basename(requireSafeRelativePath(entry.outputBasename, `manualInputs[${index}].outputBasename`));
    if (!['markdown', 'copy'].includes(entry.kind)) throw new Error(`unsupported manual input kind: ${entry.kind}`);
    if (entry.kind === "markdown") {
      if (path.extname(relativePath).toLowerCase() !== ".md") throw new Error(`markdown manual input must end in .md: ${relativePath}`);
      const expectedExtension = plan.knowledgeFormat === "docx" ? ".docx" : ".md";
      if (path.extname(outputBasename).toLowerCase() !== expectedExtension) {
        throw new Error(`markdown output must end in ${expectedExtension}: ${outputBasename}`);
      }
    }
    if (entry.kind === "copy" && !SUPPORTED_COPY_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
      throw new Error(`unsupported copied manual input: ${relativePath}`);
    }
    if (entry.kind === "copy" && outputBasename !== path.basename(relativePath)) {
      throw new Error(`copied manual input must preserve basename: ${relativePath}`);
    }
    return { relativePath, outputBasename, kind: entry.kind };
  });
  const planDirectory = path.dirname(planPath);
  const runDirectory = path.resolve(planDirectory, "..");
  if (path.basename(planDirectory) !== "work") throw new Error("conversion-plan.json must be inside the run work directory");
  plan.jsonWorkbookInputs ??= [];
  if (!Array.isArray(plan.jsonWorkbookInputs)) throw new Error("jsonWorkbookInputs must be an array");
  plan.jsonWorkbookInputs = plan.jsonWorkbookInputs.map((entry, index) => {
    requirePlainObject(entry, `jsonWorkbookInputs[${index}]`);
    const relativePath = requireSafeRelativePath(entry.relativePath, `jsonWorkbookInputs[${index}].relativePath`);
    if (![".json", ".jsonl"].includes(path.extname(relativePath).toLowerCase())) {
      throw new Error(`JSON workbook input must end in .json or .jsonl: ${relativePath}`);
    }
    const sourcePath = path.resolve(plan.sourceDirectory, relativePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`JSON workbook input is missing: ${relativePath}`);
    }
    const mappingPath = requireSafeRelativePath(entry.mappingPath, `jsonWorkbookInputs[${index}].mappingPath`);
    const resolvedMappingPath = path.resolve(planDirectory, mappingPath);
    if (!resolvedMappingPath.startsWith(`${path.resolve(planDirectory)}${path.sep}`)) {
      throw new Error(`JSON workbook mapping must stay inside work/: ${mappingPath}`);
    }
    if (!fs.existsSync(resolvedMappingPath) || !fs.statSync(resolvedMappingPath).isFile()) {
      throw new Error(`JSON workbook mapping is missing: ${mappingPath}`);
    }
    const mappingSha256 = requireNonEmptyString(entry.mappingSha256, `jsonWorkbookInputs[${index}].mappingSha256`).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(mappingSha256)) throw new Error(`invalid mapping SHA-256: ${mappingSha256}`);
    if (hashFile(resolvedMappingPath) !== mappingSha256) throw new Error(`JSON workbook mapping digest changed: ${mappingPath}`);
    const outputBasename = path.basename(requireSafeRelativePath(entry.outputBasename, `jsonWorkbookInputs[${index}].outputBasename`));
    if (path.extname(outputBasename).toLowerCase() !== ".xlsx") {
      throw new Error(`JSON workbook output must end in .xlsx: ${outputBasename}`);
    }
    return { relativePath, mappingPath, mappingSha256, outputBasename };
  });
  assertUniqueCaseInsensitive(plan.jsonWorkbookInputs.map((entry) => entry.relativePath), "JSON workbook input path");
  assertUniqueCaseInsensitive(plan.jsonWorkbookInputs.map((entry) => entry.mappingPath), "JSON workbook mapping path");
  assertUniqueCaseInsensitive(plan.jsonWorkbookInputs.map((entry) => entry.outputBasename), "JSON workbook output basename");
  const automaticPathSet = new Set(plan.automaticInputPaths.map((entry) => entry.toLocaleLowerCase("en-US")));
  for (const entry of plan.jsonWorkbookInputs) {
    if (automaticPathSet.has(entry.relativePath.toLocaleLowerCase("en-US"))) {
      throw new Error(`input cannot be processed by both miku-text-bundle and miku-json2xlsx: ${entry.relativePath}`);
    }
  }
  if (plan.automaticInputPaths.length === 0 && plan.jsonWorkbookInputs.length === 0) {
    throw new Error("at least one automatic text or JSON workbook input is required");
  }
  if (plan.jsonWorkbookInputs.length > 0) {
    const json2xlsx = requirePlainObject(plan.json2xlsx, "json2xlsx");
    if ((json2xlsx.backend ?? "node") !== "node") throw new Error(`unsupported json2xlsx backend: ${json2xlsx.backend}`);
    const bundle = requirePlainObject(plan.textBundle, "textBundle");
    const excludedExtensions = new Set((bundle.addExcludeExtensions ?? []).map((entry) => entry.toLowerCase()));
    for (const requiredExtension of [".json", ".jsonl"]) {
      if (!excludedExtensions.has(requiredExtension)) {
        throw new Error(`textBundle.addExcludeExtensions must include ${requiredExtension} when JSON workbooks are enabled`);
      }
    }
    assertSameSet(
      listJsonSourceFiles(path.resolve(plan.sourceDirectory), bundle.addExcludeDirectories ?? []),
      plan.jsonWorkbookInputs.map((entry) => entry.relativePath),
      "JSON workbook input file set"
    );
  }
  return { plan, runDirectory, planDirectory };
}

function expectedAutomaticBasenames(plan) {
  const extension = plan.knowledgeFormat === "docx" ? ".docx" : ".md";
  const width = Math.max(3, String(plan.automaticOutputCount).length);
  return Array.from({ length: plan.automaticOutputCount }, (_, index) =>
    `${plan.textBundle.filenamePrefix}-${String(index + 1).padStart(width, "0")}${extension}`
  );
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateDocx(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error(`invalid DOCX output: ${filePath}`);
}

function validateXlsx(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error(`invalid XLSX output: ${filePath}`);
}

function replaceTargetsAtomically(replacements, backupDirectory) {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const movedExisting = [];
  const installed = [];
  try {
    for (const replacement of replacements) {
      if (!fs.existsSync(replacement.target)) continue;
      const backup = path.resolve(backupDirectory, replacement.backupName);
      fs.renameSync(replacement.target, backup);
      movedExisting.push({ target: replacement.target, backup });
    }
    for (const replacement of replacements) {
      fs.renameSync(replacement.staged, replacement.target);
      installed.push(replacement.target);
    }
  } catch (error) {
    for (const target of installed.reverse()) fs.rmSync(target, { recursive: true, force: true });
    for (const prior of movedExisting.reverse()) {
      if (fs.existsSync(prior.backup)) fs.renameSync(prior.backup, prior.target);
    }
    throw error;
  }
}

export function runConversionPlan(planFilePath) {
  const planPath = path.resolve(planFilePath);
  const rawPlan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const { plan, runDirectory, planDirectory } = validatePlan(rawPlan, planPath);
  const manualDirectory = path.resolve(runDirectory, "manual-input");
  const actualManualPaths = listRegularFiles(manualDirectory);
  assertSameSet(actualManualPaths, plan.manualInputs.map((entry) => entry.relativePath), "manual-input file set");

  const automaticBasenames = expectedAutomaticBasenames(plan);
  const jsonWorkbookBasenames = plan.jsonWorkbookInputs.map((entry) => entry.outputBasename);
  const finalBasenames = [...automaticBasenames, ...jsonWorkbookBasenames, ...plan.manualInputs.map((entry) => entry.outputBasename)];
  assertUniqueCaseInsensitive(finalBasenames, "final output basename");
  if (finalBasenames.length > plan.totalFileLimit) {
    throw new Error(`final output count ${finalBasenames.length} exceeds limit ${plan.totalFileLimit}`);
  }

  const textBundle = plan.automaticInputPaths.length > 0
    ? runtimeCommand(plan.skillDirectory, "textBundle", plan.textBundle.backend ?? "node")
    : null;
  if (textBundle) {
    executeRuntime(textBundle, ["--version"], { capture: true });
    executeRuntime(textBundle, ["--help"], { capture: true });
  }
  const json2xlsx = plan.jsonWorkbookInputs.length > 0
    ? runtimeCommand(plan.skillDirectory, "json2xlsx", plan.json2xlsx?.backend ?? "node")
    : null;
  if (json2xlsx) {
    executeRuntime(json2xlsx, ["--version"], { capture: true });
    executeRuntime(json2xlsx, ["--help"], { capture: true });
  }
  const md2docx = plan.knowledgeFormat === "docx" || plan.manualInputs.some((entry) => entry.kind === "markdown" && entry.outputBasename.endsWith(".docx"))
    ? runtimeCommand(plan.skillDirectory, "md2docx", plan.md2docx?.backend ?? "node")
    : null;
  if (md2docx) {
    executeRuntime(md2docx, ["--version"], { capture: true });
    executeRuntime(md2docx, ["--help"], { capture: true });
  }

  const stagingRoot = fs.mkdtempSync(path.resolve(planDirectory, ".conversion-staging-"));
  const backupDirectory = path.resolve(planDirectory, `.conversion-backup-${path.basename(stagingRoot)}`);
  let committed = false;
  try {
    const bundleOutput = path.resolve(stagingRoot, "bundle-output");
    const stagedKnowledge = path.resolve(stagingRoot, "knowledge-markdown");
    const stagedUpload = path.resolve(stagingRoot, "upload");
    fs.mkdirSync(stagedUpload, { recursive: true });

    const indexBasename = `${plan.textBundle.filenamePrefix}-index.md`;
    let generatedMarkdown = [];
    if (textBundle) {
      executeRuntime(textBundle, buildBundleArguments(plan, bundleOutput, true));
      executeRuntime(textBundle, buildBundleArguments(plan, bundleOutput, false));

      const generatedIndex = path.resolve(bundleOutput, indexBasename);
      if (!fs.existsSync(generatedIndex)) throw new Error(`missing generated index: ${generatedIndex}`);
      const indexText = fs.readFileSync(generatedIndex, "utf8");
      assertSameSet(parseSourcePaths(indexText), plan.automaticInputPaths, "automatic input file set");

      generatedMarkdown = fs.readdirSync(bundleOutput)
        .filter((name) => name.startsWith(`${plan.textBundle.filenamePrefix}-`) && name.endsWith(".md") && name !== indexBasename)
        .sort(compareUtf16);
      assertSameSet(generatedMarkdown, automaticBasenames.map((name) => name.replace(/\.docx$/, ".md")), "automatic output file set");
      fs.renameSync(bundleOutput, stagedKnowledge);
      fs.renameSync(path.resolve(stagedKnowledge, indexBasename), path.resolve(stagingRoot, "knowledge-index.md"));
    } else {
      fs.mkdirSync(stagedKnowledge, { recursive: true });
      fs.writeFileSync(
        path.resolve(stagingRoot, "knowledge-index.md"),
        "# Knowledge Source Index\n\nNo miku-text-bundle outputs were generated for this conversion plan.\n",
        "utf8"
      );
    }

    for (const markdownBasename of generatedMarkdown) {
      const input = path.resolve(stagedKnowledge, markdownBasename);
      const outputBasename = plan.knowledgeFormat === "docx" ? markdownBasename.replace(/\.md$/, ".docx") : markdownBasename;
      const output = path.resolve(stagedUpload, outputBasename);
      if (plan.knowledgeFormat === "docx") {
        executeRuntime(md2docx, [input, "--out", output]);
        validateDocx(output);
      } else {
        fs.copyFileSync(input, output);
      }
    }

    const jsonWorkbookResults = [];
    for (const jsonInput of plan.jsonWorkbookInputs) {
      const input = path.resolve(plan.sourceDirectory, jsonInput.relativePath);
      const mapping = path.resolve(planDirectory, jsonInput.mappingPath);
      const output = path.resolve(stagedUpload, jsonInput.outputBasename);
      executeStructuredRuntime(
        json2xlsx,
        ["validate-mapping", "--mapping", mapping, "--result-format", "json"],
        `miku-json2xlsx mapping validation for ${jsonInput.relativePath}`
      );
      const conversionResult = executeStructuredRuntime(
        json2xlsx,
        ["convert", "--input", input, "--output", output, "--mapping", mapping, "--result-format", "json"],
        `miku-json2xlsx conversion for ${jsonInput.relativePath}`
      );
      const listedArtifact = conversionResult.artifacts?.some((artifact) =>
        artifact?.kind === "xlsx" && path.resolve(artifact.path) === output
      );
      if (!listedArtifact) throw new Error(`miku-json2xlsx did not report the expected XLSX artifact: ${jsonInput.outputBasename}`);
      validateXlsx(output);
      jsonWorkbookResults.push({
        relativePath: jsonInput.relativePath,
        outputBasename: jsonInput.outputBasename,
        warningCodes: (conversionResult.diagnostics ?? [])
          .filter((entry) => entry?.severity === "warning")
          .map((entry) => entry.code)
      });
    }

    for (const manualInput of plan.manualInputs) {
      const input = path.resolve(manualDirectory, manualInput.relativePath);
      const output = path.resolve(stagedUpload, manualInput.outputBasename);
      if (manualInput.kind === "markdown" && manualInput.outputBasename.toLowerCase().endsWith(".docx")) {
        executeRuntime(md2docx, [input, "--out", output]);
        validateDocx(output);
      } else {
        fs.copyFileSync(input, output);
        if (manualInput.kind === "copy" && hashFile(input) !== hashFile(output)) {
          throw new Error(`copied file hash mismatch: ${manualInput.relativePath}`);
        }
      }
    }
    assertSameSet(fs.readdirSync(stagedUpload).sort(compareUtf16), finalBasenames, "final upload file set");

    replaceTargetsAtomically([
      { staged: stagedKnowledge, target: path.resolve(planDirectory, "knowledge-markdown"), backupName: "knowledge-markdown" },
      { staged: path.resolve(stagingRoot, "knowledge-index.md"), target: path.resolve(planDirectory, "knowledge-index.md"), backupName: "knowledge-index.md" },
      { staged: stagedUpload, target: path.resolve(runDirectory, "upload"), backupName: "upload" }
    ], backupDirectory);
    committed = true;

    const result = {
      completedAt: new Date().toISOString(),
      host: os.hostname(),
      automaticInputCount: plan.automaticInputPaths.length + plan.jsonWorkbookInputs.length,
      automaticOutputCount: automaticBasenames.length + jsonWorkbookBasenames.length,
      textBundleInputCount: plan.automaticInputPaths.length,
      textBundleOutputCount: automaticBasenames.length,
      jsonWorkbookInputCount: plan.jsonWorkbookInputs.length,
      jsonWorkbookResults,
      manualInputCount: plan.manualInputs.length,
      finalOutputCount: finalBasenames.length,
      finalBasenames
    };
    try {
      fs.appendFileSync(path.resolve(planDirectory, "conversion-history.jsonl"), `${JSON.stringify(result)}\n`, "utf8");
    } catch (error) {
      process.stderr.write(`warning: could not append conversion history: ${error.message}\n`);
    }
    return result;
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    if (committed) fs.rmSync(backupDirectory, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  let planPath;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plan") {
      planPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--help") return { help: true };
    throw new Error(`unknown argument: ${argument}`);
  }
  return { planPath, help: false };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: run-conversion.mjs [--plan <conversion-plan.json>]\n");
    return;
  }
  const ownPath = fileURLToPath(import.meta.url);
  const planPath = options.planPath ?? path.resolve(path.dirname(ownPath), "conversion-plan.json");
  const result = runConversionPlan(planPath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
