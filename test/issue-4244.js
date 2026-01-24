const { test, describe } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { request, Agent, Pool } = require('..')

// https://github.com/nodejs/undici/issues/4424
describe('Agent should close inactive clients', () => {
  test('without active connections', async (t) => {
    const server = createServer({ keepAliveTimeout: 0 }, async (_req, res) => {
      res.setHeader('connection', 'close')
      res.writeHead(200)
      res.end('ok')
    }).listen(0)

    t.after(async () => {
      server.closeAllConnections?.()
      await new Promise(resolve => server.close(resolve))
    })

    let p
    const agent = new Agent({
      factory: (origin, opts) => {
        const pool = new Pool(origin, opts)
        let _resolve, _reject
        p = new Promise((resolve, reject) => {
          _resolve = resolve
          _reject = reject
        })
        pool.on('disconnect', () => {
          setImmediate(() => pool.destroyed ? _resolve() : _reject(new Error('client not destroyed')))
        })
        return pool
      }
    })
    const { statusCode } = await request(`http://localhost:${server.address().port}`, { dispatcher: agent })
    assert.equal(statusCode, 200)

    await p
  })

  test('in case of connection error', async (t) => {
    let p
    const agent = new Agent({
      factory: (origin, opts) => {
        const pool = new Pool(origin, opts)
        let _resolve, _reject
        p = new Promise((resolve, reject) => {
          _resolve = resolve
          _reject = reject
        })
        pool.on('connectionError', () => {
          setImmediate(() => pool.destroyed ? _resolve() : _reject(new Error('client not destroyed')))
        })
        return pool
      }
    })
    try {
      await request('http://localhost:0', { dispatcher: agent })
    } catch (_) {
      // ignore
    }

    await p
  })
})
