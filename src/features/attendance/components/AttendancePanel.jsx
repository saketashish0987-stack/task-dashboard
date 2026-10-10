import React, { useState } from 'react';
import { useAttendanceContext } from '../../../context/AttendanceContext';
import { EVENT_TYPES, MAX_NO_SHOWS, totalNoShows } from '../attendanceRules.mjs';
import { periodToCsv, downloadCsv } from '../attendanceExport.mjs';

const EVENT_TYPE_LABELS = {
  [EVENT_TYPES.DROP]: 'Drop no-show',
  [EVENT_TYPES.PICKUP]: 'Pickup no-show',
  [EVENT_TYPES.ATTENDED]: 'Attended',
};

const LoginForm = ({ onLogin, error }) => {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onLogin(username, password, { register: mode === 'register', inviteCode });
    setBusy(false);
    setPassword('');
  };

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3" data-testid="attendance-login">
      <h2 className="text-xl font-semibold text-neutral-800">
        {mode === 'login' ? 'Sign in to manage attendance' : 'Create an account'}
      </h2>
      <input className="w-full border rounded-lg px-3 py-2" placeholder="Username" autoComplete="username"
        value={username} onChange={(e) => setUsername(e.target.value)} required />
      <input className="w-full border rounded-lg px-3 py-2" type="password" placeholder="Password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === 'register' ? 8 : undefined} required />
      {mode === 'register' && (
        <input className="w-full border rounded-lg px-3 py-2" placeholder="Invite code"
          value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-lg">
        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      <button type="button" className="text-sm text-neutral-600 underline"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Create an account instead' : 'Back to sign in'}
      </button>
    </form>
  );
};

const EventLog = ({ events }) => (
  <details className="w-full" data-testid="event-log">
    <summary className="text-xs text-neutral-500 cursor-pointer select-none">
      Event log ({events.length})
    </summary>
    <ul className="mt-1 ml-4 space-y-0.5">
      {[...events].reverse().map((ev, i) => (
        <li key={events.length - i} className="text-xs text-neutral-600">
          {EVENT_TYPE_LABELS[ev.type] || ev.type}
          {ev.ts != null && <span className="text-neutral-400"> · {new Date(ev.ts).toLocaleString()}</span>}
        </li>
      ))}
    </ul>
  </details>
);

