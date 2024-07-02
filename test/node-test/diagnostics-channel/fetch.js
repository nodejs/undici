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
    t = tspl(t, { plan: 17 })

    let startCalled = 0
    diagnosticsChannel.channel('tracing:undici:fetch:start').subscribe(({ req, input, init, result, error }) => {
      startCalled += 1
      if (input.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, undefined)
      }
    })

    let endCalled = 0
    diagnosticsChannel.channel('tracing:undici:fetch:end').subscribe(({ req, input, init, result, error }) => {
      endCalled += 1
      if (init && init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, undefined)
      }
      t.strictEqual(result, null)
    })

    let asyncStartCalled = 0
    diagnosticsChannel.channel('tracing:undici:fetch:asyncStart').subscribe(({ req, input, init, result, error }) => {
      asyncStartCalled += 1
      if (init && init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, undefined)
        t.ok(result)
      }
    })

    let asyncEndCalled = 0
    diagnosticsChannel.channel('tracing:undici:fetch:asyncEnd').subscribe(async ({ req, input, init, result, error }) => {
      asyncEndCalled += 1
      if (init && init.redirect) {
        t.strictEqual(input, 'badrequest')
        t.deepStrictEqual(init, { redirect: 'error' })
        t.strictEqual(result, null)
        t.ok(error)
        t.strictEqual(error.cause.code, 'ERR_INVALID_URL')
      } else {
        t.strictEqual(input, `http://localhost:${server.address().port}`)
        t.deepStrictEqual(init, undefined)
        t.ok(result)
        t.strictEqual(result.status, 200)
        t.strictEqual(error, null)
      }
    })

    server.listen(0, async () => {
      await fetch(`http://localhost:${server.address().port}`)
      try {
        await fetch('badrequest', { redirect: 'error' })
      } catch (e) { }
      server.close()
      t.strictEqual(startCalled, 1)
      t.strictEqual(endCalled, 1)
      t.strictEqual(asyncStartCalled, 1)
      t.strictEqual(asyncEndCalled, 1)
    })

    await t.completed
  })
})
