'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const FakeTimers = require('@sinonjs/fake-timers')
const timers = require('../lib/util/timers')

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
