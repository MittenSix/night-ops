import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAINING_SCHEMA_VERSION,
  createTrainingStore,
  hasTrainingProgress,
  loadLegacyTrainingCache,
  mergeTrainingStates,
  migrateTrainingState
} from '../../src/core/store.js';

test('migrates prototype state into the current durable shape', () => {
  const migrated = migrateTrainingState({ packing: { 1: true }, practice: null });
  assert.equal(migrated.schemaVersion, TRAINING_SCHEMA_VERSION);
  assert.deepEqual(migrated.packing, { 1: true });
  assert.deepEqual(migrated.practice, {});
});

test('merges completion progress without losing work from either device', () => {
  const { state, conflicts } = mergeTrainingStates(
    { packing: { 1: true }, practice: { 'ropes-0': { 0: true } }, currentLesson: { ropes: 2 } },
    { packing: { 2: true }, practice: { 'ropes-0': { 1: true } }, currentLesson: { ropes: 1 } }
  );
  assert.deepEqual(state.packing, { 1: true, 2: true });
  assert.deepEqual(state.practice['ropes-0'], { 0: true, 1: true });
  assert.equal(state.currentLesson.ropes, 2);
  assert.deepEqual(conflicts, []);
});

test('reports competing reflection edits instead of silently overwriting them', () => {
  const { state, conflicts } = mergeTrainingStates(
    { reflections: { goal: 'Practice bearings' } },
    { reflections: { goal: 'Review knots' } }
  );
  assert.equal(state.reflections.goal, 'Review knots');
  assert.equal(conflicts[0].field, 'reflections.goal');
});

test('publishes immutable snapshots to subscribers', () => {
  const store = createTrainingStore();
  let notification;
  store.subscribe((state, reason) => { notification = { state, reason }; });
  store.update(state => { state.packing[0] = true; }, 'pack-item');
  notification.state.packing[0] = false;
  assert.equal(store.getState().packing[0], true);
  assert.equal(notification.reason, 'pack-item');
});

test('loads corrupt browser cache safely and detects real progress', () => {
  const storage = { getItem: () => '{bad json' };
  assert.equal(hasTrainingProgress(loadLegacyTrainingCache(storage)), false);
  assert.equal(hasTrainingProgress({ reflections: { goal: 'Practice' } }), true);
});
