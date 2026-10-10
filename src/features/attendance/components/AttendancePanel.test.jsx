import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AttendancePanel from './AttendancePanel.jsx';
import { AttendanceContext } from '../../../context/AttendanceContext';
import { downloadCsv } from '../attendanceExport.mjs';

vi.mock('../attendanceExport.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, downloadCsv: vi.fn() };
});

const basePeriod = {
  label: 'Current period',
  history: [
    {
      label: 'Week 1',
      endedAt: '2026-01-02T00:00:00Z',
      people: { 'P-AAAA': { drop: 3, pickup: 0, attended: 2, blocked: true } },
    },
  ],
  people: {
    'P-0001': {
      noShows: { drop: 1, pickup: 0 },
      attended: 2,
      blocked: false,
      events: [
        { type: 'drop', ts: 1765000000000 },
        { type: 'attended', ts: null },
      ],
    },
    'P-0002': { noShows: { drop: 0, pickup: 0 }, attended: 0, blocked: false, events: [] },
  },
};

const renderPanel = (overrides = {}) => {
  const value = {
    isLoggedIn: true,
    username: 'tester',
    period: basePeriod,
    error: '',
    login: vi.fn(),
    logout: vi.fn(),
    addPerson: vi.fn(),
    recordEvent: vi.fn(),
    undoLast: vi.fn(),
    resetPeriod: vi.fn(),
    canRoster: () => ({ allowed: true, reason: '' }),
    deleteAllData: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <AttendanceContext.Provider value={value}>
      <AttendancePanel />
    </AttendanceContext.Provider>
  );
  return { value, ...utils };
};

describe('AttendancePanel (logged in)', () => {
  it('calls undoLast for the right person', () => {
    const { value } = renderPanel();
    fireEvent.click(screen.getByTestId('undo-P-0001'));
    expect(value.undoLast).toHaveBeenCalledWith('P-0001');
  });

  it('disables undo for people without an event log', () => {
    renderPanel();
    expect(screen.getByTestId('undo-P-0002')).toBeDisabled();
    expect(screen.getByTestId('undo-P-0001')).toBeEnabled();
  });

  it('shows the per-person event log with friendly labels', () => {
    renderPanel();
    const log = screen.getByTestId('event-log');
    expect(log).toHaveTextContent('Event log (2)');
    expect(log).toHaveTextContent('Attended');
    expect(log).toHaveTextContent('Drop no-show');
  });

  it('downloads a CSV of the current period', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('export-csv'));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [csv, filename] = downloadCsv.mock.calls[0];
    expect(csv).toContain('P-0001,1,0,1,2,ok');
    expect(filename).toBe('attendance-current-period.csv');
  });

  it('lists previous periods from history with final counts', () => {
    renderPanel();
    const history = screen.getByTestId('period-history');
    expect(history).toHaveTextContent('Week 1');
    expect(history).toHaveTextContent('1 anonymous ID');
    expect(history).toHaveTextContent('P-AAAA');
    expect(history).toHaveTextContent('blocked (3/3)');
  });
});
