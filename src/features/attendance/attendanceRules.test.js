import { describe, it, expect } from 'vitest';
import {
  createEmptyPeriod, addPerson, applyEvent, canRoster, resetPeriod,
  generateAnonymousId, MAX_NO_SHOWS,
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
