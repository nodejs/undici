'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, beforeEach, afterEach } = require('node:test')
const { MockAgent, setGlobalDispatcher } = require('..')
const PendingInterceptorsFormatter = require('../lib/mock/pending-interceptors-formatter')
const util = require('../lib/core/util')

// Since Node.js v21 `console.table` rows are aligned to the left
// https://github.com/nodejs/node/pull/50135
const tableRowsAlignedToLeft = util.nodeMajor >= 21 || (util.nodeMajor === 20 && util.nodeMinor >= 11)

// `console.table` treats emoji as two character widths for cell width determination
const Y = process.versions.icu ? '✅' : 'Y '
const N = process.versions.icu ? '❌' : 'N '

// Avoid colors in the output for inline snapshots.
const pendingInterceptorsFormatter = new PendingInterceptorsFormatter({ disableColors: true })

let originalGlobalDispatcher

const origin = 'https://localhost:9999'

beforeEach(() => {
  // Disallow all network activity by default by using a mock agent as the global dispatcher
  const globalDispatcher = new MockAgent()
  globalDispatcher.disableNetConnect()
  setGlobalDispatcher(globalDispatcher)
  originalGlobalDispatcher = globalDispatcher
})

afterEach(() => {
  setGlobalDispatcher(originalGlobalDispatcher)
})

function mockAgentWithOneInterceptor () {
  const agent = new MockAgent()
  agent.disableNetConnect()

  agent
    .get('https://example.com')
    .intercept({ method: 'GET', path: '/' })
    .reply(200, '')

  return agent
}

test('1 pending interceptor', t => {
  t = tspl(t, { plan: 1 })

  try {
    mockAgentWithOneInterceptor().assertNoPendingInterceptors({ pendingInterceptorsFormatter })
    t.fail('Should have thrown')
  } catch (err) {
    t.deepStrictEqual(err.message, tableRowsAlignedToLeft
      ? `
1 interceptor is pending:

┌─────────┬────────┬───────────────────────┬──────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │ Origin                │ Path │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼───────────────────────┼──────┼─────────────┼────────────┼─────────────┼───────────┤
│ 0       │ 'GET'  │ 'https://example.com' │ '/'  │ 200         │ '${N}'       │ 0           │ 1         │
└─────────┴────────┴───────────────────────┴──────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim()
      : `
1 interceptor is pending:

┌─────────┬────────┬───────────────────────┬──────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │        Origin         │ Path │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼───────────────────────┼──────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ 'GET'  │ 'https://example.com' │ '/'  │     200     │    '${N}'    │      0      │     1     │
└─────────┴────────┴───────────────────────┴──────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())
  }
})

test('2 pending interceptors', t => {
  t = tspl(t, { plan: 1 })

  const withTwoInterceptors = mockAgentWithOneInterceptor()
  withTwoInterceptors
    .get(origin)
    .intercept({ method: 'get', path: '/some/path' })
    .reply(204, 'OK')
  try {
    withTwoInterceptors.assertNoPendingInterceptors({ pendingInterceptorsFormatter })
  } catch (err) {
    t.deepStrictEqual(err.message, tableRowsAlignedToLeft
      ? `
2 interceptors are pending:

┌─────────┬────────┬──────────────────────────┬──────────────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │ Origin                   │ Path         │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼──────────────────────────┼──────────────┼─────────────┼────────────┼─────────────┼───────────┤
│ 0       │ 'GET'  │ 'https://example.com'    │ '/'          │ 200         │ '${N}'       │ 0           │ 1         │
│ 1       │ 'GET'  │ 'https://localhost:9999' │ '/some/path' │ 204         │ '${N}'       │ 0           │ 1         │
└─────────┴────────┴──────────────────────────┴──────────────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim()
      : `
2 interceptors are pending:

┌─────────┬────────┬──────────────────────────┬──────────────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │          Origin          │     Path     │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼──────────────────────────┼──────────────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ 'GET'  │  'https://example.com'   │     '/'      │     200     │    '${N}'    │      0      │     1     │
│    1    │ 'GET'  │ 'https://localhost:9999' │ '/some/path' │     204     │    '${N}'    │      0      │     1     │
└─────────┴────────┴──────────────────────────┴──────────────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())
  }
})

