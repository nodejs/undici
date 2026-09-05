'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const serverKit = require('../../lib/web/fetch/server-kit')
const { Request, makeRequest } = require('../../lib/web/fetch/request')
const { Response, makeResponse } = require('../../lib/web/fetch/response')
const { Headers } = require('../../lib/web/fetch/headers')

const {
  kConstruct,
  HeadersList,
  setHeadersList,
  setHeadersGuard,
  getRequestState,
  setRequestState,
  setRequestHeaders,
  setRequestSignal,
  getResponseState,
  setResponseState,
  setResponseHeaders
} = serverKit

test('is exposed through the Node.js bundle entry point', () => {
  assert.strictEqual(require('../../index-fetch').serverKit, serverKit)
})

test('builds a working Request subclass without the public constructor', async () => {
  class ServerRequest extends Request {}

  const list = new HeadersList()
  list.append('x-a', 'b', true)
  const state = makeRequest({
    method: 'GET',
    urlList: [new URL('http://example.com/path')],
    headersList: list
  })

  const controller = new AbortController()
  const request = new ServerRequest(kConstruct)
  setRequestState(request, state)
  setRequestSignal(request, controller.signal)
  const headers = new Headers(kConstruct)
  setHeadersList(headers, state.headersList)
  setHeadersGuard(headers, 'immutable')
  setRequestHeaders(request, headers)

  assert.ok(request instanceof Request)
  assert.strictEqual(getRequestState(request), state)
  assert.strictEqual(request.method, 'GET')
  assert.strictEqual(request.url, 'http://example.com/path')
  assert.strictEqual(request.headers.get('x-a'), 'b')
  assert.throws(() => request.headers.set('x-a', 'c'), TypeError)
  assert.strictEqual(request.signal.aborted, false)
  controller.abort()
  assert.strictEqual(request.signal.aborted, true)
  assert.strictEqual(await request.text(), '')
})

test('builds a working Response subclass without the public constructor', async () => {
  class ServerResponse extends Response {}

  const state = makeResponse({ status: 201, statusText: 'Created' })
  state.headersList.append('x-b', 'c', true)

  const response = new ServerResponse(kConstruct)
  setResponseState(response, state)
  const headers = new Headers(kConstruct)
  setHeadersList(headers, state.headersList)
  setHeadersGuard(headers, 'response')
  setResponseHeaders(response, headers)

  assert.ok(response instanceof Response)
  assert.strictEqual(getResponseState(response), state)
  assert.strictEqual(response.status, 201)
  assert.strictEqual(response.statusText, 'Created')
  assert.strictEqual(response.headers.get('x-b'), 'c')
  assert.strictEqual(response.body, null)
  assert.strictEqual(await response.text(), '')
})
