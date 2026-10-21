import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SESSION_COOKIE = "zhiyu-session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
let database: DatabaseSync | undefined;

function getDatabase() {
  if (database) return database;
  const directory = process.env.ZHIYU_DATA_DIR ? path.resolve(process.env.ZHIYU_DATA_DIR) : path.join(process.cwd(), "data");
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, "auth.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS owner (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      count INTEGER NOT NULL,
      started_at INTEGER NOT NULL
    );
  `);
  database = db;
  return db;
}

type Owner = { username: string; salt: string; password_hash: string };
const owner = () => getDatabase().prepare("SELECT username, salt, password_hash FROM owner WHERE id = 1").get() as Owner | undefined;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const derivePassword = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
});

export class AuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function hasAccount() { return Boolean(owner()); }

export async function setupAccount(username: string, password: string) {
  if (hasAccount()) throw new AuthError("账号已设置，请直接登录。", 409);
  const salt = randomBytes(32).toString("hex");
  const hash = await derivePassword(password, salt);
  // INSERT OR IGNORE makes simultaneous first-run requests unable to replace the owner.
  const result = getDatabase().prepare("INSERT OR IGNORE INTO owner (id, username, salt, password_hash) VALUES (1, ?, ?, ?)")
    .run(username, salt, hash.toString("hex"));
  if (!result.changes) throw new AuthError("账号已设置，请直接登录。", 409);
  return createSession();
}

export async function login(username: string, password: string) {
  const db = getDatabase();
  const now = Date.now();
  db.prepare("DELETE FROM login_attempts WHERE started_at <= ?").run(now - ATTEMPT_WINDOW);
  const attempt = db.prepare("SELECT count FROM login_attempts WHERE id = 1").get() as { count: number } | undefined;
  if (attempt && attempt.count >= MAX_ATTEMPTS) throw new AuthError("尝试次数过多，请在 15 分钟后重试。", 429);
  // Count before awaiting the hash, so parallel requests cannot bypass the limit.
  db.prepare("INSERT INTO login_attempts (id, count, started_at) VALUES (1, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1").run(now);
  const account = owner();
  const hash = await derivePassword(password, account?.salt ?? "0".repeat(64));
  const expected = account ? Buffer.from(account.password_hash, "hex") : Buffer.alloc(64);
  const passwordMatches = timingSafeEqual(hash, expected);
  if (!account || account.username !== username || !passwordMatches) throw new AuthError("账号或密码不正确。", 401);
  db.prepare("DELETE FROM login_attempts").run();
  return createSession();
}

function createSession() {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  const db = getDatabase();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)").run(tokenHash(token), expiresAt);
  return { token, expiresAt };
}

export function getSession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = getDatabase().prepare(`SELECT owner.username FROM sessions CROSS JOIN owner
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND owner.id = 1`).get(tokenHash(token), Date.now()) as { username: string } | undefined;
  return session ?? null;
}

export function logout(token: string | undefined) {
  if (token) getDatabase().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}
