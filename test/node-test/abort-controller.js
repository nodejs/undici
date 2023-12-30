'use strict'

const { test } = require('node:test')
const { AbortController: NPMAbortController } = require('abort-controller')
const { Client, errors } = require('../..')
const { createServer } = require('http')
const { createReadStream } = require('fs')
const { wrapWithAsyncIterable } = require('../utils/async-iterators')
const { tspl } = require('@matteo.collina/tspl')

/**
 * A port of tap's `t.type` that can be used with `node:assert`
 * https://github.com/tapjs/tapjs/blob/511019b2ac0fa014370154c3a341a0e632f50b19/src/asserts/src/index.ts#L199
 */
function ttype (plan, obj, klass) {
  const name =
      typeof klass === 'function'
        ? klass.name || '(anonymous constructor)'
        : klass

  if (obj === klass) {
    return plan.ok(1)
  }

  const tof = typeof obj
  const type =
      !obj && tof === 'object'
        ? 'null'
        // treat as object, but not Object
        // t.type(() => {}, Function)
        : tof === 'function' &&
          typeof klass === 'function' &&
          klass !== Object
          ? 'object'
          : tof

  if (
    (type === 'number' && klass === Number) ||
    (type === 'string' && klass === String) ||
    (type === 'bigint' && klass === BigInt) ||
    (klass === 'array' && Array.isArray(obj)) ||
    (type === 'symbol' && klass === Symbol)
  ) {
    return plan.ok(1)
  }

  // simplest case, it literally is the same thing
  if (type === 'object' && klass !== 'object') {
    if (typeof klass === 'function') {
      return plan.ok(obj instanceof klass)
    }

    // check prototype chain for name
    // at this point, we already know klass is not a function
    // if the klass specified is an obj in the proto chain, pass
    // if the name specified is the name of a ctor in the chain, pass
    for (let p = obj; p; p = Object.getPrototypeOf(p)) {
      const ctor = p.constructor && p.constructor.name
      if (p === klass || ctor === name) {
        return plan.ok(1)
      }
    }
  }

  return plan.strictEqual(type, name)
}

/**
 * The helper function to create a promise with resolvers.
 * Please see https://github.com/tc39/proposal-promise-with-resolvers for more details.
 */
function promiseWithResolvers () {
  let _resolve, _reject
  const promise = new Promise((resolve, reject) => {
    _resolve = resolve
    _reject = reject
  })
  return { promise, resolve: _resolve, reject: _reject }
}

const controllers = [{
  AbortControllerImpl: NPMAbortController,
  controllerName: 'npm-abortcontroller-shim'
}]

