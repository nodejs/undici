'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const diagnosticsChannel = require('node:diagnostics_channel')
const { createServer } = require('node:http')
const { Client } = require('../../..')

// Minimal handler satisfying the current Dispatcher#dispatch contract.
function makeHandler ({ onEnd, onErr } = {}) {
  return {
    onConnect () {},
    onRequestStart () {},
    onResponseStart () { return true },
    onResponseData () { return true },
    onResponseEnd () { onEnd?.() },
    onResponseError (_c, err) { onErr?.(err) }
  }
}

test('Diagnostics channel - interceptor hop: enter + exit on success', (t) => {
  const assert = tspl(t, { plan: 11 })

  const enterCh = diagnosticsChannel.channel('undici:interceptor:enter')
  const exitCh = diagnosticsChannel.channel('undici:interceptor:exit')
  const errorCh = diagnosticsChannel.channel('undici:interceptor:error')

  let enterReqId
  const onEnter = (msg) => {
    assert.equal(msg.interceptor, 'tagInterceptor')
    assert.equal(typeof msg.requestId, 'string')
    assert.equal(msg.method, 'GET')
    assert.equal(msg.path, '/hello')
    assert.equal(typeof msg.startTime, 'number')
    enterReqId = msg.requestId
  }
  const onExit = (msg) => {
    assert.equal(msg.interceptor, 'tagInterceptor')
    assert.equal(msg.requestId, enterReqId)
    assert.equal(msg.path, '/hello')
    assert.equal(typeof msg.duration, 'number')
    assert.ok(msg.duration >= 0)
  }
  const onError = () => assert.fail('error channel must not fire on happy path')

  enterCh.subscribe(onEnter)
  exitCh.subscribe(onExit)
  errorCh.subscribe(onError)
  t.after(() => {
    enterCh.unsubscribe(onEnter)
    exitCh.unsubscribe(onExit)
    errorCh.unsubscribe(onError)
  })

  const server = createServer((req, res) => { res.statusCode = 200; res.end('ok') })
  t.after(() => new Promise((resolve) => server.close(resolve)))

  server.listen(0, () => {
    function tagInterceptor (dispatch) {
      return (opts, handler) => dispatch(opts, handler)
    }
    const client = new Client(`http://localhost:${server.address().port}`).compose([
      tagInterceptor
    ])
    t.after(() => client.close())
    client.dispatch({ path: '/hello', method: 'GET' }, makeHandler({
      onEnd: () => assert.ok(true, 'dispatch completed')
    }))
  })

  return assert.completed
})

test('Diagnostics channel - interceptor hop: enter + error on failed request', (t) => {
  const assert = tspl(t, { plan: 6 })

  const enterCh = diagnosticsChannel.channel('undici:interceptor:enter')
  const errorCh = diagnosticsChannel.channel('undici:interceptor:error')
  const exitCh = diagnosticsChannel.channel('undici:interceptor:exit')

  let enterReqId
  const onEnter = (msg) => {
    enterReqId = msg.requestId
    assert.equal(msg.interceptor, 'passThrough')
  }
  const onError = (msg) => {
    assert.equal(msg.interceptor, 'passThrough')
    assert.equal(msg.requestId, enterReqId)
    assert.ok(msg.error instanceof Error)
    assert.equal(typeof msg.duration, 'number')
  }
  const onExit = () => assert.fail('exit must not fire when the request errors')

  enterCh.subscribe(onEnter)
  errorCh.subscribe(onError)
  exitCh.subscribe(onExit)
  t.after(() => {
    enterCh.unsubscribe(onEnter)
    errorCh.unsubscribe(onError)
    exitCh.unsubscribe(onExit)
  })

  const server = createServer((req) => req.socket.destroy())
  t.after(() => new Promise((resolve) => server.close(resolve)))

  server.listen(0, () => {
    function passThrough (dispatch) {
      return (opts, handler) => dispatch(opts, handler)
    }
    const client = new Client(`http://localhost:${server.address().port}`).compose([
      passThrough
    ])
    t.after(() => client.close())
    client.dispatch({ path: '/err', method: 'GET' }, makeHandler({
      onErr: () => assert.ok(true, 'dispatch errored')
    }))
  })

  return assert.completed
})

