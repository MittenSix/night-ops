export const TRAINING_SCHEMA_VERSION = 2;

export function emptyTrainingState() {
  return {
    schemaVersion: TRAINING_SCHEMA_VERSION,
    packing: {},
    practice: {},
    currentLesson: {},
    reflections: {}
  };
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function migrateTrainingState(value) {
  const source = record(value);
  return {
    schemaVersion: TRAINING_SCHEMA_VERSION,
    packing: record(source.packing),
    practice: Object.fromEntries(
      Object.entries(record(source.practice)).map(([key, rounds]) => [key, record(rounds)])
    ),
    currentLesson: record(source.currentLesson),
    reflections: record(source.reflections)
  };
}

export function hasTrainingProgress(value) {
  const state = migrateTrainingState(value);
  return ['packing', 'practice', 'currentLesson', 'reflections']
    .some(key => Object.keys(state[key]).length > 0);
}

export function mergeTrainingStates(localValue, remoteValue) {
  const local = migrateTrainingState(localValue);
  const remote = migrateTrainingState(remoteValue);
  const conflicts = [];

  const packing = { ...remote.packing };
  for (const [key, checked] of Object.entries(local.packing)) {
    packing[key] = Boolean(checked || remote.packing[key]);
  }

  const practice = structuredClone(remote.practice);
  for (const [lesson, rounds] of Object.entries(local.practice)) {
    practice[lesson] = { ...(practice[lesson] || {}), ...rounds };
  }

  const currentLesson = { ...remote.currentLesson };
  for (const [skill, lesson] of Object.entries(local.currentLesson)) {
    currentLesson[skill] = Math.max(Number(lesson) || 0, Number(remote.currentLesson[skill]) || 0);
  }

  const reflections = { ...remote.reflections };
  for (const [key, localText] of Object.entries(local.reflections)) {
    const remoteText = remote.reflections[key];
    if (localText && remoteText && localText !== remoteText) {
      conflicts.push({ field: `reflections.${key}`, local: localText, remote: remoteText });
      continue;
    }
    if (localText) reflections[key] = localText;
  }

  return {
    state: { schemaVersion: TRAINING_SCHEMA_VERSION, packing, practice, currentLesson, reflections },
    conflicts
  };
}

export function createTrainingStore(initialValue = emptyTrainingState()) {
  let state = migrateTrainingState(initialValue);
  const listeners = new Set();

  function emit(reason) {
    const snapshot = structuredClone(state);
    for (const listener of listeners) listener(snapshot, reason);
  }

  return {
    getState: () => structuredClone(state),
    replace(nextState, reason = 'replace') {
      state = migrateTrainingState(nextState);
      emit(reason);
    },
    update(recipe, reason = 'update') {
      const draft = structuredClone(state);
      recipe(draft);
      state = migrateTrainingState(draft);
      emit(reason);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export function loadLegacyTrainingCache(storage) {
  try {
    return migrateTrainingState(JSON.parse(storage.getItem('nightOpsState') || '{}'));
  } catch {
    return emptyTrainingState();
  }
}