test('Variations of persist(), times(), and pending status', async t => {
  t = tspl(t, { plan: 6 })

  // Agent with unused interceptor
  const agent = mockAgentWithOneInterceptor()

  // Unused with persist()
  agent
    .get(origin)
    .intercept({ method: 'get', path: '/persistent/unused' })
    .reply(200, 'OK')
    .persist()

  // Used with persist()
  agent
    .get(origin)
    .intercept({ method: 'GET', path: '/persistent/used' })
    .reply(200, 'OK')
    .persist()
  t.deepStrictEqual((await agent.request({ origin, method: 'GET', path: '/persistent/used' })).statusCode, 200)

  // Consumed without persist()
  agent.get(origin)
    .intercept({ method: 'post', path: '/transient/pending' })
    .reply(201, 'Created')
  t.deepStrictEqual((await agent.request({ origin, method: 'POST', path: '/transient/pending' })).statusCode, 201)

  // Partially pending with times()
  agent.get(origin)
    .intercept({ method: 'get', path: '/times/partial' })
    .reply(200, 'OK')
    .times(5)
  t.deepStrictEqual((await agent.request({ origin, method: 'GET', path: '/times/partial' })).statusCode, 200)

  // Unused with times()
  agent.get(origin)
    .intercept({ method: 'get', path: '/times/unused' })
    .reply(200, 'OK')
    .times(2)

  // Fully pending with times()
  agent.get(origin)
    .intercept({ method: 'get', path: '/times/pending' })
    .reply(200, 'OK')
    .times(2)
  t.deepStrictEqual((await agent.request({ origin, method: 'GET', path: '/times/pending' })).statusCode, 200)
  t.deepStrictEqual((await agent.request({ origin, method: 'GET', path: '/times/pending' })).statusCode, 200)

  try {
    agent.assertNoPendingInterceptors({ pendingInterceptorsFormatter })
    t.fail('Should have thrown')
  } catch (err) {
    t.deepStrictEqual(err.message, tableRowsAlignedToLeft
      ? `
4 interceptors are pending:

┌─────────┬────────┬──────────────────────────┬──────────────────────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │ Origin                   │ Path                 │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼──────────────────────────┼──────────────────────┼─────────────┼────────────┼─────────────┼───────────┤
│ 0       │ 'GET'  │ 'https://example.com'    │ '/'                  │ 200         │ '${N}'       │ 0           │ 1         │
│ 1       │ 'GET'  │ 'https://localhost:9999' │ '/persistent/unused' │ 200         │ '${Y}'       │ 0           │ Infinity  │
│ 2       │ 'GET'  │ 'https://localhost:9999' │ '/times/partial'     │ 200         │ '${N}'       │ 1           │ 4         │
│ 3       │ 'GET'  │ 'https://localhost:9999' │ '/times/unused'      │ 200         │ '${N}'       │ 0           │ 2         │
└─────────┴────────┴──────────────────────────┴──────────────────────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim()
      : `
4 interceptors are pending:

┌─────────┬────────┬──────────────────────────┬──────────────────────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │          Origin          │         Path         │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼──────────────────────────┼──────────────────────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ 'GET'  │  'https://example.com'   │         '/'          │     200     │    '${N}'    │      0      │     1     │
│    1    │ 'GET'  │ 'https://localhost:9999' │ '/persistent/unused' │     200     │    '${Y}'    │      0      │ Infinity  │
│    2    │ 'GET'  │ 'https://localhost:9999' │   '/times/partial'   │     200     │    '${N}'    │      1      │     4     │
│    3    │ 'GET'  │ 'https://localhost:9999' │   '/times/unused'    │     200     │    '${N}'    │      0      │     2     │
└─────────┴────────┴──────────────────────────┴──────────────────────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())
  }
})

