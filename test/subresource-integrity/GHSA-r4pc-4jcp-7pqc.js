'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, Request } = require('../..')
const { runtimeFeatures } = require('../../lib/util/runtime-features')
const { closeServerAsPromise } = require('../utils/node-http')

const skip = runtimeFeatures.has('crypto') === false
const body = 'Hello world!'
const hash256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
const hash256Wrong = 'MWD71RGgcch4KOzmR6VMaqWh4VY7eonYmHWvemOtMno='
const hash384Wrong = 'zxSYGGGjWi7iIZ9SmiTenQIQ+/nzPTd5bbesJhBTZvoYomj28rsVLXbUyJU/Yqob'
const hash512Wrong = 'eC9loL1pd8AD1Btp9aHu+ymH5Rfnh64hiTYgyfeXy270KfjPQupBkhb2OeP35vZA8ofSBNJ01LzweDIhznuqaw=='
const asciiWhitespace = [' ', '\t', '\n', '\f', '\r']

function integrityMismatchError () {
  return new TypeError('fetch failed', {
    cause: new Error('integrity mismatch')
  })
}

test('request enforces integrity metadata surrounded by ASCII whitespace', { skip }, async (t) => {
  const server = createServer((req, res) => {
    res.end(body)
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')

  const url = `http://localhost:${server.address().port}`

  for (const whitespace of asciiWhitespace) {
    const cases = [
      `${whitespace}sha256-${hash256Wrong}`,
      `${whitespace}${whitespace}sha384-${hash384Wrong}`,
      ` ${whitespace}sha512-${hash512Wrong}`,
      `sha256-${hash256Wrong}${whitespace}`
    ]

    for (const integrity of cases) {
      await t.assert.rejects(fetch(url, { integrity }), integrityMismatchError())
    }

    const request = new Request(url, {
      integrity: `${whitespace}sha256-${hash256Wrong}`
    })
    await t.assert.rejects(fetch(request), integrityMismatchError())
  }
})

test('stronger metadata separated by ASCII whitespace cannot be skipped', { skip }, async (t) => {
  const server = createServer((req, res) => {
    res.end(body)
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')

  const url = `http://localhost:${server.address().port}`

  for (const whitespace of asciiWhitespace) {
    const cases = [
      `sha256-${hash256}${whitespace}sha512-${hash512Wrong}`,
      `sha256-${hash256} ${whitespace}sha512-${hash512Wrong}`
    ]

    for (const integrity of cases) {
      await t.assert.rejects(fetch(url, { integrity }), integrityMismatchError())
    }

    const response = await fetch(url, {
      integrity: `${whitespace}sha256-${hash256}`
    })
    t.assert.strictEqual(await response.text(), body)

    await t.assert.doesNotReject(fetch(url, {
      integrity: `${whitespace}sha1024-unsupported`
    }))
  }
})
