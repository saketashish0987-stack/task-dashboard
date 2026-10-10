import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createEmptyPeriod, addPerson as addPersonRule, applyEvent, canRoster as canRosterRule, generateAnonymousId, resetPeriod as resetPeriodRule } from '../features/attendance/attendanceRules.mjs';
import { deriveKeys, encryptData, decryptData } from '../features/attendance/crypto.mjs';

// Everything here lives in memory only. Nothing is written to localStorage, so
// closing the tab signs you out and leaves no readable data on the device.

const AttendanceContext = createContext(null);
export const useAttendanceContext = () => useContext(AttendanceContext);

// In the Android app the page is served locally, so the API needs an absolute address.
// On the web, leave VITE_API_BASE empty and the Vite dev proxy forwards /api.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return { status: 204 };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.version = data.version;
    throw err;
  }
  return data;
};

export const AttendanceProvider = ({ children }) => {
  const [session, setSession] = useState(null); // { username, token, encKey }
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState('');

  // Refs mirror state so queued writes always see the latest version.
  const periodRef = useRef(null);
  const versionRef = useRef(0);
  const sessionRef = useRef(null);

  const applyRemote = useCallback(async (data, encKey) => {
    const p = data.blob ? (await decryptData(encKey, data.blob)).period : createEmptyPeriod();
    versionRef.current = data.version;
    periodRef.current = p;
    setPeriod(p);
  }, []);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    periodRef.current = null;
    versionRef.current = 0;
    setSession(null);
    setPeriod(null);
  }, []);

  const login = useCallback(async (username, password, { register = false, inviteCode = '' } = {}) => {
    setError('');
    try {
      const { authKey, encKey } = await deriveKeys(username, password);
      if (register) {
        await api('/auth/register', { method: 'POST', body: { username, authKey, inviteCode } });
      }
      const { token } = await api('/auth/login', { method: 'POST', body: { username, authKey } });
      const data = await api('/data', { token });
      await applyRemote(data, encKey);
      const s = { username, token, encKey };
      sessionRef.current = s;
      setSession(s);
    } catch (err) {
      setError(err.message);
    }
  }, [applyRemote]);

  const logout = useCallback(async () => {
    const s = sessionRef.current;
    if (s) await api('/auth/logout', { method: 'POST', token: s.token }).catch(() => {});
    clearSession();
  }, [clearSession]);

  /**
   * Apply a change to the period, encrypt it and save it. If another device saved
   * first (version conflict), reload the latest data and reapply the change once.
   */
  const commit = useCallback(async (makeNext) => {
    const s = sessionRef.current;
    if (!s) return null;
    setError('');
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const next = makeNext(periodRef.current);
        const blob = await encryptData(s.encKey, { period: next });
        try {
          const res = await api('/data', {
            method: 'PUT',
            body: { blob, version: versionRef.current },
            token: s.token,
          });
          versionRef.current = res.version;
          periodRef.current = next;
          setPeriod(next);
          return next;
        } catch (err) {
          if (err.status !== 409) throw err;
          await applyRemote(await api('/data', { token: s.token }), s.encKey);
        }
      }
      throw new Error('Could not save. Please try again.');
    } catch (err) {
      if (err.status === 401) clearSession();
      setError(err.message);
      return null;
    }
  }, [applyRemote, clearSession]);

  const addPerson = useCallback(() => {
    const id = generateAnonymousId(Object.keys(periodRef.current?.people || {}));
    commit((p) => addPersonRule(p, id));
    return id;
  }, [commit]);

  const recordEvent = useCallback((id, type) => commit((p) => applyEvent(p, id, type)), [commit]);

  const resetPeriod = useCallback((label) => commit((p) => resetPeriodRule(p, label)), [commit]);

  const canRoster = useCallback((id) => canRosterRule(periodRef.current || createEmptyPeriod(), id), []);

  /** Permanently delete this account and all of its encrypted data on the server. */
  const deleteAllData = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      await api('/account', { method: 'DELETE', token: s.token });
    } catch (err) {
      setError(err.message);
      return;
    }
    clearSession();
  }, [clearSession]);

  return (
    <AttendanceContext.Provider
      value={{
        isLoggedIn: Boolean(session),
        username: session?.username ?? null,
        period,
        error,
        login,
        logout,
        addPerson,
        recordEvent,
        resetPeriod,
        canRoster,
        deleteAllData,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
};
