'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')

const { Agent, request } = require('..')

// https://github.com/nodejs/undici/issues/4806
test('Agent clientTtl cleanup does not trigger unhandled rejections', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end('ok')
  })

  after(() => server.close())

  server.listen(0, async () => {
    const agent = new Agent({ clientTtl: 10 })
    after(async () => agent.close())

    const onUnhandled = (err) => t.fail(err)
    process.once('unhandledRejection', onUnhandled)
    after(() => process.removeListener('unhandledRejection', onUnhandled))

    const origin = `http://localhost:${server.address().port}`

    const res1 = await request(origin, { dispatcher: agent })
    t.strictEqual(res1.statusCode, 200)

    await new Promise(resolve => setTimeout(resolve, 20))

    const res2 = await request(origin, { dispatcher: agent })
    t.strictEqual(res2.statusCode, 200)
    res2.body.resume()
    await once(res2.body, 'end')

    await new Promise(resolve => setTimeout(resolve, 20))
  })

  await t.completed
})
