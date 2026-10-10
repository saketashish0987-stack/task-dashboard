/**
 * Client-side encryption for attendance data.
 *
 * The password never leaves the browser. From it we derive two independent keys:
 *  - authKey: sent to the server, which stores only a hash of it (used to log in)
 *  - encKey:  never sent anywhere; encrypts the attendance data
 * The server therefore only ever stores ciphertext and cannot read attendance records.
 */

const PBKDF2_ITERATIONS = 310000;
const APP_SALT = 'task-dashboard-attendance:v1:';

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Derive { authKey (hex), encKey (CryptoKey) } from username and password. */
export async function deriveKeys(username, password) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(APP_SALT + username.toLowerCase()),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    base,
    512
  );
  const bytes = new Uint8Array(bits);
  const authKey = toHex(bytes.slice(0, 32));
  const encKey = await crypto.subtle.importKey('raw', bytes.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { authKey, encKey };
}

/** Encrypt a JSON-serialisable value. Output is base64(iv || ciphertext). */
export async function encryptData(encKey, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return toB64(out);
}

/** Decrypt a blob produced by encryptData. Throws if the key is wrong or data was altered. */
export async function decryptData(encKey, blob) {
  const bytes = fromB64(blob);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encKey, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}
