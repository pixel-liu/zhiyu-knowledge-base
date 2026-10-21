import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const port = Number(process.env.PORT || 3000);
const url = `http://127.0.0.1:${port}`;
const instance = createHash("sha256").update(root).digest("hex").slice(0, 16);
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const stateDirectory = join(root, ".zhiyu-runtime");
const lockPath = join(stateDirectory, "launcher.json");
const stampPath = join(root, ".next", "zhiyu-build.json");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let child;
let ownsLock = false;

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function releaseLock() {
  if (ownsLock && readJson(lockPath)?.pid === process.pid) rmSync(lockPath, { force: true });
  ownsLock = false;
}

function fingerprint() {
  const hash = createHash("sha256").update(`node:${process.versions.node};platform:${process.platform};arch:${process.arch}`);
  const visit = (relative) => {
    const path = join(root, relative);
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) hash.update(name).update("\0").update(readFileSync(join(root, name))).update("\0");
    }
  };
  for (const directory of ["app", "components", "hooks", "lib", "public", "styles"]) visit(directory);
  for (const name of readdirSync(root).sort()) {
    if (/^(package(?:-lock)?\.json|proxy\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|tsconfig\.json|postcss\.config\.[cm]?[jt]s|tailwind\.config\.[cm]?[jt]s|\.env(?:\..+)?)$/.test(name) && !name.startsWith(".env.development")) {
      hash.update(name).update("\0").update(readFileSync(join(root, name))).update("\0");
    }
  }
  return hash.digest("hex");
}

async function health() {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000), cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

function portInUse() {
  return new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => { socket.destroy(); done(false); });
    socket.once("timeout", () => { socket.destroy(); done(true); });
  });
}

function launch(args) {
  child = spawn(process.execPath, [nextCli, ...args], {
    cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" }, windowsHide: true,
  });
  const processToWait = child;
  return new Promise((done, reject) => {
    processToWait.once("error", reject);
    processToWait.once("exit", (code, signal) => {
      if (child === processToWait) child = undefined;
      done(code ?? (signal ? 1 : 0));
    });
  });
}

async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error("请安装 Node.js 22.13 或更新版本（推荐 Node.js 24）。");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是 1 到 65535 之间的端口号。");
  if (!existsSync(nextCli)) throw new Error("尚未安装项目依赖，请先在项目目录执行 npm install，再双击启动脚本。");
  if (await portInUse()) {
    const current = await health();
    if (current?.application === "zhiyu" && current.instance === instance) {
      console.log(`知识库已经运行：${url}${current.mode === "production" ? "" : "（开发模式）"}`);
      return;
    }
    throw new Error(`端口 ${port} 已被其他程序占用。请先关闭占用程序，或设置 PORT 后重新启动。`);
  }
  mkdirSync(stateDirectory, { recursive: true });
  try {
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const previous = readJson(lockPath);
    let alive = false;
    if (Number.isInteger(previous?.pid) && previous.pid > 0) {
      try { process.kill(previous.pid, 0); alive = true; } catch (cause) { alive = cause.code !== "ESRCH"; }
    }
    if (alive) { console.log("知识库正在启动，请查看已经打开的启动窗口，等待构建完成。"); return; }
    rmSync(lockPath, { force: true });
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  }
  ownsLock = true;
  const source = fingerprint();
  const saved = readJson(stampPath);
  const buildIdPath = join(root, ".next", "BUILD_ID");
  if (!existsSync(buildIdPath) || saved?.source !== source || saved.buildId !== readFileSync(buildIdPath, "utf8").trim()) {
    console.log("首次启动或检测到代码更新，正在生成正式版本（首次构建需要一些时间）…");
    rmSync(stampPath, { force: true });
    const code = await launch(["build"]);
    if (code !== 0) throw new Error("构建失败，服务尚未启动。请根据上方错误修复后重试。");
    if (fingerprint() !== source) throw new Error("构建期间源文件发生变化，请重新启动以生成最新版本。");
    writeFileSync(stampPath, JSON.stringify({ source, buildId: readFileSync(buildIdPath, "utf8").trim() }));
  } else {
    console.log("正在复用已构建的正式版本…");
  }
  console.log("正在启动知识库，按 Ctrl+C 可以停止服务。");
  const finished = launch(["start", "--hostname", "127.0.0.1", "--port", String(port)]);
  let ended = false;
  const completion = finished.then((code) => { ended = true; return code; });
  completion.catch(() => { ended = true; });
  const deadline = Date.now() + 60000;
  while (!ended && Date.now() < deadline) {
    const current = await health();
    if (current?.application === "zhiyu" && current.instance === instance && current.mode === "production") {
      console.log(`知识库已就绪，请在浏览器打开 ${url}`);
      const code = await completion;
      if (code !== 0) throw new Error(`服务已退出（退出码 ${code}），请查看上方错误。`);
      return;
    }
    await delay(300);
  }
  if (ended) throw new Error(`服务未能启动（退出码 ${await completion}），请查看上方错误。`);
  child?.kill();
  throw new Error("等待服务就绪超时，请查看上方输出后重新启动。");
}

process.once("exit", releaseLock);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { child?.kill(); releaseLock(); process.exit(0); });
}
main().catch((error) => { console.error(`\n启动失败：${error.message}`); process.exitCode = 1; releaseLock(); });
