#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPPORTED_COPY_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx", ".pdf"]);

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

function runtimeCommand(skillDirectory, family, backend) {
  if (family === "textBundle" && backend === "node") {
    return { command: process.execPath, prefix: [path.resolve(skillDirectory, "runtime/miku-text-bundle-1.6.0.mjs")] };
  }
  if (family === "textBundle" && backend === "java") {
    return { command: "java", prefix: ["-jar", path.resolve(skillDirectory, "runtime/miku-text-bundle-java-1.6.0.jar")] };
  }
  if (family === "md2docx" && backend === "node") {
    return { command: process.execPath, prefix: [path.resolve(skillDirectory, "runtime/miku-md2docx-1.0.1.mjs")] };
  }
  if (family === "md2docx" && backend === "java") {
    return { command: "java", prefix: ["-jar", path.resolve(skillDirectory, "runtime/miku-md2docx-java-1.0.1.jar")] };
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
  if (!Array.isArray(plan.automaticInputPaths) || plan.automaticInputPaths.length === 0) {
    throw new Error("automaticInputPaths must be a non-empty array");
  }
  plan.automaticInputPaths = plan.automaticInputPaths.map((entry, index) => requireSafeRelativePath(entry, `automaticInputPaths[${index}]`));
  assertUniqueCaseInsensitive(plan.automaticInputPaths, "automaticInputPaths");
  for (const relativePath of plan.automaticInputPaths) {
    const basename = path.basename(relativePath).toLowerCase();
    if (basename === ".env" || basename.startsWith(".env.")) {
      throw new Error(`automaticInputPaths must not include environment files: ${relativePath}`);
    }
  }
  requirePositiveInteger(plan.automaticOutputCount, "automaticOutputCount");
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
  const finalBasenames = [...automaticBasenames, ...plan.manualInputs.map((entry) => entry.outputBasename)];
  assertUniqueCaseInsensitive(finalBasenames, "final output basename");
  if (finalBasenames.length > plan.totalFileLimit) {
    throw new Error(`final output count ${finalBasenames.length} exceeds limit ${plan.totalFileLimit}`);
  }

  const textBundle = runtimeCommand(plan.skillDirectory, "textBundle", plan.textBundle.backend ?? "node");
  executeRuntime(textBundle, ["--version"], { capture: true });
  executeRuntime(textBundle, ["--help"], { capture: true });
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

    executeRuntime(textBundle, buildBundleArguments(plan, bundleOutput, true));
    executeRuntime(textBundle, buildBundleArguments(plan, bundleOutput, false));

    const indexBasename = `${plan.textBundle.filenamePrefix}-index.md`;
    const generatedIndex = path.resolve(bundleOutput, indexBasename);
    if (!fs.existsSync(generatedIndex)) throw new Error(`missing generated index: ${generatedIndex}`);
    const indexText = fs.readFileSync(generatedIndex, "utf8");
    assertSameSet(parseSourcePaths(indexText), plan.automaticInputPaths, "automatic input file set");

    const generatedMarkdown = fs.readdirSync(bundleOutput)
      .filter((name) => name.startsWith(`${plan.textBundle.filenamePrefix}-`) && name.endsWith(".md") && name !== indexBasename)
      .sort(compareUtf16);
    assertSameSet(generatedMarkdown, automaticBasenames.map((name) => name.replace(/\.docx$/, ".md")), "automatic output file set");
    fs.renameSync(bundleOutput, stagedKnowledge);
    fs.renameSync(path.resolve(stagedKnowledge, indexBasename), path.resolve(stagingRoot, "knowledge-index.md"));

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
      automaticInputCount: plan.automaticInputPaths.length,
      automaticOutputCount: automaticBasenames.length,
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
