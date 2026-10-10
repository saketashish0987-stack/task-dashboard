// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deriveKeys, encryptData, decryptData } from './crypto.mjs';

describe('attendance crypto', () => {
  it('derives a stable authKey and a different one per password', async () => {
    const a = await deriveKeys('alice', 'correct horse');
    const b = await deriveKeys('alice', 'correct horse');
    const c = await deriveKeys('alice', 'other password');
    expect(a.authKey).toMatch(/^[0-9a-f]{64}$/);
    expect(a.authKey).toBe(b.authKey);
    expect(a.authKey).not.toBe(c.authKey);
  });

  it('round-trips data and never contains the plaintext', async () => {
    const { encKey } = await deriveKeys('alice', 'pw-12345678');
    const blob = await encryptData(encKey, { period: { label: 'Week 1', people: { 'P-0001': { x: 1 } } } });
    expect(blob).not.toContain('P-0001');
    expect(blob).not.toContain('Week 1');
    const out = await decryptData(encKey, blob);
    expect(out.period.people['P-0001']).toEqual({ x: 1 });
  });

  it('cannot be decrypted with another password', async () => {
    const good = await deriveKeys('alice', 'pw-12345678');
    const bad = await deriveKeys('alice', 'wrong-password');
    const blob = await encryptData(good.encKey, { ok: true });
    await expect(decryptData(bad.encKey, blob)).rejects.toThrow();
  });
});
