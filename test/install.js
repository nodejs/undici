'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { install } = require('../index')

test('install() should add WHATWG fetch classes to globalThis', () => {
  // Save original globals to restore later
  const originalFetch = globalThis.fetch
  const originalHeaders = globalThis.Headers
  const originalResponse = globalThis.Response
  const originalRequest = globalThis.Request
  const originalFormData = globalThis.FormData
  const originalWebSocket = globalThis.WebSocket
  const originalCloseEvent = globalThis.CloseEvent
  const originalErrorEvent = globalThis.ErrorEvent
  const originalMessageEvent = globalThis.MessageEvent
  const originalEventSource = globalThis.EventSource

  try {
    // Remove any existing globals
    delete globalThis.fetch
    delete globalThis.Headers
    delete globalThis.Response
    delete globalThis.Request
    delete globalThis.FormData
    delete globalThis.WebSocket
    delete globalThis.CloseEvent
    delete globalThis.ErrorEvent
    delete globalThis.MessageEvent
    delete globalThis.EventSource

    // Verify they're not defined
    assert.strictEqual(globalThis.fetch, undefined)
    assert.strictEqual(globalThis.Headers, undefined)
    assert.strictEqual(globalThis.Response, undefined)
    assert.strictEqual(globalThis.Request, undefined)
    assert.strictEqual(globalThis.FormData, undefined)
    assert.strictEqual(globalThis.WebSocket, undefined)
    assert.strictEqual(globalThis.CloseEvent, undefined)
    assert.strictEqual(globalThis.ErrorEvent, undefined)
    assert.strictEqual(globalThis.MessageEvent, undefined)
    assert.strictEqual(globalThis.EventSource, undefined)

    // Call install()
    install()

    // Verify all classes are now installed
    assert.strictEqual(typeof globalThis.fetch, 'function')
    assert.strictEqual(typeof globalThis.Headers, 'function')
    assert.strictEqual(typeof globalThis.Response, 'function')
    assert.strictEqual(typeof globalThis.Request, 'function')
    assert.strictEqual(typeof globalThis.FormData, 'function')
    assert.strictEqual(typeof globalThis.WebSocket, 'function')
    assert.strictEqual(typeof globalThis.CloseEvent, 'function')
    assert.strictEqual(typeof globalThis.ErrorEvent, 'function')
    assert.strictEqual(typeof globalThis.MessageEvent, 'function')
    assert.strictEqual(typeof globalThis.EventSource, 'function')

    // Test that the installed classes are functional
    const headers = new globalThis.Headers([['content-type', 'application/json']])
    assert.strictEqual(headers.get('content-type'), 'application/json')

    const request = new globalThis.Request('https://example.com')
    assert.strictEqual(request.url, 'https://example.com/')

    const response = new globalThis.Response('test body')
    assert.strictEqual(response.status, 200)

    const formData = new globalThis.FormData()
    formData.append('key', 'value')
    assert.strictEqual(formData.get('key'), 'value')
  } finally {
    // Restore original globals
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch
    } else {
      delete globalThis.fetch
    }
    if (originalHeaders !== undefined) {
      globalThis.Headers = originalHeaders
    } else {
      delete globalThis.Headers
    }
    if (originalResponse !== undefined) {
      globalThis.Response = originalResponse
    } else {
      delete globalThis.Response
    }
    if (originalRequest !== undefined) {
      globalThis.Request = originalRequest
    } else {
      delete globalThis.Request
    }
    if (originalFormData !== undefined) {
      globalThis.FormData = originalFormData
    } else {
      delete globalThis.FormData
    }
    if (originalWebSocket !== undefined) {
      globalThis.WebSocket = originalWebSocket
    } else {
      delete globalThis.WebSocket
    }
    if (originalCloseEvent !== undefined) {
      globalThis.CloseEvent = originalCloseEvent
    } else {
      delete globalThis.CloseEvent
    }
    if (originalErrorEvent !== undefined) {
      globalThis.ErrorEvent = originalErrorEvent
    } else {
      delete globalThis.ErrorEvent
    }
    if (originalMessageEvent !== undefined) {
      globalThis.MessageEvent = originalMessageEvent
    } else {
      delete globalThis.MessageEvent
    }
    if (originalEventSource !== undefined) {
      globalThis.EventSource = originalEventSource
    } else {
      delete globalThis.EventSource
    }
  }
})
