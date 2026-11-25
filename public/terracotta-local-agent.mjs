#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]?.replace(/^--/, "");
  if (key) args.set(key, process.argv[index + 1] ?? "");
}

const server = String(args.get("server") || process.env.TERRACOTTA_SERVER || "").replace(/\/+$/, "");
const token = String(args.get("token") || process.env.TERRACOTTA_AGENT_TOKEN || "");
const name = String(args.get("name") || process.env.COMPUTERNAME || process.env.HOSTNAME || "내 컴퓨터");
const workspace = path.resolve(String(args.get("workspace") || process.cwd()));

if (!server.startsWith("http://") && !server.startsWith("https://")) {
  console.error("Missing --server https://your-terracotta.example");
  process.exit(1);
}
if (!token.startsWith("tca_")) {
  console.error("Missing --token tca_...");
  process.exit(1);
}

function resolveShell() {
  if (process.platform === "win32") {
    const hasPwsh = spawnSync("where.exe", ["pwsh.exe"], { stdio: "ignore" }).status === 0;
    return { executable: hasPwsh ? "pwsh.exe" : "powershell.exe", label: hasPwsh ? "PowerShell 7" : "Windows PowerShell", prefix: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"] };
  }
  const requested = process.env.SHELL;
  const executable = requested?.startsWith("/") ? requested : process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
  return { executable, label: process.platform === "darwin" ? "macOS zsh" : path.basename(executable), prefix: ["-lc"] };
}

const shell = resolveShell();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
let stopping = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function call(payload) {
  const response = await fetch(`${server}/api/local-agent/worker`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, name, platform: process.platform, shell: shell.label, workspace }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Terracotta returned ${response.status}`);
  return body;
}

function insideWorkspace(candidate) {
  const relative = path.relative(workspace, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function blockedCommand(command) {
  const normalized = command.replace(/\s+/g, " ").trim().toLowerCase();
  return [
    /(^|[;&|])\s*(sudo|su)\b/,
    /\b(shutdown|reboot|halt|poweroff|diskpart|format|mkfs)\b/,
    /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/|~|\$home)\b/,
    /\bremove-item\b.{0,80}(-recurse|-force).{0,80}([a-z]:\\|\/)\s*($|[;&|])/,
    /\b(reg\s+delete|bcdedit|del\s+\/[a-z]*[sq])\b/,
    /\b(curl|wget|invoke-webrequest)\b.{0,200}(\|\s*(sh|bash|zsh|powershell|pwsh)|invoke-expression)/,
  ].some((pattern) => pattern.test(normalized));
}

function relativePath(value) {
  const normalized = String(value || ".").replace(/\\/g, "/").trim() || ".";
  if (path.isAbsolute(normalized) || normalized.split("/").some((part) => part === "..")) throw new Error("Path must stay inside the connected project.");
  return normalized;
}

async function resolveProjectPath(projectRoot, value, allowMissing = false) {
  const root = await realpath(projectRoot);
  const candidate = path.resolve(root, relativePath(value));
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path escapes the connected project.");
  try {
    const resolved = await realpath(candidate);
    const resolvedRelative = path.relative(root, resolved);
    if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) throw new Error("Symlink escapes the connected project.");
    return { root, target: resolved };
  } catch (error) {
    if (!allowMissing || !error || typeof error !== "object" || error.code !== "ENOENT") throw error;
    const parent = await realpath(path.dirname(candidate));
    const parentRelative = path.relative(root, parent);
    if (parentRelative.startsWith("..") || path.isAbsolute(parentRelative)) throw new Error("Parent folder escapes the connected project.");
    return { root, target: candidate };
  }
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

const ignoredFolders = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo", ".cache", "coverage"]);

async function walkFiles(root, start, maxDepth, limit = 2_000) {
  const output = [];
  async function visit(folder, depth) {
    if (output.length >= limit || depth > maxDepth) return;
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (output.length >= limit || entry.isSymbolicLink() || ignoredFolders.has(entry.name)) continue;
      const absolute = path.join(folder, entry.name);
      const info = await stat(absolute);
      const item = { path: path.relative(root, absolute).replace(/\\/g, "/"), type: entry.isDirectory() ? "directory" : "file", size: entry.isFile() ? info.size : 0, modifiedAt: info.mtime.toISOString() };
      output.push(item);
      if (entry.isDirectory()) await visit(absolute, depth + 1);
    }
  }
  const info = await stat(start);
  if (info.isDirectory()) await visit(start, 1);
  else output.push({ path: path.relative(root, start).replace(/\\/g, "/"), type: "file", size: info.size, modifiedAt: info.mtime.toISOString() });
  return output;
}

function capture(executable, commandArgs, cwd, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const child = spawn(executable, commandArgs, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-100_000);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk.toString()); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk.toString()); });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); resolve({ stdout, stderr: error.message, exitCode: 127 }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: Number.isInteger(code) ? code : 1 }); });
  });
}

async function runStructuredJob(job, projectRoot) {
  const operation = String(job.operation || "run_terminal_command");
  const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
  if (operation === "list_project_files") {
    const resolved = await resolveProjectPath(projectRoot, payload.path || ".");
    const files = await walkFiles(resolved.root, resolved.target, Math.min(8, Math.max(1, Number(payload.maxDepth || 5))));
    return { stdout: JSON.stringify({ root: path.relative(workspace, resolved.root).replace(/\\/g, "/") || ".", files }), stderr: "", exitCode: 0, status: "completed" };
  }
  if (operation === "read_project_file") {
    const resolved = await resolveProjectPath(projectRoot, payload.path);
    const info = await stat(resolved.target);
    if (!info.isFile() || info.size > 600_000) throw new Error("Only text files up to 600KB can be read.");
    const content = await readFile(resolved.target);
    if (content.includes(0)) throw new Error("Binary files cannot be opened in the Terracotta editor.");
    return { stdout: JSON.stringify({ path: path.relative(resolved.root, resolved.target).replace(/\\/g, "/"), content: content.toString("utf8"), hash: hash(content), size: info.size, modifiedAt: info.mtime.toISOString() }), stderr: "", exitCode: 0, status: "completed" };
  }
  if (operation === "write_project_file") {
    const resolved = await resolveProjectPath(projectRoot, payload.path, true);
    let before = null;
    try { before = await readFile(resolved.target); } catch (error) { if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error; }
    const expectedHash = String(payload.expectedHash || "");
    if (expectedHash && (!before || hash(before) !== expectedHash)) throw new Error("File changed after it was opened. Reload it before saving.");
    const content = Buffer.from(String(payload.content ?? ""), "utf8");
    if (content.length > 600_000) throw new Error("A project file must be 600KB or smaller.");
    await mkdir(path.dirname(resolved.target), { recursive: false }).catch((error) => { if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error; });
    await writeFile(resolved.target, content);
    const filePath = path.relative(resolved.root, resolved.target).replace(/\\/g, "/");
    const changedFiles = [{ path: filePath, action: before ? "updated" : "created", beforeHash: before ? hash(before) : null, afterHash: hash(content), bytes: content.length }];
    return { stdout: JSON.stringify({ saved: true, path: filePath, hash: hash(content), changedFiles }), stderr: "", exitCode: 0, status: "completed", changedFiles };
  }
  if (operation === "search_project_files") {
    const resolved = await resolveProjectPath(projectRoot, payload.path || ".");
    const query = String(payload.query || "").toLowerCase();
    if (!query) throw new Error("Search query is required.");
    const maxResults = Math.min(100, Math.max(1, Number(payload.maxResults || 50)));
    const candidates = await walkFiles(resolved.root, resolved.target, 8, 3_000);
    const matches = [];
    for (const item of candidates) {
      if (matches.length >= maxResults || item.type !== "file" || item.size > 300_000) continue;
      if (item.path.toLowerCase().includes(query)) matches.push({ path: item.path, line: null, preview: "파일명 일치" });
      if (matches.length >= maxResults) break;
      try {
        const content = await readFile(path.join(resolved.root, item.path), "utf8");
        if (content.includes("\0")) continue;
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length && matches.length < maxResults; index++) if (lines[index].toLowerCase().includes(query)) matches.push({ path: item.path, line: index + 1, preview: lines[index].trim().slice(0, 240) });
      } catch { /* Skip unreadable and binary-like files. */ }
    }
    return { stdout: JSON.stringify({ query, matches }), stderr: "", exitCode: 0, status: "completed" };
  }
  if (operation === "inspect_project_changes") {
    const resolved = await resolveProjectPath(projectRoot, payload.path || ".");
    const pathArg = path.relative(resolved.root, resolved.target).replace(/\\/g, "/") || ".";
    const statusResult = await capture("git", ["status", "--short", "--", pathArg], resolved.root);
    const diffResult = await capture("git", ["diff", "--", pathArg], resolved.root);
    const stagedResult = await capture("git", ["diff", "--cached", "--", pathArg], resolved.root);
    const exitCode = Math.max(statusResult.exitCode, diffResult.exitCode, stagedResult.exitCode);
    return { stdout: JSON.stringify({ status: statusResult.stdout, diff: diffResult.stdout, staged: stagedResult.stdout }), stderr: [statusResult.stderr, diffResult.stderr, stagedResult.stderr].filter(Boolean).join("\n"), exitCode, status: exitCode === 0 ? "completed" : "failed" };
  }
  throw new Error(`Unsupported structured operation: ${operation}`);
}

async function runJob(job) {
  const requestedCwd = path.resolve(workspace, String(job.cwd || "."));
  if (!insideWorkspace(requestedCwd)) {
    return Promise.resolve({ stdout: "", stderr: `Blocked: cwd must stay inside ${workspace}`, exitCode: 126, status: "failed" });
  }

  if (!["run_terminal_command", "run_project_command"].includes(String(job.operation || "run_terminal_command"))) {
    try { return await runStructuredJob(job, requestedCwd); }
    catch (error) { return { stdout: "", stderr: error instanceof Error ? error.message : String(error), exitCode: 1, status: "failed" }; }
  }

  if (blockedCommand(job.command)) {
    return Promise.resolve({ stdout: "", stderr: "Blocked: Terracotta Local Agent refused a system-level or destructive command.", exitCode: 126, status: "failed" });
  }

  return new Promise((resolve) => {
    const child = spawn(shell.executable, [...shell.prefix, String(job.command)], {
      cwd: requestedCwd,
      env: { ...process.env, NO_COLOR: "1", CI: process.env.CI || "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current, chunk) => `${current}${chunk}`.slice(-100_000);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk.toString()); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk.toString()); });
    const timeout = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32") spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      else child.kill("SIGTERM");
    }, Math.max(1, Number(job.timeoutSeconds || 30)) * 1_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr: `${stderr}\n${error.message}`.trim(), exitCode: 127, status: "failed" });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: Number.isInteger(code) ? code : timedOut ? 124 : 1, status: timedOut ? "timed_out" : code === 0 ? "completed" : "failed" });
    });
  });
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

await call({ action: "hello" });
console.log(`Terracotta Local Agent connected`);
console.log(`  Computer: ${name}`);
console.log(`  Shell:    ${shell.label}`);
console.log(`  Workspace:${workspace}`);
console.log("Commands only run after approval in Terracotta. Press Ctrl+C to stop.");

let failures = 0;
while (!stopping) {
  try {
    const response = await call({ action: "claim" });
    failures = 0;
    if (!response.job) {
      await sleep(1_500);
      continue;
    }
    console.log(`\n[approved] ${response.job.command}`);
    const result = await runJob(response.job);
    await call({ action: "result", jobId: response.job.id, ...result });
    console.log(`[${result.status}] exit ${result.exitCode}`);
  } catch (error) {
    failures += 1;
    console.error(`Connection retry ${failures}: ${error.message}`);
    await sleep(Math.min(15_000, 1_000 * 2 ** Math.min(failures, 4)));
  }
}

console.log("Terracotta Local Agent stopped.");
