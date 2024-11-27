'use strict'

const { test, after } = require('node:test')
const { strictEqual } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { request, Client, interceptors } = require('../../index')
const { setTimeout: sleep } = require('timers/promises')

test('revalidates the request when the response is stale', async () => {
  let count = 0
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=1')
    res.end('hello world ' + count++)
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await dispatcher.close()
  })

  const url = `http://localhost:${server.address().port}`

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world 0')
  }

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world 0')
  }

  await sleep(1000)

  {
    const res = await request(url, { dispatcher })

    strictEqual(await res.body.text(), 'hello world 1')
  }
})