if (global.AbortController) {
  controllers.push({
    AbortControllerImpl: global.AbortController,
    controllerName: 'native-abortcontroller'
  })
}
for (const { AbortControllerImpl, controllerName } of controllers) {
  test(`Abort ${controllerName} before creating request`, async (t) => {
    const p = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      p.fail()
    })
    t.after(server.close.bind(server))

    const { promise, resolve } = promiseWithResolvers()

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const abortController = new AbortControllerImpl()
      t.after(client.destroy.bind(client))

      abortController.abort()

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        ttype(p, err, errors.RequestAbortedError)
        resolve()
      })
    })

    await promise
  })

  test(`Abort ${controllerName} before sending request (no body)`, async (t) => {
    const p = tspl(t, { plan: 3 })

    let count = 0
    const server = createServer((req, res) => {
      if (count === 1) {
        p.fail('The second request should never be executed')
      }
      count += 1
      res.end('hello')
    })
    t.after(server.close.bind(server))

    const { promise: promise1, resolve: resolve1 } = promiseWithResolvers()
    const { promise: promise2, resolve: resolve2 } = promiseWithResolvers()

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const abortController = new AbortControllerImpl()
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, response) => {
        p.ifError(err)
        const bufs = []
        response.body.on('data', (buf) => {
          bufs.push(buf)
        })
        response.body.on('end', () => {
          p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
          resolve1()
        })
      })

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        ttype(p, err, errors.RequestAbortedError)
        resolve2()
      })

      abortController.abort()
    })

    await Promise.all([promise1, promise2])
  })

  test(`Abort ${controllerName} while waiting response (no body)`, async (t) => {
    const p = tspl(t, { plan: 1 })

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      abortController.abort()
      res.setHeader('content-type', 'text/plain')
      res.end('hello world')
    })
    t.after(server.close.bind(server))

    const { promise, resolve } = promiseWithResolvers()

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        ttype(p, err, errors.RequestAbortedError)
        resolve()
      })
    })

    await promise
  })

  test(`Abort ${controllerName} while waiting response (write headers started) (no body)`, async (t) => {
    const p = tspl(t, { plan: 1 })

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.flushHeaders()
      abortController.abort()
      res.end('hello world')
    })
    t.after(server.close.bind(server))

    const { promise, resolve } = promiseWithResolvers()

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        ttype(p, err, errors.RequestAbortedError)
        resolve()
      })
    })

    await promise
  })

  test(`Abort ${controllerName} while waiting response (write headers and write body started) (no body)`, async (t) => {
    const p = tspl(t, { plan: 2 })

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('hello')
    })
    t.after(server.close.bind(server))

    const { promise, resolve } = promiseWithResolvers()

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        p.ifError(err)
        response.body.on('data', () => {
          abortController.abort()
        })
        response.body.on('error', err => {
          ttype(p, err, errors.RequestAbortedError)
          resolve()
        })
      })
    })

    await promise
  })

  function waitingWithBody (body, type) { // eslint-disable-line
    test(`Abort ${controllerName} while waiting response (with body ${type})`, async (t) => {
      const p = tspl(t, { plan: 1 })

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        abortController.abort()
        res.setHeader('content-type', 'text/plain')
        res.end('hello world')
      })
      t.after(server.close.bind(server))

      const { promise, resolve } = promiseWithResolvers()
      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.after(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          ttype(p, err, errors.RequestAbortedError)
          resolve()
        })
      })

      await promise
    })
  }

  waitingWithBody('hello', 'string')
  waitingWithBody(createReadStream(__filename), 'stream')
  waitingWithBody(new Uint8Array([42]), 'Uint8Array')
  waitingWithBody(wrapWithAsyncIterable(createReadStream(__filename)), 'async-iterator')

  function writeHeadersStartedWithBody (body, type) {  // eslint-disable-line
    test(`Abort ${controllerName} while waiting response (write headers started) (with body ${type})`, async (t) => {
      const p = tspl(t, { plan: 1 })

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.flushHeaders()
        abortController.abort()
        res.end('hello world')
      })
      t.after(server.close.bind(server))

      const { promise, resolve } = promiseWithResolvers()
      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.after(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          ttype(p, err, errors.RequestAbortedError)
          resolve()
        })
      })
      await promise
    })
  }

  writeHeadersStartedWithBody('hello', 'string')
  writeHeadersStartedWithBody(createReadStream(__filename), 'stream')
  writeHeadersStartedWithBody(new Uint8Array([42]), 'Uint8Array')
  writeHeadersStartedWithBody(wrapWithAsyncIterable(createReadStream(__filename)), 'async-iterator')

  function writeBodyStartedWithBody (body, type) { // eslint-disable-line
    test(`Abort ${controllerName} while waiting response (write headers and write body started) (with body ${type})`, async (t) => {
      const p = tspl(t, { plan: 2 })

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.write('hello')
      })
      t.after(server.close.bind(server))

      const { promise, resolve } = promiseWithResolvers()
      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.after(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          p.ifError(err)
          response.body.on('data', () => {
            abortController.abort()
          })
          response.body.on('error', err => {
            ttype(p, err, errors.RequestAbortedError)
            resolve()
          })
        })
      })
      await promise
    })
  }

  writeBodyStartedWithBody('hello', 'string')
  writeBodyStartedWithBody(createReadStream(__filename), 'stream')
  writeBodyStartedWithBody(new Uint8Array([42]), 'Uint8Array')
  writeBodyStartedWithBody(wrapWithAsyncIterable(createReadStream(__filename), 'async-iterator'))
}
