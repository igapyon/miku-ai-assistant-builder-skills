#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

// markdown.js
const EXTENSION_LANGUAGES = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    mjs: "js",
    cjs: "js",
    java: "java",
    cs: "csharp",
    md: "md",
    json: "json",
};
function fenceFor(content) {
    const matches = content.match(/~{3,}/g) ?? [];
    const longest = matches.reduce((max, item) => Math.max(max, item.length), 2);
    return "~".repeat(longest + 1);
}
function languageFor(extension) {
    return EXTENSION_LANGUAGES[extension] ?? "";
}
function markdown(lines) {
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
function frontMatter(role, metadata = {}, extra = []) {
    return [
        "---",
        `tool: ${metadata.toolName ?? "miku-text-bundle"}`,
        `version: ${metadata.toolVersion ?? "unknown"}`,
        `role: ${role}`,
        ...extra,
        "---",
        "",
    ];
}
function table(headers, alignments, rows) {
    return [
        `| ${headers.join(" | ")} |`,
        `| ${alignments.join(" | ")} |`,
        ...rows.map((row) => `| ${row.join(" | ")} |`),
        "",
    ];
}
function code(value) {
    return `\`${value}\``;
}
function warningList(warnings) {
    if (warnings.length === 0) {
        return ["- None", ""];
    }
    return warnings.map((warning) => `- ${warning}`).concat("");
}
function markerTable(markers) {
    if (markers.length === 0) {
        return "- None\n";
    }
    return table(["File", "Line", "Kind", "Text"], ["---", "---:", "---", "---"], markers.map((marker) => [code(marker.relativePath), String(marker.line), marker.kind, escapeTable(marker.text)])).join("\n");
}
function escapeTable(value) {
    return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
function buildChunkMarkdown(chunk) {
    const lines = [
        `### ${chunk.relativePath}`,
        "",
        `- Characters: ${chunk.content.length}`,
        `- Source characters: ${chunk.originalCharCount}`,
        `- Source lines: ${chunk.originalLineCount}`,
    ];
    if (chunk.splitReason) {
        lines.push(`- Warning: ${chunk.splitReason}`);
        lines.push(`- Split: ${chunk.chunkIndex} / ${chunk.chunkCount}`);
    }
    lines.push("");
    if (chunk.splitReason) {
        lines.push(`This file exceeded the size limit and was split. Source file: \`${chunk.relativePath}\`. Split: ${chunk.chunkIndex} / ${chunk.chunkCount}.`);
        lines.push("");
    }
    const fence = fenceFor(chunk.content);
    const language = languageFor(chunk.extension);
    lines.push(`${fence}${language}`);
    lines.push(chunk.content);
    lines.push(fence);
    lines.push("");
    return lines;
}
function partsTable(parts) {
    return table(["Part", "Chunks", "Approx chars", "Files"], ["---", "---:", "---:", "---"], parts.map((part) => [
        code(part.fileName),
        String(part.chunks.length),
        String(part.charCount),
        part.chunks.map((chunk) => code(chunk.relativePath)).join("<br>"),
    ]));
}
function skippedFilesTable(skippedFiles) {
    if (skippedFiles.length === 0) {
        return ["- None", ""];
    }
    return table(["File", "Reason"], ["---", "---"], skippedFiles.map((file) => [code(file.relativePath), escapeTable(file.reason)]));
}
function agentSkillPaths(collectedFiles) {
    return collectedFiles
        .map((file) => file.relativePath)
        .filter((relativePath) => relativePath === "SKILL.md" || /^skills\/[^/]+\/SKILL\.md$/.test(relativePath));
}
function agentSkillHandoffSection(skillPaths, terminalFileName = "the final part file") {
    if (skillPaths.length === 0) {
        return [];
    }
    return [
        "## Agent Skill Handoff",
        "",
        "This Text Bundle includes Agent Skill definitions.",
        "",
        "Read the following `SKILL.md` files as the primary Agent Skill instructions and keep them available for reference in this conversation.",
        "",
        ...skillPaths.map((skillPath) => `- ${code(skillPath)}`),
        "",
        `After receiving ${code(terminalFileName)}, the Text Bundle loading is complete. If the user asks to use this Agent Skill or the target product, prioritize the relevant \`SKILL.md\` activation rules, operating rules, workflow, and references, and work from the related files in this bundle.`,
        "",
        "If higher-priority system, developer, or user instructions apply, follow those instructions first.",
        "",
    ];
}
function buildPartMarkdown(part, metadata = {}, options = {}) {
    const extraFrontMatter = [`part: ${part.partNumber}`];
    if (options.prompt) {
        extraFrontMatter.push("prompt: true");
    }
    if (options.index) {
        extraFrontMatter.push("terminal: true");
    }
    const lines = [
        ...frontMatter("part", metadata, extraFrontMatter),
        ...(options.prompt ? buildPromptMarkdownLines(options.prompt, false) : []),
        `# Text Bundle Part ${String(part.partNumber).padStart(3, "0")}`,
        "",
        `- Part file: \`${part.fileName}\``,
        `- Files/chunks: ${part.chunks.length}`,
        `- Approx chars: ${part.charCount}`,
        "",
    ];
    for (const [index, chunk] of part.chunks.entries()) {
        if (index > 0) {
            lines.push("---");
            lines.push("");
        }
        lines.push(...buildChunkMarkdown(chunk));
    }
    if (options.index) {
        lines.push(...buildIndexMarkdownLines(options.index, false));
    }
    if (options.acknowledgeOnly) {
        lines.push(...buildAcknowledgementFooterLines());
    }
    return markdown(lines);
}
function buildAcknowledgementFooterLines() {
    return [
        "## Acknowledgement",
        "",
        "After reading this Part, do not analyze or summarize the content yet. Reply only with `OK`.",
        "",
    ];
}
function buildIndexMarkdownLines(params, includeFrontMatter) {
    const { inputDirectory, outputDirectory, parts, collectedFiles, skippedFiles, markers, warnings, toolName, toolVersion } = params;
    const terminalFileName = params.terminalFileName ?? "the final part file";
    const skillPaths = agentSkillPaths(collectedFiles);
    return [
        ...(includeFrontMatter ? frontMatter("index", { toolName, toolVersion }, ["terminal: true"]) : []),
        "# Text Bundle Index",
        "",
        "## Summary",
        "",
        `- Input directory: \`${inputDirectory}\``,
        `- Output directory: \`${outputDirectory}\``,
        `- Collected files: ${collectedFiles.length}`,
        `- Skipped files: ${skippedFiles.length}`,
        `- Parts: ${parts.length}`,
        "",
        ...agentSkillHandoffSection(skillPaths, terminalFileName),
        "## Parts",
        "",
        ...partsTable(parts),
        "## Skipped Files",
        "",
        ...skippedFilesTable(skippedFiles),
        "## Warnings",
        "",
        ...warningList(warnings),
        "## Markers",
        "",
        markerTable(markers),
    ];
}
function buildIndexMarkdown(params) {
    return markdown(buildIndexMarkdownLines(params, true));
}
function normalizePromptMarkdownParams(params) {
    if (Array.isArray(params)) {
        return {
            promptFileName: params[0] ?? "text-bundle-001.md",
            partFileNames: params,
            indexFileName: params.at(-1) ?? params[0] ?? "text-bundle-001.md",
        };
    }
    return params;
}
function buildPromptMarkdownLines(params, includeFrontMatter) {
    const { promptFileName, partFileNames, indexFileName, toolName, toolVersion } = normalizePromptMarkdownParams(params);
    const readingOrderFileNames = [
        ...(partFileNames[0] === promptFileName ? [] : [promptFileName]),
        ...partFileNames,
        ...(partFileNames.at(-1) === indexFileName ? [] : [indexFileName]),
    ];
    return [
        ...(includeFrontMatter ? frontMatter("prompt", { toolName, toolVersion }) : []),
        "# Text Bundle Prompt",
        "",
        "This is the reading instruction for a Text Bundle that packages a set of files for handoff to generative AI or similar tools.",
        "",
        "The Markdown bundle will be sent in multiple messages in the order listed below.",
        "",
        "After each non-terminal Part, do not analyze or summarize the content yet. Reply only with `OK`.",
        "",
        `Do not start the final response until you receive \`${indexFileName}\`.`,
        "",
        "## Reading Order",
        "",
        ...readingOrderFileNames.map((fileName, index) => `${index + 1}. \`${fileName}\``),
        "",
        "## Response File",
        "",
        `If you save the final response after \`${indexFileName}\`, \`text-bundle-response.md\` is the recommended filename.`,
        "",
        "## Output Format",
        "",
        "Output the final response as Markdown text.",
        "",
        "Wrap the entire final Markdown response in a single outer fence using `~~~~`. Use tildes for the outer fence because the Markdown response may contain backtick code fences.",
        "",
    ];
}
function buildPromptMarkdown(params) {
    return buildPromptMarkdownLines(normalizePromptMarkdownParams(params), true).join("\n");
}
function buildKnowledgeSourceMarkdown(part) {
    const lines = [`# Knowledge Source ${String(part.partNumber).padStart(3, "0")}`, ""];
    for (const [index, chunk] of part.chunks.entries()) {
        if (index > 0) {
            lines.push("---", "");
        }
        lines.push(`## Source: ${chunk.relativePath}`, "", `- Source path: ${code(chunk.relativePath)}`);
        if (chunk.chunkCount > 1) {
            lines.push(`- Source chunk: ${chunk.chunkIndex} / ${chunk.chunkCount}`);
            lines.push(`- Source lines: ${chunk.sourceStartLine ?? 0}-${chunk.sourceEndLine ?? 0}`);
        }
        lines.push("");
        if (chunk.extension === "md") {
            lines.push(chunk.content, "");
        }
        else {
            const fence = fenceFor(chunk.content);
            lines.push(`${fence}${languageFor(chunk.extension)}`, chunk.content, fence, "");
        }
    }
    return `${lines.join("\n")}\n`;
}
function buildKnowledgeIndexMarkdown(params) {
    const generatedRows = [
        ...params.parts.map((part) => [code(part.fileName), "knowledge-source", String(part.chunks.length), String(part.charCount)]),
        [code(params.managementIndexFileName), "management-index", "-", "-"],
    ];
    const mappingRows = params.parts.flatMap((part) => part.chunks.map((chunk) => [
        code(chunk.relativePath),
        code(part.fileName),
        `${chunk.chunkIndex} / ${chunk.chunkCount}`,
        `${chunk.sourceStartLine ?? 0}-${chunk.sourceEndLine ?? 0}`,
        `${chunk.sourceStartChar ?? 0}-${chunk.sourceEndChar ?? chunk.content.length}`,
        String(chunk.originalCharCount),
        String(chunk.content.length),
    ]));
    const staleLines = params.staleOutputCandidates.length === 0
        ? ["- None", ""]
        : params.staleOutputCandidates.map((path) => `- ${code(path)}`).concat("");
    return markdown([
        "# Knowledge Bundle Index", "",
        "## Configuration", "",
        ...table(["Option", "Effective value"], ["---", "---"], params.configuration.map(([key, value]) => [code(key), escapeTable(value)])),
        "## Summary", "",
        `- Collected files: ${params.collectedFiles.length}`,
        `- Skipped files: ${params.skippedFiles.length}`,
        `- Knowledge files: ${params.parts.length}`, "",
        "## Generated Files", "",
        ...table(["File", "Role", "Chunks", "Approx chars"], ["---", "---", "---:", "---:"], generatedRows),
        "## Source Mapping", "",
        ...table(["Source", "Generated file", "Chunk", "Source lines", "UTF-16 chars", "Source chars", "Chunk chars"], ["---", "---", "---:", "---:", "---:", "---:", "---:"], mappingRows),
        "## Skipped Files", "", ...skippedFilesTable(params.skippedFiles),
        "## Warnings", "", ...warningList(params.warnings),
        "## Markers", "", markerTable(params.markers),
        "## Stale Output Candidates", "", ...staleLines,
    ]);
}

// match.js
function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
function globToRegex(pattern) {
    const normalized = normalizePattern(pattern);
    let source = "";
    for (let i = 0; i < normalized.length; i += 1) {
        const char = normalized[i];
        const next = normalized[i + 1];
        const afterNext = normalized[i + 2];
        if (char === "*" && next === "*" && afterNext === "/") {
            source += "(?:.*/)?";
            i += 2;
            continue;
        }
        if (char === "*" && next === "*") {
            source += ".*";
            i += 1;
            continue;
        }
        if (char === "*") {
            source += "[^/]*";
            continue;
        }
        source += escapeRegex(char);
    }
    return new RegExp(`^${source}$`);
}
function matchesAnyPattern(relativePath, patterns) {
    const normalizedPath = normalizePattern(relativePath);
    return patterns.some((pattern) => {
        const normalizedPattern = normalizePattern(pattern);
        if (!normalizedPattern.includes("*")) {
            return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern.replace(/\/$/, "")}/`);
        }
        return globToRegex(normalizedPattern).test(normalizedPath);
    });
}
function parseGitignore(content) {
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"));
}
function matchesBasenamePattern(normalizedPath, cleanPattern, rootAnchored, directoryOnly) {
    const segments = normalizedPath.split("/");
    if (directoryOnly) {
        if (rootAnchored) {
            return segments[0] === cleanPattern;
        }
        return segments.slice(0, -1).includes(cleanPattern);
    }
    if (cleanPattern.includes("*")) {
        const regex = globToRegex(cleanPattern);
        return segments.some((segment) => regex.test(segment));
    }
    if (rootAnchored) {
        return normalizedPath === cleanPattern;
    }
    return segments.includes(cleanPattern) || normalizedPath.endsWith(`/${cleanPattern}`);
}
function matchesPathPattern(normalizedPath, cleanPattern, rootAnchored, directoryOnly) {
    if (directoryOnly) {
        if (rootAnchored) {
            return normalizedPath === cleanPattern || normalizedPath.startsWith(`${cleanPattern}/`);
        }
        return normalizedPath === cleanPattern || normalizedPath.includes(`/${cleanPattern}/`) || normalizedPath.startsWith(`${cleanPattern}/`);
    }
    if (cleanPattern.includes("*")) {
        const regex = globToRegex(cleanPattern);
        if (rootAnchored) {
            return regex.test(normalizedPath);
        }
        return regex.test(normalizedPath) || globToRegex(`**/${cleanPattern}`).test(normalizedPath);
    }
    if (rootAnchored) {
        return normalizedPath === cleanPattern || normalizedPath.startsWith(`${cleanPattern}/`);
    }
    return normalizedPath === cleanPattern || normalizedPath.endsWith(`/${cleanPattern}`) || normalizedPath.startsWith(`${cleanPattern}/`);
}
function matchesGitignore(relativePath, patterns) {
    const normalizedPath = normalizePattern(relativePath);
    return patterns.some((pattern) => {
        const rootAnchored = pattern.trim().startsWith("/");
        const normalizedPattern = normalizePattern(pattern.replace(/^\//, ""));
        const directoryOnly = normalizedPattern.endsWith("/");
        const cleanPattern = normalizedPattern.replace(/\/$/, "");
        if (cleanPattern.length === 0) {
            return false;
        }
        if (!cleanPattern.includes("/")) {
            return matchesBasenamePattern(normalizedPath, cleanPattern, rootAnchored, directoryOnly);
        }
        return matchesPathPattern(normalizedPath, cleanPattern, rootAnchored, directoryOnly);
    });
}

// path-utils.js
function toPosixPath(pathValue) {
    return pathValue.split(sep).join("/");
}
function getExtension(pathValue) {
    return extname(pathValue).toLowerCase().replace(/^\./, "");
}
function normalizePattern(pattern) {
    return toPosixPath(pattern.trim()).replace(/^\.\//, "");
}
function compareUtf16CodeUnits(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}

// cli.js
const CLI_DEFAULT_MAX_CHARS = 120000;
const CLI_DEFAULT_MAX_INPUT_FILE_BYTES = 1_000_000;
const CLI_DEFAULT_FILENAME_PREFIX = "text-bundle";
const CLI_DEFAULT_KNOWLEDGE_FILENAME_PREFIX = "knowledge";
const CLI_VERSION = "1.5.1";
const SUPPORTED_ENCODINGS = new Set(["utf-8", "shift_jis"]);
const DEFAULT_EXCLUDE_EXTENSIONS = [
    ".7z",
    ".aac",
    ".avi",
    ".bmp",
    ".bz2",
    ".class",
    ".db",
    ".dll",
    ".doc",
    ".docx",
    ".dylib",
    ".exe",
    ".flac",
    ".gif",
    ".gz",
    ".ico",
    ".jar",
    ".jpeg",
    ".jpg",
    ".m4a",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".ogg",
    ".otf",
    ".parquet",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".rar",
    ".so",
    ".sqlite",
    ".svgz",
    ".tar",
    ".tgz",
    ".tiff",
    ".ttf",
    ".war",
    ".wav",
    ".webm",
    ".webp",
    ".woff",
    ".woff2",
    ".xls",
    ".xlsx",
    ".xz",
    ".zip",
];
const DEFAULT_EXCLUDE_DIRECTORIES = [
    ".git",
    ".codex",
    ".vscode",
    ".idea",
    "node_modules",
    "dist",
    "build",
    "target",
    "coverage",
    "workplace",
    "tmp",
    "temp",
];
class HelpRequestedError extends Error {
    constructor() {
        super("Help requested.");
        this.name = "HelpRequestedError";
    }
}
class VersionRequestedError extends Error {
    constructor() {
        super("Version requested.");
        this.name = "VersionRequestedError";
    }
}
function readRequiredOptionValue(argv, index, optionName) {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
        throw new Error(`Please specify a value for ${optionName}.`);
    }
    return value;
}
function parsePatternList(value) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}
function parsePositiveInteger(value, optionName) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${optionName} must be a positive integer.`);
    }
    return parsed;
}
function parseFilenamePrefix(value) {
    const prefix = value.trim();
    if (prefix.length === 0) {
        throw new Error("--filename-prefix must not be empty.");
    }
    if (!/^[A-Za-z0-9._-]+$/.test(prefix)) {
        throw new Error("--filename-prefix must contain only ASCII letters, digits, dots, underscores, and hyphens.");
    }
    return prefix;
}
function parseSupportedEncoding(value, optionName) {
    if (SUPPORTED_ENCODINGS.has(value)) {
        return value;
    }
    throw new Error(`${optionName} must be one of: utf-8, shift_jis.`);
}
function parseExtensionList(value, optionName) {
    return parsePatternList(value).map((item) => {
        const extension = item.toLowerCase();
        if (extension.length <= 1 || !extension.startsWith(".") || extension.includes("/") || extension.includes("\\")) {
            throw new Error(`${optionName} values must be extensions with a leading dot.`);
        }
        return extension;
    });
}
function parseDirectoryList(value, optionName) {
    return parsePatternList(value).map((item) => {
        const directory = normalizePattern(item).replace(/\/+$/, "");
        if (directory.length === 0 || directory === ".") {
            throw new Error(`${optionName} values must be relative directory names or paths.`);
        }
        return directory;
    });
}
function parseEncodingExtensions(value) {
    const extensions = {};
    for (const item of parsePatternList(value)) {
        const separatorIndex = item.indexOf("=");
        if (separatorIndex <= 0 || separatorIndex === item.length - 1) {
            throw new Error("--encoding-extension entries must use .ext=encoding format.");
        }
        const extension = item.slice(0, separatorIndex).trim();
        const encoding = item.slice(separatorIndex + 1).trim();
        if (!extension.startsWith(".") || extension.includes("/") || extension.includes("\\")) {
            throw new Error("--encoding-extension keys must be exact extensions with a leading dot.");
        }
        extensions[extension] = parseSupportedEncoding(encoding, "--encoding-extension");
    }
    return extensions;
}
function createParseState() {
    return {
        filenamePrefix: CLI_DEFAULT_FILENAME_PREFIX,
        filenamePrefixExplicit: false,
        mode: "handoff",
        maxChars: CLI_DEFAULT_MAX_CHARS,
        maxInputFileBytes: CLI_DEFAULT_MAX_INPUT_FILE_BYTES,
        encoding: {
            default: "utf-8",
            extensions: {},
        },
        excludeExtensions: new Set(DEFAULT_EXCLUDE_EXTENSIONS),
        excludeDirectories: new Set(DEFAULT_EXCLUDE_DIRECTORIES),
        verbose: false,
        dryRun: false,
    };
}
function consumeOption(argv, index, state) {
    const arg = argv[index];
    if (arg === "--help") {
        throw new HelpRequestedError();
    }
    if (arg === "--version") {
        throw new VersionRequestedError();
    }
    if (arg === "--input") {
        state.inputDirectory = readRequiredOptionValue(argv, index, "--input");
        return index + 1;
    }
    if (arg === "--output") {
        state.outputDirectory = readRequiredOptionValue(argv, index, "--output");
        return index + 1;
    }
    if (arg === "--filename-prefix") {
        state.filenamePrefix = parseFilenamePrefix(readRequiredOptionValue(argv, index, "--filename-prefix"));
        state.filenamePrefixExplicit = true;
        return index + 1;
    }
    if (arg === "--mode") {
        const mode = readRequiredOptionValue(argv, index, "--mode");
        if (mode !== "handoff" && mode !== "knowledge-source") {
            throw new Error("--mode must be one of: handoff, knowledge-source.");
        }
        state.mode = mode;
        return index + 1;
    }
    if (arg === "--max-chars") {
        state.maxChars = parsePositiveInteger(readRequiredOptionValue(argv, index, "--max-chars"), "--max-chars");
        return index + 1;
    }
    if (arg === "--max-input-file-bytes") {
        state.maxInputFileBytes = parsePositiveInteger(readRequiredOptionValue(argv, index, "--max-input-file-bytes"), "--max-input-file-bytes");
        return index + 1;
    }
    if (arg === "--encoding") {
        state.encoding.default = parseSupportedEncoding(readRequiredOptionValue(argv, index, "--encoding"), "--encoding");
        return index + 1;
    }
    if (arg === "--encoding-extension") {
        state.encoding.extensions = {
            ...state.encoding.extensions,
            ...parseEncodingExtensions(readRequiredOptionValue(argv, index, "--encoding-extension")),
        };
        return index + 1;
    }
    if (arg === "--add-exclude-extension") {
        for (const extension of parseExtensionList(readRequiredOptionValue(argv, index, "--add-exclude-extension"), "--add-exclude-extension")) {
            state.excludeExtensions.add(extension);
        }
        return index + 1;
    }
    if (arg === "--remove-exclude-extension") {
        for (const extension of parseExtensionList(readRequiredOptionValue(argv, index, "--remove-exclude-extension"), "--remove-exclude-extension")) {
            state.excludeExtensions.delete(extension);
        }
        return index + 1;
    }
    if (arg === "--add-exclude-directory") {
        for (const directory of parseDirectoryList(readRequiredOptionValue(argv, index, "--add-exclude-directory"), "--add-exclude-directory")) {
            state.excludeDirectories.add(directory);
        }
        return index + 1;
    }
    if (arg === "--remove-exclude-directory") {
        for (const directory of parseDirectoryList(readRequiredOptionValue(argv, index, "--remove-exclude-directory"), "--remove-exclude-directory")) {
            state.excludeDirectories.delete(directory);
        }
        return index + 1;
    }
    if (arg === "--verbose") {
        state.verbose = true;
        return index;
    }
    if (arg === "--dry-run") {
        state.dryRun = true;
        return index;
    }
    if (arg.startsWith("-")) {
        throw new Error(`Unknown argument: ${arg}`);
    }
    throw new Error(`Positional arguments are not supported. Use --input and --output: ${arg}`);
}
function validateRequiredDirectories(state) {
    if (!state.inputDirectory) {
        throw new Error("Please specify --input.");
    }
    if (!state.outputDirectory) {
        throw new Error("Please specify --output.");
    }
}
function parseArgs(argv) {
    const state = createParseState();
    for (let i = 0; i < argv.length; i += 1) {
        i = consumeOption(argv, i, state);
    }
    validateRequiredDirectories(state);
    const inputDirectory = state.inputDirectory;
    const outputDirectory = state.outputDirectory;
    if (!inputDirectory || !outputDirectory) {
        throw new Error("Please specify --input and --output.");
    }
    return {
        inputDirectory,
        outputDirectory,
        filenamePrefix: state.filenamePrefixExplicit
            ? state.filenamePrefix
            : state.mode === "knowledge-source"
                ? CLI_DEFAULT_KNOWLEDGE_FILENAME_PREFIX
                : CLI_DEFAULT_FILENAME_PREFIX,
        mode: state.mode,
        maxChars: state.maxChars,
        maxInputFileBytes: state.maxInputFileBytes,
        encoding: state.encoding,
        excludeExtensions: [...state.excludeExtensions].sort(compareUtf16CodeUnits),
        excludeDirectories: [...state.excludeDirectories].sort(compareUtf16CodeUnits),
        verbose: state.verbose,
        dryRun: state.dryRun,
    };
}
function printHelp() {
    console.log(`Usage:
  miku-text-bundle --input <dir> --output <dir> [options]
  miku-text-bundle --help
  miku-text-bundle --version

Description:
  Scan local text-like files under --input and generate split Markdown files
  for AI handoff or neutral Knowledge source preparation. No network is used.

Default behavior:
  Required: --input <dir>, --output <dir>
  Defaults: --mode handoff, --filename-prefix text-bundle for handoff or
  knowledge for knowledge-source, --max-chars 120000,
  --max-input-file-bytes 1000000, --encoding utf-8.
  Input paths are ordered by POSIX relative path using UTF-16 code units.

Inputs:
  Reads regular files under --input. Skips known binary extensions, default
  excluded directories such as .git, node_modules, dist, coverage, target,
  workplace, and files ignored by the input root .gitignore. The .gitignore
  matcher is simplified: nested .gitignore files and negation patterns are
  not supported.

Generated artifacts:
  handoff:          <prefix>-001.md ... <prefix>-999.md
  knowledge-source: <prefix>-001.md ... <prefix>-999.md, <prefix>-index.md
  These files are generated artifacts and may be regenerated.
  The first part includes the prompt instructions.
  The final part includes the terminal index.
  These two embedded sections apply only to handoff mode.
  Knowledge source diagnostics are kept in the separate management index.

Output and overwrite behavior:
  Creates --output when missing. Existing generated files with the same names
  are overwritten. Terminal stdout is progress/completion text, not a stable
  machine-readable API. The Markdown files are the stable artifacts.

Diagnostics and exit codes:
  Skipped readable-candidate files and split warnings are recorded in
  the final part index. Invalid usage or processing errors are printed to
  stderr. Knowledge diagnostics use the management index.
  Exit code 0 means success/help/version; exit code 1 means failure.

Options:
  --mode handoff|knowledge-source  Output mode. Default: handoff.
  --filename-prefix <prefix>       File basename prefix. Allowed: A-Z a-z 0-9 . _ -
  --max-chars <number>             Max approximate source-content chars per part.
  --max-input-file-bytes <number>  Max bytes read from one input file.
  --encoding utf-8|shift_jis       Default input file encoding.
  --encoding-extension ".java=shift_jis"
  --add-exclude-extension ".ext"
  --remove-exclude-extension ".ext"
  --add-exclude-directory "dir"
  --remove-exclude-directory "dir"
  --verbose                        Print ignored-file count details.
  --dry-run                        Estimate collection and parts without writing files.

Example:
  miku-text-bundle --input . --output out --filename-prefix my-repo-text-bundle
  miku-text-bundle --input . --output out --mode knowledge-source
`);
}
function printVersion() {
    console.log(CLI_VERSION);
}

// discovery.js
function relativeDiscoveryPath(inputPath, filePath) {
    return toPosixPath(relative(inputPath, filePath));
}
function createIgnoreStats() {
    return {
        directories: 0,
        files: 0,
        byDirectory: 0,
        byExtension: 0,
        byGitignore: 0,
        byOutputDirectory: 0,
    };
}
function addIgnoredFiles(ignored, count, reason) {
    ignored.files += count;
    ignored[reason] += count;
}
function getEffectiveExcludeExtensions(options) {
    return new Set((options.excludeExtensions ?? DEFAULT_EXCLUDE_EXTENSIONS).map((extension) => extension.toLowerCase()));
}
function getEffectiveExcludeDirectories(options) {
    return new Set(options.excludeDirectories ?? DEFAULT_EXCLUDE_DIRECTORIES);
}
function isExcludedDirectory(relativePath, excludeDirectories) {
    const normalizedPath = toPosixPath(relativePath).replace(/\/+$/, "");
    const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
    for (const excludedDirectory of excludeDirectories) {
        if (excludedDirectory.includes("/")) {
            if (normalizedPath === excludedDirectory || normalizedPath.startsWith(`${excludedDirectory}/`)) {
                return true;
            }
            continue;
        }
        if (segments.includes(excludedDirectory)) {
            return true;
        }
    }
    return false;
}
function hasExcludedExtension(filePath, excludeExtensions) {
    const extension = extname(filePath).toLowerCase();
    return extension.length > 0 && excludeExtensions.has(extension);
}
function isOutputPathInsideInput(inputPath, outputPath) {
    const outputRelativePath = relativeDiscoveryPath(inputPath, outputPath);
    return !outputRelativePath.startsWith("../") && outputRelativePath !== ".." && outputRelativePath !== "";
}
function isInsideOutputDirectory(inputPath, filePath, outputPath) {
    if (!isOutputPathInsideInput(inputPath, outputPath)) {
        return false;
    }
    const outputRelativePath = relativeDiscoveryPath(inputPath, outputPath);
    const fileRelativePath = relativeDiscoveryPath(inputPath, filePath);
    return fileRelativePath === outputRelativePath || fileRelativePath.startsWith(`${outputRelativePath}/`);
}
function countDirectoryTree(startPath) {
    let directories = 1;
    let files = 0;
    for (const entry of readdirSync(startPath, { withFileTypes: true })) {
        const fullPath = join(startPath, entry.name);
        if (entry.isDirectory()) {
            const childCounts = countDirectoryTree(fullPath);
            directories += childCounts.directories;
            files += childCounts.files;
            continue;
        }
        if (entry.isFile()) {
            files += 1;
        }
    }
    return { directories, files };
}
function ignoreDirectory(fullPath, ignored, reason) {
    const counts = countDirectoryTree(fullPath);
    ignored.directories += counts.directories;
    addIgnoredFiles(ignored, counts.files, reason);
}
function listFilesRecursively(rootPath, startPath, outputPath, excludeDirectories, ignored) {
    const files = [];
    const entries = readdirSync(startPath, { withFileTypes: true }).sort((a, b) => compareUtf16CodeUnits(a.name, b.name));
    for (const entry of entries) {
        const fullPath = join(startPath, entry.name);
        const relativePath = relativeDiscoveryPath(rootPath, fullPath);
        if (entry.isDirectory()) {
            if (isInsideOutputDirectory(rootPath, fullPath, outputPath)) {
                ignoreDirectory(fullPath, ignored, "byOutputDirectory");
                continue;
            }
            if (isExcludedDirectory(relativePath, excludeDirectories)) {
                ignoreDirectory(fullPath, ignored, "byDirectory");
                continue;
            }
            files.push(...listFilesRecursively(rootPath, fullPath, outputPath, excludeDirectories, ignored));
            continue;
        }
        if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}
function shouldCollectCandidate(inputPath, outputPath, filePath, gitignorePatterns, excludeExtensions, ignored) {
    const relativePath = relativeDiscoveryPath(inputPath, filePath);
    if (isInsideOutputDirectory(inputPath, filePath, outputPath)) {
        addIgnoredFiles(ignored, 1, "byOutputDirectory");
        return false;
    }
    if (hasExcludedExtension(filePath, excludeExtensions)) {
        addIgnoredFiles(ignored, 1, "byExtension");
        return false;
    }
    if (matchesGitignore(relativePath, gitignorePatterns)) {
        addIgnoredFiles(ignored, 1, "byGitignore");
        return false;
    }
    return true;
}
function discoverCandidateFiles(inputPath, outputPath, options, gitignorePatterns) {
    const excludeExtensions = getEffectiveExcludeExtensions(options);
    const excludeDirectories = getEffectiveExcludeDirectories(options);
    const ignored = createIgnoreStats();
    const candidates = listFilesRecursively(inputPath, inputPath, outputPath, excludeDirectories, ignored);
    return {
        files: candidates
            .filter((filePath) => shouldCollectCandidate(inputPath, outputPath, filePath, gitignorePatterns, excludeExtensions, ignored))
            .sort((a, b) => compareUtf16CodeUnits(relativeDiscoveryPath(inputPath, a), relativeDiscoveryPath(inputPath, b))),
        ignored,
    };
}

// bundler.js
const MAX_BUNDLE_PART_NUMBER = 999;
const DEFAULT_FILENAME_PREFIX = "text-bundle";
const DEFAULT_KNOWLEDGE_FILENAME_PREFIX = "knowledge";
const DEFAULT_MAX_INPUT_FILE_BYTES = 1_000_000;
const EMBEDDED_SECTION_RESERVE_MARGIN_CHARS = 256;
const EMBEDDED_SECTION_RESERVE_MARGIN_RATIO = 0.1;
const DEFAULT_ENCODING_OPTIONS = {
    default: "utf-8",
    extensions: {},
};
function normalizeFilenamePrefix(value) {
    const prefix = value.trim();
    if (prefix.length === 0) {
        throw new Error("filenamePrefix must not be empty.");
    }
    if (!/^[A-Za-z0-9._-]+$/.test(prefix)) {
        throw new Error("filenamePrefix must contain only ASCII letters, digits, dots, underscores, and hyphens.");
    }
    return prefix;
}
function chooseOutputDirectory(outputDirectory) {
    return resolve(outputDirectory);
}
function relativeInputPath(inputPath, filePath) {
    return toPosixPath(relative(inputPath, filePath));
}
function displayPathFromCurrentDirectory(pathValue) {
    const relativePath = relative(process.cwd(), pathValue);
    return relativePath.length === 0 ? "." : toPosixPath(relativePath);
}
function readRootGitignore(inputPath) {
    const gitignorePath = join(inputPath, ".gitignore");
    if (!statSync(gitignorePath, { throwIfNoEntry: false })?.isFile()) {
        return [];
    }
    return parseGitignore(readFileSync(gitignorePath, "utf8"));
}
function selectEncoding(relativePath, options) {
    const extension = extname(relativePath);
    const encoding = options.encoding ?? DEFAULT_ENCODING_OPTIONS;
    return encoding.extensions[extension] ?? encoding.default;
}
function decodeText(buffer, encoding) {
    if (buffer.includes(0)) {
        return undefined;
    }
    try {
        return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    }
    catch {
        return undefined;
    }
}
function formatEncoding(encoding) {
    return encoding === "utf-8" ? "UTF-8" : "Shift_JIS";
}
function extractMarkers(relativePath, content) {
    return content.split(/\r?\n/).flatMap((lineText, index) => {
        const match = lineText.match(/\b(TODO|FIXME|XXX)\b(?!\.)(.*)/);
        if (!match) {
            return [];
        }
        return [{
                relativePath,
                line: index + 1,
                kind: match[1],
                text: lineText.trim(),
            }];
    });
}
function skippedForOversizedFile(relativePath, maxInputFileBytes) {
    return {
        relativePath,
        reason: `File size exceeds the ${maxInputFileBytes} byte limit.`,
    };
}
function skippedForUnreadableFile(relativePath, encoding) {
    return {
        relativePath,
        reason: `Skipped because the file cannot be decoded as ${formatEncoding(encoding)} or was detected as binary.`,
    };
}
function createCollectedFile(filePath, relativePath, content) {
    return {
        absolutePath: filePath,
        relativePath,
        extension: getExtension(filePath),
        content,
        charCount: content.length,
        lineCount: content.length === 0 ? 0 : content.split(/\r?\n/).length,
        markers: extractMarkers(relativePath, content),
    };
}
function collectFiles(inputPath, outputPath, options, gitignorePatterns) {
    const files = [];
    const skipped = [];
    const maxInputFileBytes = options.maxInputFileBytes ?? DEFAULT_MAX_INPUT_FILE_BYTES;
    const discovered = discoverCandidateFiles(inputPath, outputPath, options, gitignorePatterns);
    for (const filePath of discovered.files) {
        const relativePath = relativeInputPath(inputPath, filePath);
        const fileStat = statSync(filePath);
        if (fileStat.size > maxInputFileBytes) {
            skipped.push(skippedForOversizedFile(relativePath, maxInputFileBytes));
            continue;
        }
        const buffer = readFileSync(filePath);
        const encoding = selectEncoding(relativePath, options);
        const content = decodeText(buffer, encoding);
        if (content === undefined) {
            skipped.push(skippedForUnreadableFile(relativePath, encoding));
            continue;
        }
        files.push(createCollectedFile(filePath, relativePath, content));
    }
    return { files, skipped, ignored: discovered.ignored };
}
function createSingleFileChunk(file) {
    return {
        relativePath: file.relativePath,
        extension: file.extension,
        content: file.content,
        originalCharCount: file.charCount,
        originalLineCount: file.lineCount,
        chunkIndex: 1,
        chunkCount: 1,
        sourceStartLine: file.lineCount === 0 ? 0 : 1,
        sourceEndLine: file.lineCount,
        sourceStartChar: 0,
        sourceEndChar: file.content.length,
    };
}
function sourceLineAtOffset(content, offset) {
    if (content.length === 0) {
        return 0;
    }
    const boundedOffset = Math.max(0, Math.min(offset, content.length - 1));
    return 1 + (content.slice(0, boundedOffset).match(/\n/g)?.length ?? 0);
}
function splitContentByMaxChars(content, maxChars) {
    const chunks = [];
    let current = "";
    for (const line of content.split(/(?<=\n)/)) {
        if (current.length > 0 && current.length + line.length > maxChars) {
            chunks.push(current);
            current = "";
        }
        if (line.length > maxChars) {
            if (current.length > 0) {
                chunks.push(current);
                current = "";
            }
            for (let i = 0; i < line.length; i += maxChars) {
                chunks.push(line.slice(i, i + maxChars));
            }
            continue;
        }
        current += line;
    }
    if (current.length > 0) {
        chunks.push(current);
    }
    return chunks;
}
function createSplitFileChunks(file, chunkContents) {
    const chunkCount = chunkContents.length;
    let sourceStartChar = 0;
    return chunkContents.map((content, index) => {
        const sourceEndChar = sourceStartChar + content.length;
        const chunk = {
            relativePath: file.relativePath,
            extension: file.extension,
            content,
            originalCharCount: file.charCount,
            originalLineCount: file.lineCount,
            chunkIndex: index + 1,
            chunkCount,
            sourceStartLine: sourceLineAtOffset(file.content, sourceStartChar),
            sourceEndLine: sourceLineAtOffset(file.content, Math.max(sourceStartChar, sourceEndChar - 1)),
            sourceStartChar,
            sourceEndChar,
            splitReason: "This file exceeded the size limit and was split.",
        };
        sourceStartChar = sourceEndChar;
        return chunk;
    });
}
function splitOversizedFile(file, maxChars) {
    if (file.content.length <= maxChars) {
        return [createSingleFileChunk(file)];
    }
    return createSplitFileChunks(file, splitContentByMaxChars(file.content, maxChars));
}
function bundlePromptFileName(filenamePrefix) {
    return `${filenamePrefix}-001.md`;
}
function bundlePartFileName(filenamePrefix, partNumber) {
    return `${filenamePrefix}-${String(partNumber).padStart(3, "0")}.md`;
}
function chunksCharCount(chunks) {
    return chunks.reduce((total, chunk) => total + chunk.content.length, 0);
}
function createBundlePart(filenamePrefix, partNumber, chunks, charCount = chunksCharCount(chunks)) {
    if (partNumber > MAX_BUNDLE_PART_NUMBER) {
        throw new Error(`Part count exceeds ${MAX_BUNDLE_PART_NUMBER}; only three-digit part file names are supported.`);
    }
    return {
        fileName: bundlePartFileName(filenamePrefix, partNumber),
        partNumber,
        chunks,
        charCount,
    };
}
function effectiveMaxChars(maxChars, reservedChars) {
    return Math.max(1, maxChars - reservedChars);
}
function shouldStartNewPart(currentChunks, currentChars, nextChunk, maxChars) {
    return currentChunks.length > 0 && currentChars + nextChunk.content.length > maxChars;
}
function warningForSplitFile(file, chunkCount) {
    return `\`${file.relativePath}\` exceeded --max-chars and was split into ${chunkCount} chunks.`;
}
function buildChunks(files, maxChars) {
    const warnings = [];
    const chunks = files.flatMap((file) => {
        const fileChunks = splitOversizedFile(file, maxChars);
        if (fileChunks.length > 1) {
            warnings.push(warningForSplitFile(file, fileChunks.length));
        }
        return fileChunks;
    });
    return { chunks, warnings };
}
function renumberParts(parts, filenamePrefix) {
    return parts.map((part, index) => createBundlePart(filenamePrefix, index + 1, part.chunks));
}
function shrinkLastPartForReserve(parts, maxChars, filenamePrefix, lastPartReservedChars) {
    const lastPartMaxChars = effectiveMaxChars(maxChars, lastPartReservedChars);
    const adjustedParts = parts.map((part) => ({ ...part, chunks: [...part.chunks] }));
    while (adjustedParts.length > 0) {
        const lastPart = adjustedParts[adjustedParts.length - 1];
        if (lastPart.charCount <= lastPartMaxChars || lastPart.chunks.length <= 1) {
            break;
        }
        const movedChunks = [];
        let movedCharCount = 0;
        while (lastPart.charCount > lastPartMaxChars && lastPart.chunks.length > 1) {
            const movedChunk = lastPart.chunks.pop();
            movedChunks.unshift(movedChunk);
            movedCharCount += movedChunk.content.length;
            lastPart.charCount -= movedChunk.content.length;
        }
        adjustedParts.push(createBundlePart(filenamePrefix, adjustedParts.length + 1, movedChunks, movedCharCount));
    }
    return renumberParts(adjustedParts, filenamePrefix);
}
function withReserveSafetyMargin(charCount) {
    return Math.ceil(charCount * (1 + EMBEDDED_SECTION_RESERVE_MARGIN_RATIO)) + EMBEDDED_SECTION_RESERVE_MARGIN_CHARS;
}
function buildParts(files, maxChars, filenamePrefix, reserves = { firstPartChars: 0, lastPartChars: 0 }) {
    const { chunks, warnings } = buildChunks(files, maxChars);
    const parts = [];
    let currentChunks = [];
    let currentChars = 0;
    const pushPart = () => {
        if (currentChunks.length === 0) {
            return;
        }
        parts.push(createBundlePart(filenamePrefix, parts.length + 1, currentChunks, currentChars));
        currentChunks = [];
        currentChars = 0;
    };
    for (const chunk of chunks) {
        const currentPartNumber = parts.length + 1;
        const currentMaxChars = effectiveMaxChars(maxChars, currentPartNumber === 1 ? reserves.firstPartChars : 0);
        if (shouldStartNewPart(currentChunks, currentChars, chunk, currentMaxChars)) {
            pushPart();
        }
        currentChunks.push(chunk);
        currentChars += chunk.content.length;
    }
    pushPart();
    if (parts.length === 0) {
        parts.push(createBundlePart(filenamePrefix, 1, [], 0));
    }
    return { parts: shrinkLastPartForReserve(parts, maxChars, filenamePrefix, reserves.lastPartChars), warnings };
}
function buildRenderedPartMarkdown(params, partIndex) {
    const { filenamePrefix, inputDirectory, outputDirectory, parts, collectedFiles, skippedFiles, markers, warnings } = params;
    const part = parts[partIndex];
    const promptFileName = bundlePromptFileName(filenamePrefix);
    const indexFileName = parts.at(-1)?.fileName ?? promptFileName;
    const isFirstPart = partIndex === 0;
    const isLastPart = partIndex === parts.length - 1;
    const metadata = {
        toolName: "miku-text-bundle",
        toolVersion: CLI_VERSION,
    };
    return buildPartMarkdown(part, metadata, {
        prompt: isFirstPart ? {
            promptFileName,
            partFileNames: parts.map((bundlePart) => bundlePart.fileName),
            indexFileName,
            ...metadata,
        } : undefined,
        index: isLastPart ? {
            inputDirectory: displayPathFromCurrentDirectory(inputDirectory),
            outputDirectory: displayPathFromCurrentDirectory(outputDirectory),
            parts,
            collectedFiles,
            skippedFiles,
            markers,
            warnings,
            terminalFileName: indexFileName,
            ...metadata,
        } : undefined,
        acknowledgeOnly: !isLastPart,
    });
}
function writeBundleMarkdownFiles(params) {
    const { outputDirectory, filenamePrefix, parts } = params;
    const promptFileName = bundlePromptFileName(filenamePrefix);
    const promptPath = join(outputDirectory, promptFileName);
    const partPaths = parts.map((part) => join(outputDirectory, part.fileName));
    const indexFileName = parts.at(-1)?.fileName ?? promptFileName;
    const indexPath = join(outputDirectory, indexFileName);
    for (const [index, part] of parts.entries()) {
        writeFileSync(join(outputDirectory, part.fileName), buildRenderedPartMarkdown(params, index), "utf8");
    }
    return { indexPath, promptPath, partPaths };
}
function plannedBundleMarkdownPaths(outputDirectory, filenamePrefix, parts) {
    const promptFileName = bundlePromptFileName(filenamePrefix);
    const promptPath = join(outputDirectory, promptFileName);
    const partPaths = parts.map((part) => join(outputDirectory, part.fileName));
    const indexPath = join(outputDirectory, parts.at(-1)?.fileName ?? promptFileName);
    return { indexPath, promptPath, partPaths };
}
function knowledgeIndexFileName(filenamePrefix) {
    return `${filenamePrefix}-index.md`;
}
function staleKnowledgeOutputs(outputDirectory, filenamePrefix, parts) {
    if (!existsSync(outputDirectory)) {
        return [];
    }
    const escapedPrefix = filenamePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escapedPrefix}-\\d{3}\\.md$`);
    const planned = new Set(parts.map((part) => part.fileName));
    return readdirSync(outputDirectory)
        .filter((name) => pattern.test(name) && !planned.has(name))
        .sort(compareUtf16CodeUnits);
}
function sortedEncodingExtensions(options) {
    return Object.entries(options.encoding?.extensions ?? {})
        .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
        .map(([extension, encoding]) => `${extension}=${encoding}`)
        .join(", ");
}
function knowledgeConfiguration(options, filenamePrefix, inputDirectory, outputDirectory) {
    return [
        ["mode", "knowledge-source"],
        ["input", displayPathFromCurrentDirectory(inputDirectory)],
        ["output", displayPathFromCurrentDirectory(outputDirectory)],
        ["filename-prefix", filenamePrefix],
        ["max-chars", String(options.maxChars)],
        ["max-input-file-bytes", String(options.maxInputFileBytes ?? DEFAULT_MAX_INPUT_FILE_BYTES)],
        ["encoding", options.encoding?.default ?? DEFAULT_ENCODING_OPTIONS.default],
        ["encoding-extension", sortedEncodingExtensions(options)],
        ["exclude-extensions", [...(options.excludeExtensions ?? [])].sort(compareUtf16CodeUnits).join(", ")],
        ["exclude-directories", [...(options.excludeDirectories ?? [])].sort(compareUtf16CodeUnits).join(", ")],
    ];
}
function writeKnowledgeMarkdownFiles(params, options) {
    const staleOutputCandidates = staleKnowledgeOutputs(params.outputDirectory, params.filenamePrefix, params.parts);
    const partPaths = params.parts.map((part) => join(params.outputDirectory, part.fileName));
    for (const [index, part] of params.parts.entries()) {
        writeFileSync(partPaths[index], buildKnowledgeSourceMarkdown(part), "utf8");
    }
    const indexPath = join(params.outputDirectory, knowledgeIndexFileName(params.filenamePrefix));
    writeFileSync(indexPath, buildKnowledgeIndexMarkdown({
        managementIndexFileName: knowledgeIndexFileName(params.filenamePrefix),
        configuration: knowledgeConfiguration(options, params.filenamePrefix, params.inputDirectory, params.outputDirectory),
        parts: params.parts,
        collectedFiles: params.collectedFiles,
        skippedFiles: params.skippedFiles,
        markers: params.markers,
        warnings: params.warnings,
        staleOutputCandidates,
    }), "utf8");
    return { indexPath, promptPath: partPaths[0], partPaths, staleOutputCandidates };
}
function plannedKnowledgeMarkdownPaths(outputDirectory, filenamePrefix, parts) {
    const partPaths = parts.map((part) => join(outputDirectory, part.fileName));
    return {
        indexPath: join(outputDirectory, knowledgeIndexFileName(filenamePrefix)),
        promptPath: partPaths[0],
        partPaths,
        staleOutputCandidates: staleKnowledgeOutputs(outputDirectory, filenamePrefix, parts),
    };
}
function estimateEmbeddedPromptChars(parts, filenamePrefix) {
    const promptFileName = bundlePromptFileName(filenamePrefix);
    const indexFileName = parts.at(-1)?.fileName ?? promptFileName;
    const emptyPart = createBundlePart(filenamePrefix, 1, [], 0);
    const metadata = {
        toolName: "miku-text-bundle",
        toolVersion: CLI_VERSION,
    };
    return buildPartMarkdown(emptyPart, metadata, {
        prompt: {
            promptFileName,
            partFileNames: parts.map((part) => part.fileName),
            indexFileName,
            ...metadata,
        },
    }).length - buildPartMarkdown(emptyPart, metadata).length;
}
function estimateEmbeddedIndexChars(params) {
    const { filenamePrefix, inputDirectory, outputDirectory, parts, collectedFiles, skippedFiles, markers, warnings } = params;
    const lastPartNumber = Math.max(parts.length, 1);
    const emptyPart = createBundlePart(filenamePrefix, lastPartNumber, [], 0);
    const metadata = {
        toolName: "miku-text-bundle",
        toolVersion: CLI_VERSION,
    };
    const terminalFileName = parts.at(-1)?.fileName ?? bundlePromptFileName(filenamePrefix);
    return buildPartMarkdown(emptyPart, metadata, {
        index: {
            inputDirectory: displayPathFromCurrentDirectory(inputDirectory),
            outputDirectory: displayPathFromCurrentDirectory(outputDirectory),
            parts,
            collectedFiles,
            skippedFiles,
            markers,
            warnings,
            terminalFileName,
            ...metadata,
        },
    }).length - buildPartMarkdown(emptyPart, metadata).length;
}
function buildPartsWithEmbeddedReserves(params) {
    const { files, maxChars, filenamePrefix, inputDirectory, outputDirectory, skippedFiles, markers } = params;
    let result = buildParts(files, maxChars, filenamePrefix);
    for (let index = 0; index < 5; index += 1) {
        const reserves = {
            firstPartChars: withReserveSafetyMargin(estimateEmbeddedPromptChars(result.parts, filenamePrefix)),
            lastPartChars: withReserveSafetyMargin(estimateEmbeddedIndexChars({
                filenamePrefix,
                inputDirectory,
                outputDirectory,
                parts: result.parts,
                collectedFiles: files,
                skippedFiles,
                markers,
                warnings: result.warnings,
            })),
        };
        const nextResult = buildParts(files, maxChars, filenamePrefix, reserves);
        if (nextResult.parts.length === result.parts.length) {
            return {
                parts: nextResult.parts,
                warnings: nextResult.warnings,
            };
        }
        result = nextResult;
    }
    return {
        parts: result.parts,
        warnings: result.warnings,
    };
}
function printVerboseSummary(files, skipped, parts, ignored) {
    console.log(`collected=${files.length}`);
    console.log(`skipped=${skipped.length}`);
    console.log(`parts=${parts.length}`);
    console.log(`ignoredDirectories=${ignored.directories}`);
    console.log(`ignoredFiles=${ignored.files}`);
    console.log(`ignoredByDirectory=${ignored.byDirectory}`);
    console.log(`ignoredByExtension=${ignored.byExtension}`);
    console.log(`ignoredByGitignore=${ignored.byGitignore}`);
    console.log(`ignoredByOutputDirectory=${ignored.byOutputDirectory}`);
}
function printGeneratedPaths(partPaths) {
    for (const partPath of partPaths) {
        console.log(`generated: ${partPath}`);
    }
}
function createTextBundle(options, now = new Date()) {
    void now;
    const mode = options.mode ?? "handoff";
    const inputPath = resolve(options.inputDirectory);
    const inputStat = statSync(inputPath, { throwIfNoEntry: false });
    if (!inputStat?.isDirectory()) {
        throw new Error(`Input directory does not exist: ${inputPath}`);
    }
    const outputDirectory = chooseOutputDirectory(options.outputDirectory);
    const filenamePrefix = normalizeFilenamePrefix(options.filenamePrefix ?? (mode === "knowledge-source" ? DEFAULT_KNOWLEDGE_FILENAME_PREFIX : DEFAULT_FILENAME_PREFIX));
    if (!options.dryRun) {
        mkdirSync(outputDirectory, { recursive: true });
    }
    const gitignorePatterns = readRootGitignore(inputPath);
    const { files, skipped, ignored } = collectFiles(inputPath, outputDirectory, options, gitignorePatterns);
    const markers = files.flatMap((file) => file.markers);
    const { parts, warnings } = mode === "knowledge-source"
        ? buildParts(files, options.maxChars, filenamePrefix)
        : buildPartsWithEmbeddedReserves({
            files,
            maxChars: options.maxChars,
            filenamePrefix,
            inputDirectory: inputPath,
            outputDirectory,
            skippedFiles: skipped,
            markers,
        });
    const writeParams = {
        outputDirectory,
        filenamePrefix,
        inputDirectory: inputPath,
        parts,
        collectedFiles: files,
        skippedFiles: skipped,
        markers,
        warnings,
    };
    const paths = mode === "knowledge-source"
        ? options.dryRun
            ? plannedKnowledgeMarkdownPaths(outputDirectory, filenamePrefix, parts)
            : writeKnowledgeMarkdownFiles(writeParams, options)
        : options.dryRun
            ? { ...plannedBundleMarkdownPaths(outputDirectory, filenamePrefix, parts), staleOutputCandidates: [] }
            : { ...writeBundleMarkdownFiles(writeParams), staleOutputCandidates: [] };
    const { indexPath, promptPath, partPaths, staleOutputCandidates } = paths;
    const resultWarnings = [
        ...warnings,
        ...staleOutputCandidates.map((fileName) => `Stale generated output remains: \`${fileName}\`.`),
    ];
    if (options.verbose) {
        printVerboseSummary(files, skipped, parts, ignored);
    }
    if (!options.dryRun) {
        printGeneratedPaths(partPaths);
        if (mode === "knowledge-source") {
            printGeneratedPaths([indexPath]);
        }
    }
    return {
        mode,
        outputDirectory,
        indexPath,
        promptPath,
        partPaths,
        knowledgeSourcePaths: mode === "knowledge-source" ? partPaths : [],
        managementIndexPath: mode === "knowledge-source" ? indexPath : undefined,
        filesCollected: files.length,
        filesSkipped: skipped.length,
        directoriesIgnored: ignored.directories,
        filesIgnored: ignored.files,
        ignoredByDirectory: ignored.byDirectory,
        ignoredByExtension: ignored.byExtension,
        ignoredByGitignore: ignored.byGitignore,
        ignoredByOutputDirectory: ignored.byOutputDirectory,
        partsGenerated: parts.length,
        warnings: resultWarnings,
        dryRun: options.dryRun ?? false,
    };
}

