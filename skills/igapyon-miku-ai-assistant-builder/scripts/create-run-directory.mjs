#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function requireValidDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("now must be a valid Date");
  }
}

export function formatLocalRunId(date) {
  requireValidDate(date);
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    "-",
    pad2(date.getHours()),
    pad2(date.getMinutes())
  ].join("");
}

function formatLocalCreatedAt(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad2(Math.floor(absoluteOffset / 60))}:${pad2(absoluteOffset % 60)}`;
  return `${formatLocalRunId(date).replace("-", "T").replace(/(\d{2})(\d{2})$/, "$1:$2")}:${pad2(date.getSeconds())}${offset}`;
}

export function createRunDirectory({ baseDirectory, now = new Date() }) {
  if (typeof baseDirectory !== "string" || baseDirectory.trim() === "") {
    throw new TypeError("baseDirectory must be a non-empty string");
  }
  requireValidDate(now);

  const outputRoot = path.resolve(baseDirectory, "miku-ai-assistant-builder");
  fs.mkdirSync(outputRoot, { recursive: true });

  const baseRunId = formatLocalRunId(now);
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const runId = sequence === 1 ? baseRunId : `${baseRunId}-${String(sequence).padStart(2, "0")}`;
    const outputDirectory = path.join(outputRoot, runId);
    try {
      fs.mkdirSync(outputDirectory);
      return {
        runId,
        outputDirectory,
        createdAt: formatLocalCreatedAt(now),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "system-local"
      };
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }

  throw new Error(`no available run directory for ${baseRunId}`);
}

function parseArgs(argv) {
  let baseDirectory;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-directory") {
      baseDirectory = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--help") {
      return { help: true };
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return { baseDirectory, help: false };
}

function printHelp() {
  process.stdout.write("Usage: create-run-directory.mjs --base-directory <directory>\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = createRunDirectory({ baseDirectory: options.baseDirectory });
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
