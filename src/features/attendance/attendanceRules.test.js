import { describe, it, expect } from 'vitest';
import {
  createEmptyPeriod, addPerson, applyEvent, canRoster, resetPeriod,
  generateAnonymousId, undoLastEvent, MAX_NO_SHOWS, MAX_PERIOD_HISTORY,
} from './attendanceRules.mjs';

const base = () => addPerson(createEmptyPeriod(), 'P-0001');

describe('attendance rules', () => {
  it('counts drop and pickup no-shows together toward the limit', () => {
    let p = base();
    p = applyEvent(p, 'P-0001', 'drop');
    p = applyEvent(p, 'P-0001', 'pickup');
    expect(canRoster(p, 'P-0001').allowed).toBe(true);
    p = applyEvent(p, 'P-0001', 'drop');
    expect(MAX_NO_SHOWS).toBe(3);
    expect(canRoster(p, 'P-0001').allowed).toBe(false);
    expect(canRoster(p, 'P-0001').reason).toMatch(/3 no-shows/);
  });

  it('attended events do not count toward the limit', () => {
    let p = base();
    p = applyEvent(p, 'P-0001', 'drop');
    p = applyEvent(p, 'P-0001', 'attended');
    p = applyEvent(p, 'P-0001', 'attended');
    p = applyEvent(p, 'P-0001', 'attended');
    expect(canRoster(p, 'P-0001').allowed).toBe(true);
    expect(p.people['P-0001'].attended).toBe(3);
  });

  it('does not mutate the previous period', () => {
    const before = base();
    applyEvent(before, 'P-0001', 'pickup');
    expect(before.people['P-0001'].noShows.pickup).toBe(0);
  });

  it('rejects unknown people and event types', () => {
    const p = base();
    expect(() => applyEvent(p, 'P-9999', 'drop')).toThrow();
    expect(() => applyEvent(p, 'P-0001', 'lunch')).toThrow();
    expect(canRoster(p, 'P-9999').allowed).toBe(false);
  });

  it('a new period clears blocks but keeps anonymous IDs', () => {
    let p = base();
    for (let i = 0; i < 3; i += 1) p = applyEvent(p, 'P-0001', 'drop');
    expect(canRoster(p, 'P-0001').allowed).toBe(false);
    const next = resetPeriod(p, 'Week 42');
    expect(next.label).toBe('Week 42');
    expect(canRoster(next, 'P-0001').allowed).toBe(true);
    expect(Object.keys(next.people)).toEqual(['P-0001']);
  });

  it('generates IDs that do not collide with existing ones', () => {
    const seq = [0, 0, 0.5];
    let i = 0;
    const random = () => seq[Math.min(i++, seq.length - 1)];
    const first = generateAnonymousId([], random);
    const second = generateAnonymousId([first], random);
    expect(second).not.toBe(first);
    expect(first).toMatch(/^P-[0-9A-F]{4}$/);
  });
});

describe('event logs', () => {
  it('records each event in the person log with its timestamp', () => {
    let p = base();
    p = applyEvent(p, 'P-0001', 'drop', 1765000000000);
    p = applyEvent(p, 'P-0001', 'attended');
    expect(p.people['P-0001'].events).toEqual([
      { type: 'drop', ts: 1765000000000 },
      { type: 'attended', ts: null },
    ]);
  });

  it('undo removes the last event and updates the counters', () => {
    let p = base();
    p = applyEvent(p, 'P-0001', 'drop');
    p = applyEvent(p, 'P-0001', 'attended');
    const next = undoLastEvent(p, 'P-0001');
    expect(next.people['P-0001'].attended).toBe(0);
    expect(next.people['P-0001'].noShows).toEqual({ drop: 1, pickup: 0 });
    expect(next.people['P-0001'].events).toHaveLength(1);
  });

  it('undo unblocks a person whose total falls below the limit', () => {
    let p = base();
    p = applyEvent(p, 'P-0001', 'drop');
    p = applyEvent(p, 'P-0001', 'pickup');
    p = applyEvent(p, 'P-0001', 'drop');
    expect(canRoster(p, 'P-0001').allowed).toBe(false);
    const next = undoLastEvent(p, 'P-0001');
    expect(next.people['P-0001'].noShows).toEqual({ drop: 1, pickup: 1 });
    expect(next.people['P-0001'].blocked).toBe(false);
    expect(canRoster(next, 'P-0001').allowed).toBe(true);
  });

  it('undo does not mutate the previous period', () => {
    let p = base();
    p = applyEvent(p, 'P-0001', 'drop');
    const next = undoLastEvent(p, 'P-0001');
    expect(p.people['P-0001'].noShows.drop).toBe(1);
    expect(p.people['P-0001'].events).toHaveLength(1);
    expect(next.people['P-0001'].noShows.drop).toBe(0);
    expect(next.people['P-0001'].events).toHaveLength(0);
  });

  it('undo is a no-op for legacy data without an event log', () => {
    const legacy = {
      label: 'Old',
      people: { 'P-0001': { noShows: { drop: 1, pickup: 0 }, attended: 2, blocked: false } },
      history: [],
    };
    expect(undoLastEvent(legacy, 'P-0001')).toBe(legacy);
  });

  it('undo rejects unknown people', () => {
    expect(() => undoLastEvent(base(), 'P-9999')).toThrow();
  });
});

describe('period history', () => {
  it('resetPeriod archives the finished period into history', () => {
    let p = base();
    p = applyEvent(p, 'P-0001', 'drop');
    p = applyEvent(p, 'P-0001', 'attended');
    const next = resetPeriod(p, 'Week 42', '2026-01-02T00:00:00Z');
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toEqual({
      label: 'Current period',
      endedAt: '2026-01-02T00:00:00Z',
      people: { 'P-0001': { drop: 1, pickup: 0, attended: 1, blocked: false } },
    });
  });

  it('archives blocked people with their final counts', () => {
    let p = base();
    for (let i = 0; i < 3; i += 1) p = applyEvent(p, 'P-0001', 'drop');
    const next = resetPeriod(p, 'Next');
    expect(next.history[0].people['P-0001']).toEqual({ drop: 3, pickup: 0, attended: 0, blocked: true });
  });

  it('does not archive a period with no people', () => {
    const p = createEmptyPeriod('Empty');
    const next = resetPeriod(p, 'Next');
    expect(next.history).toEqual([]);
  });

  it('caps history at MAX_PERIOD_HISTORY entries', () => {
    let p = base();
    for (let i = 1; i <= 15; i += 1) p = resetPeriod(p, `Week ${i}`);
    expect(p.history).toHaveLength(MAX_PERIOD_HISTORY);
    // The oldest archived period was 'Current period'; after 15 resets the
    // oldest entry still kept is 'Week 3'.
    expect(p.history[0].label).toBe('Week 3');
    expect(p.history[p.history.length - 1].label).toBe('Week 14');
  });

  it('createEmptyPeriod starts with an empty history', () => {
    expect(createEmptyPeriod()).toEqual({ label: 'Current period', people: {}, history: [] });
  });
});
