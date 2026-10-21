const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { NextRequest } = require("next/server");
const load = require("./load-typescript.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyu-auth-"));
  const databases = [];
  let clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
  class TestDatabase extends DatabaseSync {
    constructor(...args) { super(...args); databases.push(this); }
  }
  const store = load("lib/auth-store.ts", {
    Buffer, Date: Clock,
    process: { ...process, env: { ...process.env, ZHIYU_DATA_DIR: directory } },
    require: (name) => name === "node:sqlite" ? { DatabaseSync: TestDatabase } : require(name),
  });
  t.after(() => {
    databases.forEach((db) => db.close());
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "zhiyu-auth-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { store, databases, advance: (ms) => { clock += ms; } };
}

test("local owner setup is atomic, passwords are hashed, sessions expire and logout revokes access", async (t) => {
  const { store, databases, advance } = fixture(t);
  assert.equal(store.hasAccount(), false);
  assert.equal(store.getSession(undefined), null);
  const attempts = await Promise.allSettled([
    store.setupAccount("owner-one", "local-password-one"),
    store.setupAccount("owner-two", "local-password-two"),
  ]);
  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(attempts.find((item) => item.status === "rejected").reason.status, 409);
  const winner = attempts.findIndex((item) => item.status === "fulfilled");
  const username = winner === 0 ? "owner-one" : "owner-two";
  const password = winner === 0 ? "local-password-one" : "local-password-two";
  const initialSession = attempts[winner].value;
  assert.equal(store.hasAccount(), true);
  assert.equal(store.getSession(initialSession.token).username, username);
  const db = databases[0];
  const row = db.prepare("SELECT * FROM owner").get();
  assert.notEqual(row.password_hash, password);
  assert.equal(row.salt.length, 64);
  const storedSession = db.prepare("SELECT * FROM sessions").get();
  assert.notEqual(storedSession.token_hash, initialSession.token);
  assert.equal(store.getSession("f".repeat(64)), null);
  await assert.rejects(store.login(username, "incorrect-password"), { status: 401 });
  await assert.rejects(store.login("wrong-account", password), { status: 401 });
  const secondSession = await store.login(username, password);
  store.logout(initialSession.token);
  assert.equal(store.getSession(initialSession.token), null);
  assert.equal(store.getSession(secondSession.token).username, username);
  advance(store.SESSION_SECONDS * 1000 + 1);
  assert.equal(store.getSession(secondSession.token), null);
});

test("login failures are limited across parallel requests and the window expires", async (t) => {
  const { store, advance } = fixture(t);
  await store.setupAccount("owner", "a-local-password");
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => store.login("owner", "incorrect-password")));
  assert.equal(attempts.filter((item) => item.reason?.status === 401).length, 10);
  assert.equal(attempts.filter((item) => item.reason?.status === 429).length, 2);
  await assert.rejects(store.login("owner", "a-local-password"), { status: 429 });
  advance(15 * 60 * 1000 + 1);
  const session = await store.login("owner", "a-local-password");
  assert.equal(store.getSession(session.token).username, "owner");
});

test("auth endpoint validates origin and credentials; protected resources require an active session", async (t) => {
  const { store } = fixture(t);
  const helpers = load("lib/auth-request.ts", { URL });
  const imports = (name) => name === "@/lib/auth-store" ? store : name === "@/lib/auth-request" ? helpers : require(name);
  const { POST } = load("app/api/auth/route.ts", { require: imports });
  const { proxy } = load("proxy.ts", { require: imports, URL });
  const origin = "http://localhost:3000";
  const request = (body, options = {}) => new NextRequest(`${origin}/api/auth`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...options }, body: JSON.stringify(body),
  });
  assert.equal((await POST(request({ action: "setup", username: "owner", password: "a-local-password" }, { Origin: "http://other.example" }))).status, 403);
  assert.equal(store.hasAccount(), false);
  assert.equal((await POST(request({ action: "setup", username: "o", password: "short" }))).status, 400);
  assert.equal((await POST(new NextRequest(`${origin}/api/auth`, { method: "POST", headers: { Origin: origin }, body: "invalid" }))).status, 400);
  const response = await POST(request({ action: "setup", username: "owner", password: "a-local-password" }));
  assert.equal(response.status, 200);
  const token = response.cookies.get(store.SESSION_COOKIE).value;
  const cookie = `${store.SESSION_COOKIE}=${token}`;
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=lax/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const resource of ["/api/documents", "/api/documents/id", "/api/backup", "/api/search", "/api/notes", "/api/import/markdown", "/api/upload"]) {
    assert.equal(proxy(new NextRequest(origin + resource)).status, 401, resource);
    assert.equal(proxy(new NextRequest(origin + resource, { headers: { Cookie: cookie } })).headers.get("x-middleware-next"), "1", resource);
  }
  assert.equal(proxy(new NextRequest(origin + "/")).headers.get("location"), origin + "/login");
  assert.equal(proxy(new NextRequest(origin + "/uploads/private.png")).status, 307);
  assert.equal(proxy(new NextRequest(origin + "/_next/image?url=%2Fuploads%2Fprivate.png&w=640&q=75")).status, 307);
  assert.equal(proxy(new NextRequest(origin + "/api/documents", { method: "POST", headers: { Cookie: cookie, Origin: "http://other.example" } })).status, 403);
  assert.equal((await POST(request({ action: "setup", username: "other", password: "another-password" }))).status, 409);
  const secureResponse = await POST(new NextRequest("https://local.example/api/auth", {
    method: "POST", headers: { Origin: "https://local.example", "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", username: "owner", password: "a-local-password" }),
  }));
  assert.match(secureResponse.headers.get("set-cookie"), /Secure/);
  assert.equal((await POST(request({ action: "logout" }, { Cookie: cookie }))).status, 200);
  assert.equal(proxy(new NextRequest(origin + "/api/documents", { headers: { Cookie: cookie } })).status, 401);
});

test("login destinations stay inside the app", () => {
  const { safeReturnPath, isSameOrigin } = load("lib/auth-request.ts", { URL });
  assert.equal(isSameOrigin(new Request("http://localhost:3000/api/auth", { headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" } })), true);
  assert.equal(isSameOrigin(new Request("http://localhost:3000/api/auth", { headers: { Host: "127.0.0.1:3000", Origin: "http://other.example", "X-Forwarded-Host": "other.example" } })), false);
  for (const value of [null, "https://other.example", "//other.example", "/\\other.example", "/login", "/api/backup", "/_next/image", "/\n/other.example"]) {
    assert.equal(safeReturnPath(value), "/", String(value));
  }
  assert.equal(safeReturnPath("/?document=123"), "/?document=123");
});
