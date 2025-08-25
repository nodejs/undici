'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { sep } = require('node:path')

const countPromises = require('count-promises')
const { fetch } = require('../..')

const { closeServerAsPromise } = require('../utils/node-http')

const expectedCount = 21

const body = 'abcdefgh'

test(`fetch: should create ${expectedCount} Promises for fetch-call and using .text() on request`, { timeout: 180_000 }, async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
      .end(body)
  })
  t.after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')

  const url = new URL(`http://127.0.0.1:${server.address().port}`)

  const getPromiseCount = countPromises({ locations: true, continuation: false })

  const response = await fetch(url)
  await response.text()

  const promiseCount = Object.fromEntries(Object.entries(getPromiseCount()).filter(([path, value]) => path.includes('undici') && !path.includes('node:internal') && !path.includes(`undici${sep}test`)))

  // console.log(promiseCount)

  const actualCount = Object.entries(promiseCount).reduce((acc, [key, value]) => acc + value, 0)

  assert.strictEqual(actualCount, expectedCount, `Expected ${expectedCount} promises to be created, got ${actualCount}`)
})
