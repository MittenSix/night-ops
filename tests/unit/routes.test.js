import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPreviewRoute, normalizeRoute, resolveRoute, routeTitle } from '../../src/core/routes.js';
import { historyAction, routeFromLocation } from '../../src/core/router.js';

test('normalizes empty and unknown locations to home', () => {
  assert.equal(normalizeRoute(''), 'home');
  assert.equal(normalizeRoute('#not-a-route'), 'home');
  assert.equal(routeFromLocation({ hash: '#packing' }), 'packing');
});

test('keeps public pages available to signed-out visitors', () => {
  assert.deepEqual(resolveRoute('home', false), {
    requested: 'home', rendered: 'home', preview: false, intended: null
  });
  assert.equal(resolveRoute('about', false).rendered, 'about');
  assert.equal(resolveRoute('privacy', false).rendered, 'privacy');
  assert.equal(resolveRoute('settings', false).rendered, 'settings');
});

test('turns protected routes into previews and remembers the destination', () => {
  assert.deepEqual(resolveRoute('training', false), {
    requested: 'training', rendered: 'access', preview: true, intended: 'training'
  });
  assert.equal(canonicalPreviewRoute('skill'), 'training');
});

test('renders protected routes for authenticated members', () => {
  assert.deepEqual(resolveRoute('progress', true), {
    requested: 'progress', rendered: 'progress', preview: false, intended: null
  });
});

test('defines stable page titles and history actions', () => {
  assert.equal(routeTitle('leader'), 'Night Ops team · Night Ops');
  assert.equal(historyAction('home', 'training'), 'push');
  assert.equal(historyAction('home', 'training', true), 'replace');
  assert.equal(historyAction('home', 'home'), 'none');
  assert.equal(historyAction('#does-not-exist', 'home', true), 'replace');
});
