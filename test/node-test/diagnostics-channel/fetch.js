'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test, before, after } = require('node:test')
const { fetch } = require('../../..')

let diagnosticsChannel
let skip = false
try {
  diagnosticsChannel = require('node:diagnostics_channel')
} catch {
  skip = true
}

const { createServer } = require('http')

describe('diagnosticsChannel for fetch', { skip }, () => {
  let server
  before(() => {
    server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('trailer', 'foo')
      res.write('hello')
      res.addTrailers({
        foo: 'oof'
      })
      res.end()
    })
  })

  after(() => { server.close() })

  test('fetch', async t => {
    t = tspl(t, { plan: 42 })

    let startCalled = 0

    diagnosticsChannel.channel('undici:fetch:start').subscribe(({ input, init }) => {
      startCalled += 1
      if (init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, {})
      }
    })

    let endCalled = 0
    diagnosticsChannel.channel('undici:fetch:end').subscribe(({ input, init, result, error }) => {
      endCalled += 1
      if (init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, {})
      }
      t.strictEqual(result, null)
    })

    let asyncStartCalled = 0
    diagnosticsChannel.channel('undici:fetch:asyncStart').subscribe(({ input, init, result, error }) => {
      asyncStartCalled += 1
      if (init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, {})
        t.ok(result)
      }
    })

    let asyncEndCalled = 0
    diagnosticsChannel.channel('undici:fetch:asyncEnd').subscribe(async ({ input, init, result, error }) => {
      asyncEndCalled += 1
      if (init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
        t.strictEqual(result, null)
        t.ok(error)
        t.strictEqual(error.cause.code, 'ERR_INVALID_URL')
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, {})
        t.ok(result)
        t.strictEqual(result.status, 200)
        t.strictEqual(error, null)
      }
    })

    let errorCalled = 0
    diagnosticsChannel.channel('undici:fetch:error').subscribe(async ({ input, init, error }) => {
      errorCalled += 1
      if (init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
        t.ok(error)
        t.strictEqual(error.cause.code, 'ERR_INVALID_URL')
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, {})
        t.ok(error !== undefined)
      }
    })

    server.listen(0, async () => {
      await fetch(`http://localhost:${server.address().port}`)
      try {
        await fetch('badrequest', { redirect: 'error' })
      } catch (e) { }
      server.close()
      t.strictEqual(startCalled, 2)
      t.strictEqual(endCalled, 2)
      t.strictEqual(asyncStartCalled, 3)
      t.strictEqual(asyncEndCalled, 3)
      t.strictEqual(errorCalled, 1)
    })

    await t.completed
  })
})
