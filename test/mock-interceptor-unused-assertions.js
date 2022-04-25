'use strict'

const { test, beforeEach, afterEach } = require('tap')
const { MockAgent, setGlobalDispatcher } = require('..')
const TableFormatter = require('../lib/mock/table-formatter')

// Avoid colors in the output for inline snapshots.
const tableFormatter = new TableFormatter({ disableColors: true })

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

test('1 unconsumed interceptor', t => {
  t.plan(2)

  const err = t.throws(() => mockAgentWithOneInterceptor().assertNoUnusedInterceptors({ tableFormatter }))

  t.same(err.message, `
1 interceptor was not consumed!
(0 interceptors were consumed, and 0 were not counted because they are persistent.)

This interceptor was not consumed:
┌─────────┬────────┬──────┬─────────────┬────────────┬─────────────────┐
│ (index) │ Method │ Path │ Status code │ Persistent │ Remaining calls │
├─────────┼────────┼──────┼─────────────┼────────────┼─────────────────┤
│    0    │ 'GET'  │ '/'  │     200     │    '❌'    │        1        │
└─────────┴────────┴──────┴─────────────┴────────────┴─────────────────┘
`.trim())
})

test('2 unconsumed interceptors', t => {
  t.plan(2)

  const withTwoInterceptors = mockAgentWithOneInterceptor()
  withTwoInterceptors
    .get(origin)
    .intercept({ method: 'get', path: '/some/path' })
    .reply(204, 'OK')
  const err = t.throws(() => withTwoInterceptors.assertNoUnusedInterceptors({ tableFormatter }))

  t.same(err.message, `
2 interceptors were not consumed!
(0 interceptors were consumed, and 0 were not counted because they are persistent.)

These interceptors were not consumed:
┌─────────┬────────┬──────────────┬─────────────┬────────────┬─────────────────┐
│ (index) │ Method │     Path     │ Status code │ Persistent │ Remaining calls │
├─────────┼────────┼──────────────┼─────────────┼────────────┼─────────────────┤
│    0    │ 'GET'  │     '/'      │     200     │    '❌'    │        1        │
│    1    │ 'GET'  │ '/some/path' │     204     │    '❌'    │        1        │
└─────────┴────────┴──────────────┴─────────────┴────────────┴─────────────────┘
`.trim())
})

test('Variations of persist(), times(), and consumed status', async t => {
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
    .intercept({ method: 'post', path: '/transient/consumed' })
    .reply(201, 'Created')
  t.same((await agent.request({ origin, method: 'POST', path: '/transient/consumed' })).statusCode, 201)

  // Partially consumed with times()
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

  // Fully consumed with times()
  agent.get(origin)
    .intercept({ method: 'get', path: '/times/consumed' })
    .reply(200, 'OK')
    .times(2)
  t.same((await agent.request({ origin, method: 'GET', path: '/times/consumed' })).statusCode, 200)
  t.same((await agent.request({ origin, method: 'GET', path: '/times/consumed' })).statusCode, 200)

  const err = t.throws(() => agent.assertNoUnusedInterceptors({ tableFormatter }))

  t.same(err.message, `
3 interceptors were not consumed!
(0 interceptors were consumed, and 2 were not counted because they are persistent.)

These interceptors were not consumed:
┌─────────┬────────┬──────────────────┬─────────────┬────────────┬─────────────────┐
│ (index) │ Method │       Path       │ Status code │ Persistent │ Remaining calls │
├─────────┼────────┼──────────────────┼─────────────┼────────────┼─────────────────┤
│    0    │ 'GET'  │       '/'        │     200     │    '❌'    │        1        │
│    1    │ 'GET'  │ '/times/partial' │     200     │    '❌'    │        4        │
│    2    │ 'GET'  │ '/times/unused'  │     200     │    '❌'    │        2        │
└─────────┴────────┴──────────────────┴─────────────┴────────────┴─────────────────┘
`.trim())
})

test('works when no interceptors are registered', t => {
  t.plan(1)

  const dispatcher = new MockAgent()
  dispatcher.disableNetConnect()

  t.same(dispatcher.pendingInterceptors(), [])
})

test('defaults to rendering output with terminal color when process.env.CI is unset', t => {
  t.plan(2)

  // This ensures that the test works in an environment where the CI env var is set.
  const oldCiEnvVar = process.env.CI
  delete process.env.CI

  const err = t.throws(
    () => mockAgentWithOneInterceptor().assertNoUnusedInterceptors())
  t.same(err.message, `
1 interceptor was not consumed!
(0 interceptors were consumed, and 0 were not counted because they are persistent.)

This interceptor was not consumed:
┌─────────┬────────┬──────┬─────────────┬────────────┬─────────────────┐
│ (index) │ Method │ Path │ Status code │ Persistent │ Remaining calls │
├─────────┼────────┼──────┼─────────────┼────────────┼─────────────────┤
│    0    │ [32m'GET'[39m  │ [32m'/'[39m  │     [33m200[39m     │    [32m'❌'[39m    │        [33m1[39m        │
└─────────┴────────┴──────┴─────────────┴────────────┴─────────────────┘
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
      times: null,
      persist: false,
      consumed: false,
      path: '/',
      method: 'GET',
      body: undefined,
      headers: undefined,
      data: {
        error: null,
        statusCode: 200,
        data: '',
        headers: {},
        trailers: {}
      }
    }
  ])
})