const HistorySection = ({ history }) => (
  <div className="mt-6 border-t border-neutral-200 pt-4" data-testid="period-history">
    <h3 className="text-sm font-semibold text-neutral-800 mb-2">Previous periods</h3>
    <div className="space-y-2">
      {[...history].reverse().map((period, i) => {
        const ids = Object.keys(period.people || {});
        return (
          <details key={`${period.label}-${i}`} className="text-sm">
            <summary className="cursor-pointer select-none text-neutral-700">
              {period.label}
              <span className="text-neutral-400">
                {' · '}{ids.length} anonymous ID{ids.length === 1 ? '' : 's'}
                {period.endedAt ? ` · ended ${new Date(period.endedAt).toLocaleDateString()}` : ''}
              </span>
            </summary>
            <ul className="mt-1 ml-4 space-y-0.5">
              {ids.map((id) => {
                const p = period.people[id];
                const total = (p.drop || 0) + (p.pickup || 0);
                return (
                  <li key={id} className="text-xs text-neutral-600">
                    <span className="font-mono">{id}</span>
                    {' — drop '}{p.drop || 0}{', pickup '}{p.pickup || 0}{', attended '}{p.attended || 0}
                    {p.blocked
                      ? <span className="text-red-600"> · blocked ({total}/{MAX_NO_SHOWS})</span>
                      : <span className="text-green-600"> · ok</span>}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  </div>
);

const AttendancePanel = () => {
  const { isLoggedIn, period, error, login, logout, addPerson, recordEvent, undoLast, resetPeriod, canRoster, deleteAllData } =
    useAttendanceContext();
  const [rosterResult, setRosterResult] = useState({});

  if (!isLoggedIn) {
    return (
      <section className="mb-6 bg-white rounded-2xl shadow-soft p-6" data-testid="attendance-panel">
        <LoginForm onLogin={login} error={error} />
      </section>
    );
  }

  const ids = period ? Object.keys(period.people) : [];

  const handleDeleteAll = async () => {
    if (!window.confirm('Permanently delete all your attendance data from the server? This cannot be undone.')) return;
    setRosterResult({});
    await deleteAllData();
  };

  const handleExportCsv = () => {
    if (!period) return;
    const name = (period.label || 'period').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadCsv(periodToCsv(period), `attendance-${name || 'period'}.csv`);
  };

  return (
    <section className="mb-6 bg-white rounded-2xl shadow-soft p-6" data-testid="attendance-panel">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-800">Attendance</h2>
          <p className="text-sm text-neutral-500">
            {period?.label}. Anonymous IDs only. {MAX_NO_SHOWS} no-shows (drop + pickup) blocks rostering.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="py-2 px-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm"
            onClick={() => addPerson()} data-testid="add-anon-person">Add anonymous ID</button>
          <button type="button" className="py-2 px-3 border rounded-lg text-sm"
            onClick={handleExportCsv} data-testid="export-csv">Export CSV</button>
          <button type="button" className="py-2 px-3 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-lg text-sm"
            onClick={() => { setRosterResult({}); resetPeriod(); }} data-testid="reset-period">Start new period</button>
          <button type="button" className="py-2 px-3 border rounded-lg text-sm" onClick={logout} data-testid="logout">Sign out</button>
          <button type="button" className="py-2 px-3 border border-red-300 text-red-700 rounded-lg text-sm"
            onClick={handleDeleteAll} data-testid="delete-all">Delete all my data</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 mb-3" role="alert">{error}</p>}

      {!period ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : ids.length === 0 ? (
        <p className="text-neutral-500 text-sm">No anonymous IDs yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {ids.map((id) => {
            const person = period.people[id];
            const total = totalNoShows(person);
            const result = rosterResult[id];
            const events = person.events || [];
            return (
              <li key={id} className="py-3 flex flex-wrap items-center gap-3" data-testid={`person-${id}`}>
                <span className="font-mono font-semibold text-neutral-800 w-24">{id}</span>
                <span className="text-sm text-neutral-600">
                  Drop no-shows: {person.noShows.drop} · Pickup no-shows: {person.noShows.pickup} · Attended: {person.attended}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${person.blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
                  data-testid={`status-${id}`}>
                  {person.blocked ? `Blocked (${total}/${MAX_NO_SHOWS})` : `OK (${total}/${MAX_NO_SHOWS})`}
                </span>
                <div className="flex flex-wrap gap-2 ml-auto">
                  <button type="button" className="py-1 px-2 border rounded text-sm" onClick={() => recordEvent(id, EVENT_TYPES.DROP)}>+ Drop no-show</button>
                  <button type="button" className="py-1 px-2 border rounded text-sm" onClick={() => recordEvent(id, EVENT_TYPES.PICKUP)}>+ Pickup no-show</button>
                  <button type="button" className="py-1 px-2 border rounded text-sm" onClick={() => recordEvent(id, EVENT_TYPES.ATTENDED)}>+ Attended</button>
                  <button type="button" className="py-1 px-2 border rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={events.length === 0}
                    onClick={() => undoLast(id)} data-testid={`undo-${id}`}>Undo last</button>
                  <button type="button" className="py-1 px-2 bg-neutral-800 text-white rounded text-sm"
                    onClick={() => setRosterResult((prev) => ({ ...prev, [id]: canRoster(id) }))}>Check roster</button>
                </div>
                <div className="w-full">
                  {events.length > 0 && <EventLog events={events} />}
                  {result && (
                    <p className={`text-sm ${result.allowed ? 'text-green-700' : 'text-red-700'}`} data-testid={`roster-result-${id}`}>
                      {result.allowed ? 'Allowed to roster' : result.reason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {period?.history?.length > 0 && <HistorySection history={period.history} />}
    </section>
  );
};

export default AttendancePanel;