test('works when no interceptors are registered', t => {
  t = tspl(t, { plan: 2 })

  const agent = new MockAgent()
  agent.disableNetConnect()

  t.deepStrictEqual(agent.pendingInterceptors(), [])
  t.doesNotThrow(() => agent.assertNoPendingInterceptors())
})

test('works when all interceptors are pending', async t => {
  t = tspl(t, { plan: 4 })

  const agent = new MockAgent()
  agent.disableNetConnect()

  agent.get(origin).intercept({ method: 'get', path: '/' }).reply(200, 'OK')
  t.deepStrictEqual((await agent.request({ origin, method: 'GET', path: '/' })).statusCode, 200)

  agent.get(origin).intercept({ method: 'get', path: '/persistent' }).reply(200, 'OK')
  t.deepStrictEqual((await agent.request({ origin, method: 'GET', path: '/persistent' })).statusCode, 200)

  t.deepStrictEqual(agent.pendingInterceptors(), [])
  t.doesNotThrow(() => agent.assertNoPendingInterceptors())
})

test('defaults to rendering output with terminal color when process.env.CI is unset', t => {
  t = tspl(t, { plan: 1 })

  // This ensures that the test works in an environment where the CI env var is set.
  const oldCiEnvVar = process.env.CI
  delete process.env.CI

  try {
    mockAgentWithOneInterceptor().assertNoPendingInterceptors()
    t.fail('Should have thrown')
  } catch (err) {
    t.deepStrictEqual(err.message, tableRowsAlignedToLeft
      ? `
1 interceptor is pending:

┌─────────┬────────┬───────────────────────┬──────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │ Origin                │ Path │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼───────────────────────┼──────┼─────────────┼────────────┼─────────────┼───────────┤
│ 0       │ \u001b[32m'GET'\u001b[39m  │ \u001b[32m'https://example.com'\u001b[39m │ \u001b[32m'/'\u001b[39m  │ \u001b[33m200\u001b[39m         │ \u001b[32m'${N}'\u001b[39m       │ \u001b[33m0\u001b[39m           │ \u001b[33m1\u001b[39m         │
└─────────┴────────┴───────────────────────┴──────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim()
      : `
1 interceptor is pending:

┌─────────┬────────┬───────────────────────┬──────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │        Origin         │ Path │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼───────────────────────┼──────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ \u001b[32m'GET'\u001b[39m  │ \u001b[32m'https://example.com'\u001b[39m │ \u001b[32m'/'\u001b[39m  │     \u001b[33m200\u001b[39m     │    \u001b[32m'${N}'\u001b[39m    │      \u001b[33m0\u001b[39m      │     \u001b[33m1\u001b[39m     │
└─────────┴────────┴───────────────────────┴──────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())

    // Re-set the CI env var if it were set.
    // Assigning `undefined` does not work,
    // because reading the env var afterwards yields the string 'undefined',
    // so we need to re-set it conditionally.
    if (oldCiEnvVar != null) {
      process.env.CI = oldCiEnvVar
    }
  }
})

test('returns unused interceptors', t => {
  t = tspl(t, { plan: 1 })

  t.deepStrictEqual(mockAgentWithOneInterceptor().pendingInterceptors(), [
    {
      timesInvoked: 0,
      times: 1,
      persist: false,
      consumed: false,
      pending: true,
      ignoreTrailingSlash: false,
      path: '/',
      method: 'GET',
      body: undefined,
      query: undefined,
      headers: undefined,
      data: {
        error: null,
        statusCode: 200,
        data: '',
        headers: {},
        trailers: {}
      },
      origin: 'https://example.com'
    }
  ])
})