// main.js
function isCliEntrypoint(metaUrl, argvPath) {
    if (!argvPath) {
        return false;
    }
    try {
        return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
    }
    catch {
        return false;
    }
}
function main() {
    try {
        const options = parseArgs(process.argv.slice(2));
        const result = createTextBundle(options);
        const prefix = result.dryRun ? "dry-run" : "completed";
        const suffix = result.dryRun ? ", no files written" : "";
        const artifactLabel = result.mode === "knowledge-source" ? "knowledge file(s)" : "part(s)";
        const indexSuffix = result.mode === "knowledge-source" ? ", 1 management index" : "";
        console.log(`${prefix}: ${result.partsGenerated} ${artifactLabel}${indexSuffix}, ${result.filesCollected} file(s) collected, ${result.filesSkipped} file(s) skipped, ${result.directoriesIgnored} directories ignored, ${result.filesIgnored} file(s) ignored${suffix}`);
    }
    catch (error) {
        if (error instanceof HelpRequestedError) {
            printHelp();
            process.exit(0);
        }
        if (error instanceof VersionRequestedError) {
            printVersion();
            process.exit(0);
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(`error: ${message}`);
        printHelp();
        process.exit(1);
    }
}
if (isCliEntrypoint(import.meta.url, process.argv[1])) {
    main();
}

export {
  HelpRequestedError,
  VersionRequestedError,
  CLI_VERSION,
  DEFAULT_EXCLUDE_DIRECTORIES,
  DEFAULT_EXCLUDE_EXTENSIONS,
  parseArgs,
  printHelp,
  printVersion,
  createTextBundle,
  chooseOutputDirectory,
  discoverCandidateFiles,
  buildIndexMarkdown,
  buildPartMarkdown,
  buildPromptMarkdown,
  matchesAnyPattern,
  matchesGitignore,
  parseGitignore,
  getExtension,
  normalizePattern,
  toPosixPath,
  main,
};
