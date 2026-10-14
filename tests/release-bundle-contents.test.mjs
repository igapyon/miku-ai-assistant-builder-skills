import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();
const repoName = "miku-ai-assistant-builder-skills";
const skillName = "igapyon-miku-ai-assistant-builder";
const packageJson = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
const zipPath = path.resolve(ROOT, `bundle/igapyon-${repoName}-${packageJson.version}.zip`);

function listInstallableFiles(directory, relativeRoot = "") {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store" &&
      (relativeRoot !== "" || !["tmp", "output", "state"].includes(entry.name)))
    .flatMap((entry) => {
      const relative = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
      const absolute = path.resolve(directory, entry.name);
      return entry.isDirectory() ? listInstallableFiles(absolute, relative) : [relative];
    }).sort();
}

function verifyRelease({ sourceSkillRoot, bundleSkillRoot, archive }) {
  const expected = listInstallableFiles(sourceSkillRoot);
  assert.equal(expected.includes("index.json"), false, "this skill has not adopted a root inventory");
  assert.deepEqual(listInstallableFiles(bundleSkillRoot), expected,
    "bundle file set differs from the source skill");
  const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
    .trim().split(/\n/).filter(Boolean).filter((entry) => !entry.endsWith("/")).sort();
  assert.deepEqual(entries, expected.map((relative) => `skills/${skillName}/${relative}`).sort(),
    "ZIP file set differs from the source skill");
  const checksum = fs.readFileSync(archive + ".sha256", "utf8").trim().split(/\s+/)[0];
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex"), checksum);
}

test("release ZIP and bundle contain the source skill's installable files", () => {
  verifyRelease({
    sourceSkillRoot: path.resolve(ROOT, "skills", skillName),
    bundleSkillRoot: path.resolve(ROOT, "bundle", repoName, "skills", skillName),
    archive: zipPath
  });
});

function fixture(context, { omitFromBundle = false, omitFromZip = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${repoName}-contents-`));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceSkillRoot = path.join(root, "source");
  const bundleRoot = path.join(root, "bundle");
  const bundleSkillRoot = path.join(bundleRoot, "skills", skillName);
  fs.mkdirSync(path.join(sourceSkillRoot, "references"), { recursive: true });
  fs.writeFileSync(path.join(sourceSkillRoot, "SKILL.md"), "---\nname: " + skillName + "\n---\n");
  fs.writeFileSync(path.join(sourceSkillRoot, "references", "required.md"), "# Required workflow\n");
  fs.mkdirSync(path.dirname(bundleSkillRoot), { recursive: true });
  fs.cpSync(sourceSkillRoot, bundleSkillRoot, { recursive: true });
  if (omitFromBundle) fs.rmSync(path.join(bundleSkillRoot, "references", "required.md"));
  const archive = path.join(root, "fixture.zip");
  const zipFiles = omitFromZip ? [`skills/${skillName}/SKILL.md`] : ["skills"];
  execFileSync("zip", ["-qr", archive, ...zipFiles], { cwd: bundleRoot });
  const hash = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  fs.writeFileSync(archive + ".sha256", hash + "\n");
  return { sourceSkillRoot, bundleSkillRoot, archive };
}

test("a reference omitted from both bundle and ZIP is rejected", (context) => {
  const material = fixture(context, { omitFromBundle: true });
  assert.throws(() => verifyRelease(material), /bundle file set differs from the source skill/);
});

test("a reference omitted only from the ZIP is rejected", (context) => {
  const material = fixture(context, { omitFromZip: true });
  assert.throws(() => verifyRelease(material), /ZIP file set differs from the source skill/);
});

test("an intact index-free fixture passes verification", (context) => {
  verifyRelease(fixture(context));
});
