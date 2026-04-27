'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const EventEmitter = require('node:events')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const FakeTimers = require('@sinonjs/fake-timers')
const timers = require('../lib/util/timers')
const connectH1 = require('../lib/dispatcher/client-h1')
const {
  kMaxHeadersSize,
  kMaxResponseSize,
  kParser,
  kQueue,
  kRunningIdx
} = require('../lib/core/symbols')

class DummySocket extends EventEmitter {
  constructor () {
    super()
    this.destroyed = false
    this.errored = null
  }

  read () {
    return null
  }
}

test('parser reuses WeakRef when replacing timeout callbacks', async (t) => {
  const OriginalWeakRef = global.WeakRef
  t.after(() => {
    global.WeakRef = OriginalWeakRef
  })

  t = tspl(t, { plan: 1 })

  let weakRefCount = 0

  global.WeakRef = class CountingWeakRef extends OriginalWeakRef {
    constructor (target) {
      weakRefCount++
      super(target)
    }
  }

  const socket = new DummySocket()
  const client = {
    [kMaxHeadersSize]: 1024,
    [kMaxResponseSize]: 1024,
    [kQueue]: [],
    [kRunningIdx]: 0
  }

  await connectH1(client, socket)
  const parser = socket[kParser]

  parser.setTimeout(200, 0)
  parser.setTimeout(300, 0)
  parser.setTimeout(400, 1)
  parser.destroy()

  t.strictEqual(weakRefCount, 1)
})

test('refresh timeout on pause', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.flushHeaders()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 500
    })
    after(() => client.destroy())

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseStart (controller) {
        setTimeout(() => {
          controller.resume()
        }, 1000)
        controller.pause()
      },
      onResponseData () {

      },
      onResponseEnd () {

      },
      onResponseError (_controller, err) {
        t.ok(err instanceof errors.BodyTimeoutError)
      }
    })
  })

  await t.completed
})

test('start headers timeout after request body', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({ shouldClearNativeTimers: true })
  after(() => clock.uninstall())

  const orgTimers = { ...timers }
  Object.assign(timers, { setTimeout, clearTimeout })
  after(() => {
    Object.assign(timers, orgTimers)
  })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0,
      headersTimeout: 100
    })
    after(() => client.destroy())

    const body = new Readable({ read () {} })
    client.dispatch({
      path: '/',
      body,
      method: 'GET'
    }, {
      onRequestStart () {
        process.nextTick(() => {
          clock.tick(200)
        })
        queueMicrotask(() => {
          body.push(null)
          body.on('end', () => {
            clock.tick(200)
          })
        })
      },
      onResponseStart () {
      },
      onResponseData () {

      },
      onResponseEnd () {

      },
      onResponseError (_controller, err) {
        t.equal(body.readableEnded, true)
        t.ok(err instanceof errors.HeadersTimeoutError)
      }
    })
  })

  await t.completed
})

test('start headers timeout after async iterator request body', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({ shouldClearNativeTimers: true })
  after(() => clock.uninstall())

  const orgTimers = { ...timers }
  Object.assign(timers, { setTimeout, clearTimeout })
  after(() => {
    Object.assign(timers, orgTimers)
  })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0,
      headersTimeout: 100
    })
    after(() => client.destroy())
    let res
    const body = (async function * () {
      await new Promise((resolve) => { res = resolve })
      process.nextTick(() => {
        clock.tick(200)
      })
    })()
    client.dispatch({
      path: '/',
      body,
      method: 'GET'
    }, {
      onRequestStart () {
        process.nextTick(() => {
          clock.tick(200)
        })
        queueMicrotask(() => {
          res()
        })
      },
      onResponseStart () {
      },
      onResponseData () {

      },
      onResponseEnd () {

      },
      onResponseError (_controller, err) {
        t.ok(err instanceof errors.HeadersTimeoutError)
      }
    })
  })

  await t.completed
})

test('parser resume with no body timeout', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.destroy())

    client.on('disconnect', () => {
      if (!client.closed && !client.destroyed) {
        t.fail('unexpected disconnect')
      }
    })

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseStart (controller) {
        setTimeout(() => controller.resume(), 2000)
        controller.pause()
      },
      onResponseData () {

      },
      onResponseEnd () {
        t.ok(true, 'pass')
      },
      onResponseError (_controller, err) {
        t.ifError(err)
      }
    })
  })

  await t.completed
})
