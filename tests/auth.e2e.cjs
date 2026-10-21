// Run after `npm run build`. Uses a temporary database, never the user's library.
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyu-auth-e2e-"));
  const root = path.resolve(__dirname, "..");
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, env: { ...process.env, NODE_ENV: "production", ZHIYU_DATA_DIR: directory }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data) => { logs = (logs + data).slice(-12000); });
  child.stderr.on("data", (data) => { logs = (logs + data).slice(-12000); });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline && child.exitCode === null) {
      try { ready = (await fetch(base + "/api/health", { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, "production server did not start");
    const send = (resource, options = {}) => fetch(base + resource, { redirect: "manual", ...options });
    const auth = (body, headers = {}) => send("/api/auth", {
      method: "POST", headers: { Origin: base, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    const unauthenticatedPage = await send("/");
    assert.equal(unauthenticatedPage.status, 307);
    assert.equal(new URL(unauthenticatedPage.headers.get("location"), base).href, base + "/login");
    assert.match(await (await send("/login")).text(), /开启你的文档库/);
    for (const resource of ["/api/documents", "/api/search?q=test", "/api/backup", "/api/notes", "/api/upload"]) {
      assert.equal((await send(resource)).status, 401, resource);
    }
    assert.equal((await send("/uploads/private.png")).status, 307);
    assert.equal((await send("/_next/image?url=%2Fuploads%2Fprivate.png&w=640&q=75")).status, 307);
    const credentials = { username: "test-owner", password: "local-test-password-2026" };
    assert.equal((await auth({ action: "setup", ...credentials }, { Origin: "http://other.example" })).status, 403);
    const setup = await auth({ action: "setup", ...credentials });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get("set-cookie").split(";")[0];
    assert.match(setup.headers.get("set-cookie"), /HttpOnly/i);
    assert.equal((await send("/", { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await send("/login", { headers: { Cookie: cookie } })).status, 307);
    const create = await send("/api/documents", {
      method: "POST", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ title: "登录验证文档" }),
    });
    assert.equal(create.status, 201);
    const document = await create.json();
    for (const resource of ["/api/reviews", `/api/documents/${document.id}/knowledge`, `/api/documents/${document.id}/review`]) {
      assert.equal((await send(resource)).status, 401, resource);
    }
    const post = (resource, body) => send(resource, { method:"POST", headers:{ Cookie:cookie, Origin:base, "Content-Type":"application/json" }, body:JSON.stringify(body) });
    const linked = await (await post("/api/documents", { title:"关联验证", content:JSON.stringify([{ type:"paragraph", content:[{ type:"link", href:`/?document=${document.id}`, content:"[[登录验证文档]]" }] }]) })).json();
    const connections = await (await send(`/api/documents/${document.id}/knowledge`, { headers:{ Cookie:cookie } })).json();
    assert.ok(connections.connections.backlinks.some((item) => item.id === linked.id));
    const enrolled = await post(`/api/documents/${document.id}/review`, { status:"learning" });
    assert.equal(enrolled.status, 200);
    const plan = await enrolled.json();
    const overview = await (await send("/api/reviews", { headers:{ Cookie:cookie } })).json();
    assert.equal(overview.due, 1);
    assert.equal((await post(`/api/documents/${document.id}/review`, { grade:"good", version:plan.version })).status, 200);
    assert.equal((await post(`/api/documents/${document.id}/review`, { grade:"good", version:plan.version })).status, 409);
    const backupResponse = await send("/api/backup?all=true", { headers:{ Cookie:cookie } });
    const backup = await backupResponse.json();
    assert.equal(backup.reviews.length, 1);
    assert.equal((await post("/api/backup", backup)).status, 200);
    assert.equal((await send("/api/documents", { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await send("/api/documents", { method: "POST", headers: { Cookie: cookie, Origin: "http://other.example" } })).status, 403);
    assert.equal((await auth({ action: "setup", ...credentials })).status, 409);
    assert.equal((await auth({ action: "logout" }, { Cookie: cookie })).status, 200);
    assert.equal((await send(`/api/documents/${document.id}`, { headers: { Cookie: cookie } })).status, 401);
    assert.match(await (await send("/login")).text(), /欢迎回来/);
    assert.equal((await auth({ action: "login", ...credentials, password: "incorrect-password" })).status, 401);
    const login = await auth({ action: "login", ...credentials });
    assert.equal(login.status, 200);
    const secondCookie = login.headers.get("set-cookie").split(";")[0];
    const documents = await (await send("/api/documents", { headers: { Cookie: secondCookie } })).json();
    assert.ok(documents.some((item) => item.id === document.id && item.title === "登录验证文档"));
    await auth({ action: "logout" }, { Cookie: secondCookie });
    console.log("正式版本验证通过：登录与访问验证、双向链接、复习计划、重复评分拦截、备份导入，以及退出后重新登录。");
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    child.kill();
    await exited;
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "zhiyu-auth-e2e-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
