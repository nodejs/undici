'use strict'

const { test } = require('node:test')
const { isASCIINumber, isValidLastEventId, createPotentialCORSRequest } = require('../../lib/web/eventsource/util')

test('isValidLastEventId', (t) => {
  t.assert.strictEqual(isValidLastEventId('valid'), true)
  t.assert.strictEqual(isValidLastEventId('in\u0000valid'), false)
  t.assert.strictEqual(isValidLastEventId('in\x00valid'), false)
  t.assert.strictEqual(isValidLastEventId('…'), true)
})

test('isASCIINumber', (t) => {
  t.assert.strictEqual(isASCIINumber('123'), true)
  t.assert.strictEqual(isASCIINumber(''), false)
  t.assert.strictEqual(isASCIINumber('123a'), false)
})

test('createPotentialCORSRequest', async (t) => {
  const url = new URL('https://example.com/events')

  const cases = [
    {
      name: 'anonymous',
      state: 'anonymous',
      mode: 'cors',
      credentials: 'same-origin'
    },
    {
      name: 'use credentials',
      state: 'use-credentials',
      mode: 'cors',
      credentials: 'include'
    }
  ]

  for (const item of cases) {
    await t.test(item.name, (t) => {
      const request = createPotentialCORSRequest(
        url,
        '',
        item.state,
        false
      )

      t.assert.strictEqual(request.mode, item.mode)
      t.assert.strictEqual(request.credentials, item.credentials)
      t.assert.strictEqual(request.useURLCredentials, true)
      t.assert.strictEqual(request.destination, '')
      t.assert.strictEqual(request.urlList.length, 1)
      t.assert.strictEqual(request.urlList[0], url)
      t.assert.strictEqual(request.url, url)
    })
  }
})
