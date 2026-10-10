/**
 * Pure rules for anonymous no-show tracking.
 *
 * Privacy: a person is only ever identified by an opaque ID (e.g. "P-7F3A").
 * No names, phone numbers or other personal data are stored.
 */

export const MAX_NO_SHOWS = 3;

/** How many completed periods are kept in `history`. */
export const MAX_PERIOD_HISTORY = 12;

export const EVENT_TYPES = {
  DROP: 'drop',
  PICKUP: 'pickup',
  ATTENDED: 'attended',
};

export const createEmptyPeriod = (label = 'Current period') => ({
  label,
  people: {}, // { [id]: { noShows: { drop, pickup }, attended, blocked, events: [{ type, ts }] } }
  // Completed periods, oldest first:
  // { label, endedAt, people: { [id]: { drop, pickup, attended, blocked } } }
  history: [],
});

const emptyPerson = () => ({
  noShows: { drop: 0, pickup: 0 },
  attended: 0,
  blocked: false,
  events: [],
});

/** Total no-shows across drop and pickup. */
export const totalNoShows = (person) =>
  (person?.noShows?.drop || 0) + (person?.noShows?.pickup || 0);

/** Generate an anonymous ID that does not collide with existing ones. */
export const generateAnonymousId = (existingIds = [], random = Math.random) => {
  for (let i = 0; i < 100; i += 1) {
    const id = 'P-' + Math.floor(random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    if (!existingIds.includes(id)) return id;
  }
  throw new Error('Could not generate a unique anonymous ID');
};

/**
 * Apply one attendance event to a period. Returns a new period object.
 * The event is also appended to the person's `events` log (with an optional
 * timestamp) so mistakes can be reviewed and undone. Once a person reaches
 * MAX_NO_SHOWS (drop + pickup combined) they are blocked from rostering for
 * the rest of the period.
 */
export const applyEvent = (period, personId, type, ts = null) => {
  if (!Object.values(EVENT_TYPES).includes(type)) {
    throw new Error(`Unknown event type: ${type}`);
  }
  const current = period.people[personId];
  if (!current) throw new Error(`Unknown person: ${personId}`);

  const person = {
    ...emptyPerson(),
    ...current,
    noShows: { ...emptyPerson().noShows, ...current.noShows },
    events: [...(current.events || []), { type, ts }],
  };

  if (type === EVENT_TYPES.ATTENDED) {
    person.attended += 1;
  } else {
    person.noShows[type] += 1;
  }
  person.blocked = totalNoShows(person) >= MAX_NO_SHOWS;

  return {
    ...period,
    people: { ...period.people, [personId]: person },
  };
};

/**
 * Remove the most recently logged event for a person and update their
 * counters accordingly. Undoing a no-show can unblock a person whose total
 * falls back below the limit. Returns the period unchanged if the person has
 * no event log yet (e.g. data saved before event logs existed).
 */
export const undoLastEvent = (period, personId) => {
  const person = period.people[personId];
  if (!person) throw new Error(`Unknown person: ${personId}`);

  const events = person.events || [];
  if (events.length === 0) return period;

  const last = events[events.length - 1];
  const noShows = {
    drop: Math.max(0, (person.noShows?.drop || 0) - (last.type === EVENT_TYPES.DROP ? 1 : 0)),
    pickup: Math.max(0, (person.noShows?.pickup || 0) - (last.type === EVENT_TYPES.PICKUP ? 1 : 0)),
  };
  const attended = Math.max(0, (person.attended || 0) - (last.type === EVENT_TYPES.ATTENDED ? 1 : 0));

  return {
    ...period,
    people: {
      ...period.people,
      [personId]: {
        ...person,
        noShows,
        attended,
        blocked: noShows.drop + noShows.pickup >= MAX_NO_SHOWS,
        events: events.slice(0, -1),
      },
    },
  };
};

export const addPerson = (period, personId) => {
  if (period.people[personId]) return period;
  return { ...period, people: { ...period.people, [personId]: emptyPerson() } };
};

/** Returns { allowed, reason } for rostering this person. */
export const canRoster = (period, personId) => {
  const person = period.people[personId];
  if (!person) return { allowed: false, reason: 'Unknown person' };
  if (person.blocked || totalNoShows(person) >= MAX_NO_SHOWS) {
    return {
      allowed: false,
      reason: `Blocked: ${totalNoShows(person)} no-shows this period (limit ${MAX_NO_SHOWS})`,
    };
  }
  return { allowed: true, reason: '' };
};

/**
 * Start a fresh period, keeping the same anonymous IDs with counts reset.
 * If the period being finished had people, it is archived into `history`
 * (capped at MAX_PERIOD_HISTORY entries) so past periods can be reviewed.
 */
export const resetPeriod = (period, label, endedAt = null) => {
  const people = {};
  Object.keys(period.people).forEach((id) => {
    people[id] = emptyPerson();
  });

  let history = period.history || [];
  if (Object.keys(period.people).length > 0) {
    const archived = {
      label: period.label,
      endedAt,
      people: Object.fromEntries(
        Object.entries(period.people).map(([id, p]) => [
          id,
          {
            drop: p.noShows?.drop || 0,
            pickup: p.noShows?.pickup || 0,
            attended: p.attended || 0,
            blocked: Boolean(p.blocked),
          },
        ])
      ),
    };
    history = [...history, archived].slice(-MAX_PERIOD_HISTORY);
  }

  return { label: label || period.label, people, history };
};
