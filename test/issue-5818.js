'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const assert = require('node:assert')
const { Agent, interceptors } = require('..')

// https://github.com/nodejs/undici/issues/5818
test('successful cached response is not aborted', async (t) => {
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.setHeader('cache-control', 'max-age=60')
    res.end('ok')
  })
  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent().compose(interceptors.cache())
  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve())
    })
  })

  const opts = {
    origin: `http://127.0.0.1:${server.address().port}`,
    path: '/',
    method: 'GET'
  }

  await (await dispatcher.request(opts)).body.dump()

  const aborted = await new Promise((resolve, reject) => {
    dispatcher.dispatch(opts, {
      onRequestStart () {},
      onResponseEnd (controller) {
        resolve(controller.aborted)
      },
      onResponseError (controller, error) {
        reject(error)
      }
    })
  })

  assert.strictEqual(requestCount, 1)
  assert.strictEqual(aborted, false)
})
