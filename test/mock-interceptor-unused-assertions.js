'use strict'

const { test, beforeEach, afterEach } = require('tap')
const { MockAgent, setGlobalDispatcher } = require('..')
const PendingInterceptorsFormatter = require('../lib/mock/pending-interceptors-formatter')

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
  t.plan(2)

  const err = t.throws(() => mockAgentWithOneInterceptor().assertNoPendingInterceptors({ pendingInterceptorsFormatter }))

  t.same(err.message, `
1 interceptor is pending:

┌─────────┬────────┬───────────────────────┬──────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │        Origin         │ Path │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼───────────────────────┼──────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ 'GET'  │ 'https://example.com' │ '/'  │     200     │    '❌'    │      0      │     1     │
└─────────┴────────┴───────────────────────┴──────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())
})

test('2 pending interceptors', t => {
  t.plan(2)

  const withTwoInterceptors = mockAgentWithOneInterceptor()
  withTwoInterceptors
    .get(origin)
    .intercept({ method: 'get', path: '/some/path' })
    .reply(204, 'OK')
  const err = t.throws(() => withTwoInterceptors.assertNoPendingInterceptors({ pendingInterceptorsFormatter }))

  t.same(err.message, `
2 interceptors are pending:

┌─────────┬────────┬──────────────────────────┬──────────────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │          Origin          │     Path     │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼──────────────────────────┼──────────────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ 'GET'  │  'https://example.com'   │     '/'      │     200     │    '❌'    │      0      │     1     │
│    1    │ 'GET'  │ 'https://localhost:9999' │ '/some/path' │     204     │    '❌'    │      0      │     1     │
└─────────┴────────┴──────────────────────────┴──────────────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())
})

test('Variations of persist(), times(), and pending status', async t => {
  t.plan(7)

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
  t.same((await agent.request({ origin, method: 'GET', path: '/persistent/used' })).statusCode, 200)

  // Consumed without persist()
  agent.get(origin)
    .intercept({ method: 'post', path: '/transient/pending' })
    .reply(201, 'Created')
  t.same((await agent.request({ origin, method: 'POST', path: '/transient/pending' })).statusCode, 201)

  // Partially pending with times()
  agent.get(origin)
    .intercept({ method: 'get', path: '/times/partial' })
    .reply(200, 'OK')
    .times(5)
  t.same((await agent.request({ origin, method: 'GET', path: '/times/partial' })).statusCode, 200)

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
  t.same((await agent.request({ origin, method: 'GET', path: '/times/pending' })).statusCode, 200)
  t.same((await agent.request({ origin, method: 'GET', path: '/times/pending' })).statusCode, 200)

  const err = t.throws(() => agent.assertNoPendingInterceptors({ pendingInterceptorsFormatter }))

  t.same(err.message, `
4 interceptors are pending:

┌─────────┬────────┬──────────────────────────┬──────────────────────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │          Origin          │         Path         │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼──────────────────────────┼──────────────────────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ 'GET'  │  'https://example.com'   │         '/'          │     200     │    '❌'    │      0      │     1     │
│    1    │ 'GET'  │ 'https://localhost:9999' │ '/persistent/unused' │     200     │    '✅'    │      0      │ Infinity  │
│    2    │ 'GET'  │ 'https://localhost:9999' │   '/times/partial'   │     200     │    '❌'    │      1      │     4     │
│    3    │ 'GET'  │ 'https://localhost:9999' │   '/times/unused'    │     200     │    '❌'    │      0      │     2     │
└─────────┴────────┴──────────────────────────┴──────────────────────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())
})

test('works when no interceptors are registered', t => {
  t.plan(2)

  const agent = new MockAgent()
  agent.disableNetConnect()

  t.same(agent.pendingInterceptors(), [])
  t.doesNotThrow(() => agent.assertNoPendingInterceptors())
})

test('works when all interceptors are pending', async t => {
  t.plan(4)

  const agent = new MockAgent()
  agent.disableNetConnect()

  agent.get(origin).intercept({ method: 'get', path: '/' }).reply(200, 'OK')
  t.same((await agent.request({ origin, method: 'GET', path: '/' })).statusCode, 200)

  agent.get(origin).intercept({ method: 'get', path: '/persistent' }).reply(200, 'OK')
  t.same((await agent.request({ origin, method: 'GET', path: '/persistent' })).statusCode, 200)

  t.same(agent.pendingInterceptors(), [])
  t.doesNotThrow(() => agent.assertNoPendingInterceptors())
})

test('defaults to rendering output with terminal color when process.env.CI is unset', t => {
  t.plan(2)

  // This ensures that the test works in an environment where the CI env var is set.
  const oldCiEnvVar = process.env.CI
  delete process.env.CI

  const err = t.throws(
    () => mockAgentWithOneInterceptor().assertNoPendingInterceptors())
  t.same(err.message, `
1 interceptor is pending:

┌─────────┬────────┬───────────────────────┬──────┬─────────────┬────────────┬─────────────┬───────────┐
│ (index) │ Method │        Origin         │ Path │ Status code │ Persistent │ Invocations │ Remaining │
├─────────┼────────┼───────────────────────┼──────┼─────────────┼────────────┼─────────────┼───────────┤
│    0    │ \u001b[32m'GET'\u001b[39m  │ \u001b[32m'https://example.com'\u001b[39m │ \u001b[32m'/'\u001b[39m  │     \u001b[33m200\u001b[39m     │    \u001b[32m'❌'\u001b[39m    │      \u001b[33m0\u001b[39m      │     \u001b[33m1\u001b[39m     │
└─────────┴────────┴───────────────────────┴──────┴─────────────┴────────────┴─────────────┴───────────┘
`.trim())

  // Re-set the CI env var if it were set.
  // Assigning `undefined` does not work,
  // because reading the env var afterwards yields the string 'undefined',
  // so we need to re-set it conditionally.
  if (oldCiEnvVar != null) {
    process.env.CI = oldCiEnvVar
  }
})

test('returns unused interceptors', t => {
  t.plan(1)

  t.same(mockAgentWithOneInterceptor().pendingInterceptors(), [
    {
      timesInvoked: 0,
      times: 1,
      persist: false,
      consumed: false,
      pending: true,
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
