'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const undici = require('../index')
const { installedExports } = require('../lib/global')

test('install() should overwrite only specified elements in globalThis', () => {
  const exportsToCheck = new Set(installedExports)

  // Use a Proxy to verify that only the expected globals are set
  // and no other properties are added to globalThis by undici.install().
  const proxyGlobalThis = new Proxy(globalThis, {
    set (target, prop, value) {
      if (exportsToCheck.has(prop)) {
        target[prop] = value
        exportsToCheck.delete(prop)
        return true
      }
      throw new Error(`Unexpected global set: ${String(prop)}`)
    }
  })

  // eslint-disable-next-line no-global-assign
  globalThis = proxyGlobalThis

  undici.install()

  assert.strictEqual(exportsToCheck.size, 0, `Some expected globals were not set: ${[...exportsToCheck].join(', ')}`)

  // Verify that the installed globals match the exports from undici
  for (const name of installedExports) {
    assert.strictEqual(globalThis[name], undici[name])
  }

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
})
