import { describe, it, expect } from 'vitest';
import { periodToCsv } from './attendanceExport.mjs';
import { createEmptyPeriod, addPerson, applyEvent } from './attendanceRules.mjs';

describe('periodToCsv', () => {
  it('exports one row per person with counts and status', () => {
    let p = addPerson(createEmptyPeriod(), 'P-0001');
    p = addPerson(p, 'P-0002');
    p = applyEvent(p, 'P-0001', 'drop');
    p = applyEvent(p, 'P-0001', 'drop');
    p = applyEvent(p, 'P-0002', 'drop');
    p = applyEvent(p, 'P-0002', 'drop');
    p = applyEvent(p, 'P-0002', 'pickup');
    p = applyEvent(p, 'P-0002', 'attended');

    const lines = periodToCsv(p).trim().split('\n');
    expect(lines[0]).toBe('id,drop_no_shows,pickup_no_shows,total_no_shows,attended,status');
    expect(lines).toContain('P-0001,2,0,2,0,ok');
    expect(lines).toContain('P-0002,2,1,3,1,blocked');
  });

  it('exports only the header for an empty period', () => {
    expect(periodToCsv(createEmptyPeriod())).toBe(
      'id,drop_no_shows,pickup_no_shows,total_no_shows,attended,status\n'
    );
  });

  it('handles legacy people without an event log', () => {
    const p = {
      label: 'Old',
      people: { 'P-0001': { noShows: { drop: 1, pickup: 0 }, attended: 0, blocked: false } },
      history: [],
    };
    const lines = periodToCsv(p).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('P-0001,1,0,1,0,ok');
  });
});
