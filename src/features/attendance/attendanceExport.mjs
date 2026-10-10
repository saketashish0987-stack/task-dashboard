import { totalNoShows } from './attendanceRules.mjs';

/**
 * Serialize a period to CSV — one row per anonymous ID, so the result can be
 * pasted straight into a spreadsheet. Only anonymous IDs are included, by
 * design.
 */
export const periodToCsv = (period) => {
  const header = 'id,drop_no_shows,pickup_no_shows,total_no_shows,attended,status';
  const rows = Object.entries(period?.people || {}).map(([id, person]) =>
    [
      id,
      person?.noShows?.drop || 0,
      person?.noShows?.pickup || 0,
      totalNoShows(person),
      person?.attended || 0,
      person?.blocked ? 'blocked' : 'ok',
    ].join(',')
  );
  return [header, ...rows].join('\n') + '\n';
};

/** Trigger a client-side file download (nothing is uploaded anywhere). */
export const downloadCsv = (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
