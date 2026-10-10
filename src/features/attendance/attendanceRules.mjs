/**
 * Pure rules for anonymous no-show tracking.
 *
 * Privacy: a person is only ever identified by an opaque ID (e.g. "P-7F3A").
 * No names, phone numbers or other personal data are stored.
 */

export const MAX_NO_SHOWS = 3;

export const EVENT_TYPES = {
  DROP: 'drop',
  PICKUP: 'pickup',
  ATTENDED: 'attended',
};

export const createEmptyPeriod = (label = 'Current period') => ({
  label,
  people: {}, // { [id]: { noShows: { drop, pickup }, attended, blocked } }
});

const emptyPerson = () => ({
  noShows: { drop: 0, pickup: 0 },
  attended: 0,
  blocked: false,
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
 * Once a person reaches MAX_NO_SHOWS (drop + pickup combined) they are
 * blocked from rostering for the rest of the period.
 */
export const applyEvent = (period, personId, type) => {
  if (!Object.values(EVENT_TYPES).includes(type)) {
    throw new Error(`Unknown event type: ${type}`);
  }
  const current = period.people[personId];
  if (!current) throw new Error(`Unknown person: ${personId}`);

  const person = {
    ...emptyPerson(),
    ...current,
    noShows: { ...emptyPerson().noShows, ...current.noShows },
  };

  if (type === EVENT_TYPES.ATTENDED) {
    person.attended += 1;
  } else {
    person.noShows[type] += 1;
    if (totalNoShows(person) >= MAX_NO_SHOWS) person.blocked = true;
  }

  return {
    ...period,
    people: { ...period.people, [personId]: person },
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

/** Start a fresh period, keeping the same anonymous IDs with counts reset. */
export const resetPeriod = (period, label) => {
  const people = {};
  Object.keys(period.people).forEach((id) => {
    people[id] = emptyPerson();
  });
  return { label: label || period.label, people };
};