test('Diagnostics channel - interceptor hop: multiple interceptors fire', (t) => {
  const assert = tspl(t, { plan: 5 })

  const enterCh = diagnosticsChannel.channel('undici:interceptor:enter')
  const exitCh = diagnosticsChannel.channel('undici:interceptor:exit')

  const enterOrder = []
  const exitOrder = []
  const onEnter = (msg) => enterOrder.push(msg.interceptor)
  const onExit = (msg) => exitOrder.push(msg.interceptor)
  enterCh.subscribe(onEnter)
  exitCh.subscribe(onExit)
  t.after(() => {
    enterCh.unsubscribe(onEnter)
    exitCh.unsubscribe(onExit)
  })

  const server = createServer((req, res) => { res.statusCode = 200; res.end() })
  t.after(() => new Promise((resolve) => server.close(resolve)))

  server.listen(0, () => {
    function outer (dispatch) { return (opts, handler) => dispatch(opts, handler) }
    function inner (dispatch) { return (opts, handler) => dispatch(opts, handler) }
    const client = new Client(`http://localhost:${server.address().port}`).compose([
      outer, inner
    ])
    t.after(() => client.close())
    client.dispatch({ path: '/', method: 'GET' }, makeHandler({
      onEnd: () => {
        // exit events fire AFTER the handler's onResponseEnd (try/finally
        // around the inner call), so defer to the next tick to observe
        // both hops' exits.
        setImmediate(() => {
          assert.equal(enterOrder.length, 2)
          assert.equal(exitOrder.length, 2)
          assert.ok(enterOrder.includes('outer'))
          assert.ok(enterOrder.includes('inner'))
          assert.deepStrictEqual(exitOrder.slice().sort(), ['inner', 'outer'])
        })
      }
    }))
  })

  return assert.completed
})

test('Diagnostics channel - interceptor hop: anonymous interceptor name', (t) => {
  const assert = tspl(t, { plan: 2 })

  const enterCh = diagnosticsChannel.channel('undici:interceptor:enter')
  const onEnter = (msg) => assert.equal(msg.interceptor, 'anonymous')
  enterCh.subscribe(onEnter)
  t.after(() => enterCh.unsubscribe(onEnter))

  const server = createServer((req, res) => { res.statusCode = 200; res.end() })
  t.after(() => new Promise((resolve) => server.close(resolve)))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`).compose([
      (dispatch) => (opts, handler) => dispatch(opts, handler)
    ])
    t.after(() => client.close())
    client.dispatch({ path: '/', method: 'GET' }, makeHandler({
      onEnd: () => assert.ok(true, 'request completed')
    }))
  })

  return assert.completed
})

test('Diagnostics channel - interceptor hop: synchronous interceptor throw', (t) => {
  const assert = tspl(t, { plan: 3 })

  const enterCh = diagnosticsChannel.channel('undici:interceptor:enter')
  const errorCh = diagnosticsChannel.channel('undici:interceptor:error')

  const onEnter = (msg) => assert.equal(msg.interceptor, 'boom')
  const onError = (msg) => {
    assert.equal(msg.interceptor, 'boom')
    assert.equal(msg.error.message, 'nope')
  }
  enterCh.subscribe(onEnter)
  errorCh.subscribe(onError)
  t.after(() => {
    enterCh.unsubscribe(onEnter)
    errorCh.unsubscribe(onError)
  })

  const server = createServer(() => {})
  t.after(() => new Promise((resolve) => server.close(resolve)))

  server.listen(0, () => {
    function boom (_dispatch) {
      return (_opts, _handler) => { throw new Error('nope') }
    }
    const client = new Client(`http://localhost:${server.address().port}`).compose([
      boom
    ])
    t.after(() => client.close())
    try {
      client.dispatch({ path: '/', method: 'GET' }, makeHandler())
    } catch (_err) {
      // expected
    }
  })

  return assert.completed
})
