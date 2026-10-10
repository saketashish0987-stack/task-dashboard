import crypto from 'node:crypto';
import { readJson, writeJson } from './store.mjs';

// Accounts live in users.json. Each entry holds only:
//  - salt/hash: a scrypt hash of the login key sent by the browser (never the password)
//  - blob:      the encrypted attendance data (ciphertext; the server cannot read it)
//  - version:   a counter used to detect conflicting writes
const USERS_FILE = 'users.json';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const sessions = new Map(); // token -> { username, expiresAt }
const failures = new Map(); // username -> { count, lockedUntil }

const loadUsers = () => readJson(USERS_FILE, {});
const saveUsers = (users) => writeJson(USERS_FILE, users);

const hashAuthKey = (authKey, salt) =>
  crypto.scryptSync(authKey, salt, 64).toString('hex');

const safeEqualHex = (a, b) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const validAuthKey = (k) => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);

/** Create an account. Requires the invite code configured on the server. */
export const register = (username, authKey, inviteCode) => {
  const expected = process.env.ATTENDANCE_INVITE_CODE;
  if (!expected) return { error: 'disabled' };
  const a = Buffer.from(String(inviteCode ?? ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: 'invite' };
  if (!validAuthKey(authKey)) return { error: 'invalid' };
  const users = loadUsers();
  if (users[username]) return { error: 'exists' };
  const salt = crypto.randomBytes(16).toString('hex');
  users[username] = {
    salt,
    hash: hashAuthKey(authKey, salt),
    blob: null,
    version: 0,
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);
  return { ok: true };
};

/** Check a login key. Returns a session token, or an error. */
export const login = (username, authKey) => {
  const now = Date.now();
  const f = failures.get(username) || { count: 0, lockedUntil: 0 };
  if (f.lockedUntil > now) return { error: 'locked' };
  if (!validAuthKey(authKey)) return { error: 'invalid' };

  const user = loadUsers()[username];
  // Always hash, so response time does not reveal whether the account exists.
  const ok = user
    ? safeEqualHex(hashAuthKey(authKey, user.salt), user.hash)
    : (hashAuthKey(authKey, 'x'.repeat(32)), false);

  if (!ok) {
    const count = f.count + 1;
    failures.set(username, { count, lockedUntil: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0 });
    return { error: 'invalid' };
  }
  failures.delete(username);
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { username, expiresAt: now + SESSION_TTL_MS });
  return { token };
};

export const logout = (token) => sessions.delete(token);

/** Returns the username for a valid session token, or null. */
export const authenticate = (token) => {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s.username;
};

export const getData = (username) => {
  const u = loadUsers()[username];
  return u ? { blob: u.blob, version: u.version } : null;
};

/** Store a new ciphertext if the client's version matches. */
export const putData = (username, blob, version) => {
  const users = loadUsers();
  const u = users[username];
  if (!u) return { error: 'notfound' };
  if (u.version !== version) return { error: 'conflict', version: u.version };
  u.blob = blob;
  u.version += 1;
  saveUsers(users);
  return { version: u.version };
};

/** Permanently delete an account and all of its data, and end its sessions. */
export const deleteAccount = (username, token) => {
  const users = loadUsers();
  delete users[username];
  saveUsers(users);
  for (const [t, s] of sessions) if (s.username === username || t === token) sessions.delete(t);
  return true;
};
