import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, request, needsDeployment, confirmedDeployment } from './update.mjs';
import { dispatch } from './scheduler/scheduler.mjs';

test('deployment fingerprint changes for source and destination changes', () => {
  const original = fingerprint('code', 'account', 'project');
  assert.equal(original, fingerprint('code', 'account', 'project'));
  for (const args of [['new code', 'account', 'project'], ['code', 'other', 'project'], ['code', 'account', 'other']]) {
    assert.notEqual(original, fingerprint(...args));
  }
});
test('failed or missing deployment state retries; unchanged live deployment skips', () => {
  assert.equal(needsDeployment({}, 'new', 'old', false), true);
  const state = { fingerprint: 'hash', deploymentId: 'live' };
  assert.equal(needsDeployment(state, 'hash', 'live', false), false);
  assert.equal(needsDeployment(state, 'changed', 'live', false), true);
  assert.equal(needsDeployment(state, 'hash', 'other', false), true);
  assert.equal(needsDeployment(state, 'hash', 'live', true), true);
});
test('only a new successful production deployment of the exact commit is accepted', () => {
  const candidate = { id: 'new', environment: 'production', deployment_trigger: { metadata: { commit_hash: 'sha' } }, latest_stage: { status: 'success' } };
  assert.equal(confirmedDeployment(candidate, 'sha', 'old'), true);
  assert.equal(confirmedDeployment(candidate, 'wrong-sha', 'old'), false);
  assert.equal(confirmedDeployment(candidate, 'sha', 'new'), false);
  assert.equal(confirmedDeployment({ ...candidate, environment: 'preview' }, 'sha', 'old'), false);
  for (const status of ['active', 'failure', 'canceled']) {
    assert.equal(confirmedDeployment({ ...candidate, latest_stage: { status } }, 'sha', 'old'), false);
  }
  assert.equal(confirmedDeployment(undefined, 'sha', 'old'), false);
});
test('GitHub authentication failure is not retried or hidden', async () => {
  let calls = 0;
  await assert.rejects(request('https://api.github.com/test', {}, async () => {
    calls++; return new Response('', { status: 401 });
  }), /HTTP 401/);
  assert.equal(calls, 1);
});
test('temporary server failure is retried', async () => {
  let calls = 0;
  const response = await request('https://api.github.com/test', {}, async () => {
    calls++; return new Response('ok', { status: calls === 1 ? 503 : 200 });
  });
  assert.equal(calls, 2);
  assert.equal(await response.text(), 'ok');
});
test('scheduler respects manual pause', async () => {
  let calls = 0;
  await dispatch({ GITHUB_TOKEN: 'test-only' }, async () => {
    calls++; return Response.json({ state: 'disabled_manually' });
  });
  assert.equal(calls, 1);
});
test('scheduler enables inactivity-disabled workflow before dispatching main', async () => {
  const calls = [];
  await dispatch({ GITHUB_TOKEN: 'test-only' }, async (url, options) => {
    calls.push({ url, ...options });
    return options.method === 'GET' ? Response.json({ state: 'disabled_inactivity' }) : new Response(null, { status: 204 });
  });
  assert.deepEqual(calls.map(x => x.method), ['GET', 'PUT', 'POST']);
  assert.ok(calls[1].url.endsWith('/enable'));
  assert.deepEqual(JSON.parse(calls[2].body), { ref: 'main' });
});
test('active workflow dispatch requires no enable mutation', async () => {
  const calls = [];
  await dispatch({ GITHUB_TOKEN: 'test-only' }, async (url, options) => {
    calls.push(options.method);
    return options.method === 'GET' ? Response.json({ state: 'active' }) : new Response(null, { status: 204 });
  });
  assert.deepEqual(calls, ['GET', 'POST']);
});
test('scheduler reports token failure and never dispatches afterwards', async () => {
  let calls = 0;
  await assert.rejects(dispatch({ GITHUB_TOKEN: 'test-only' }, async () => {
    calls++; return new Response('', { status: 403 });
  }), /GitHub 403/);
  assert.equal(calls, 1);
});
