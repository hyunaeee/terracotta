#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
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

function runJob(job) {
  const requestedCwd = path.resolve(workspace, String(job.cwd || "."));
  if (!insideWorkspace(requestedCwd)) {
    return Promise.resolve({ stdout: "", stderr: `Blocked: cwd must stay inside ${workspace}`, exitCode: 126, status: "failed" });
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
    child.on("close", (code, signal) => {
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
