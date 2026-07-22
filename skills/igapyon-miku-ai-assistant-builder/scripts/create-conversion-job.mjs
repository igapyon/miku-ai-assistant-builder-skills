#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillDirectory = path.resolve(scriptDirectory, "..");

export function createConversionJob({ runDirectory, plan, skillDirectory = defaultSkillDirectory }) {
  if (typeof runDirectory !== "string" || runDirectory.trim() === "") {
    throw new TypeError("runDirectory must be a non-empty string");
  }
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("plan must be an object");
  }

  const resolvedRunDirectory = path.resolve(runDirectory);
  const workDirectory = path.resolve(resolvedRunDirectory, "work");
  const manualInputDirectory = path.resolve(resolvedRunDirectory, "manual-input");
  for (const requiredDirectory of [resolvedRunDirectory, workDirectory, manualInputDirectory]) {
    if (!fs.existsSync(requiredDirectory) || !fs.statSync(requiredDirectory).isDirectory()) {
      throw new Error(`required directory is missing: ${requiredDirectory}`);
    }
  }

  const normalizedPlan = {
    ...plan,
    schemaVersion: 1,
    skillDirectory: path.resolve(skillDirectory)
  };
  const planPath = path.resolve(workDirectory, "conversion-plan.json");
  const runnerPath = path.resolve(workDirectory, "run-conversion.mjs");
  const runnerTemplatePath = path.resolve(scriptDirectory, "run-conversion-job.mjs");

  fs.writeFileSync(planPath, `${JSON.stringify(normalizedPlan, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  fs.copyFileSync(runnerTemplatePath, runnerPath);
  fs.chmodSync(runnerPath, 0o700);

  return { runDirectory: resolvedRunDirectory, planPath, runnerPath };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run-directory" || argument === "--plan") {
      options[argument === "--run-directory" ? "runDirectory" : "planPath"] = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--help") return { help: true };
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage: create-conversion-job.mjs --run-directory <directory> --plan <draft-plan.json>",
    "",
    "Creates work/conversion-plan.json and work/run-conversion.mjs."
  ].join("\n") + "\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.planPath) throw new Error("--plan is required");
  const plan = JSON.parse(fs.readFileSync(path.resolve(options.planPath), "utf8"));
  const result = createConversionJob({ runDirectory: options.runDirectory, plan });
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
