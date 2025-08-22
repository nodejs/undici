'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')

const countPromises = require('count-promises')
const { fetch } = require('../..')

const { closeServerAsPromise } = require('../utils/node-http')

const body = 'abcdefg'.repeat(1e6)

test('fetch: Determine amount of created Promises', { timeout: 180_000 }, async (t) => {
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

  const promiseCount = getPromiseCount()

  // console.log(promiseCount)

  const actualCount = Object.entries(promiseCount).reduce((acc, [key, value]) => acc + value, 0)

  console.log(`Promise count: ${actualCount}`)
})
