'use strict'

const { test } = require('node:test')
const { AbortController: NPMAbortController } = require('abort-controller')
const { Client, errors } = require('../..')
const { createServer } = require('node:http')
const { createReadStream } = require('node:fs')
const { wrapWithAsyncIterable } = require('../utils/async-iterators')
const { tspl } = require('@matteo.collina/tspl')
const { closeServerAsPromise } = require('../utils/node-http')

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
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const abortController = new AbortControllerImpl()
      t.after(client.destroy.bind(client))

      abortController.abort()

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
      })
    })

    await p.completed
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
    t.after(closeServerAsPromise(server))

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
        })
      })

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
      })

      abortController.abort()
    })

    await p.completed
  })

  test(`Abort ${controllerName} while waiting response (no body)`, async (t) => {
    const p = tspl(t, { plan: 1 })

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      abortController.abort()
      res.setHeader('content-type', 'text/plain')
      res.end('hello world')
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
      })
    })

    await p.completed
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
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
      })
    })

    await p.completed
  })

  test(`Abort ${controllerName} while waiting response (write headers and write body started) (no body)`, async (t) => {
    const p = tspl(t, { plan: 2 })

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('hello')
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        p.ifError(err)
        response.body.on('data', () => {
          abortController.abort()
        })
        response.body.on('error', err => {
          p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
        })
      })
    })

    await p.completed
  })

  function waitingWithBody (body, type) {
    test(`Abort ${controllerName} while waiting response (with body ${type})`, async (t) => {
      const p = tspl(t, { plan: 1 })

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        abortController.abort()
        res.setHeader('content-type', 'text/plain')
        res.end('hello world')
      })
      t.after(closeServerAsPromise(server))

      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.after(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
        })
      })
      await p.completed
    })
  }

  waitingWithBody('hello', 'string')
  waitingWithBody(createReadStream(__filename), 'stream')
  waitingWithBody(new Uint8Array([42]), 'Uint8Array')
  waitingWithBody(wrapWithAsyncIterable(createReadStream(__filename)), 'async-iterator')

  function writeHeadersStartedWithBody (body, type) {
    test(`Abort ${controllerName} while waiting response (write headers started) (with body ${type})`, async (t) => {
      const p = tspl(t, { plan: 1 })

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.flushHeaders()
        abortController.abort()
        res.end('hello world')
      })
      t.after(closeServerAsPromise(server))

      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.after(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
        })
      })
      await p.completed
    })
  }

  writeHeadersStartedWithBody('hello', 'string')
  writeHeadersStartedWithBody(createReadStream(__filename), 'stream')
  writeHeadersStartedWithBody(new Uint8Array([42]), 'Uint8Array')
  writeHeadersStartedWithBody(wrapWithAsyncIterable(createReadStream(__filename)), 'async-iterator')

  function writeBodyStartedWithBody (body, type) {
    test(`Abort ${controllerName} while waiting response (write headers and write body started) (with body ${type})`, async (t) => {
      const p = tspl(t, { plan: 2 })

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.write('hello')
      })
      t.after(closeServerAsPromise(server))

      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.after(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          p.ifError(err)
          response.body.on('data', () => {
            abortController.abort()
          })
          response.body.on('error', err => {
            p.ok(err instanceof errors.RequestAbortedError || err instanceof DOMException)
          })
        })
      })
      await p.completed
    })
  }

  writeBodyStartedWithBody('hello', 'string')
  writeBodyStartedWithBody(createReadStream(__filename), 'stream')
  writeBodyStartedWithBody(new Uint8Array([42]), 'Uint8Array')
  writeBodyStartedWithBody(wrapWithAsyncIterable(createReadStream(__filename), 'async-iterator'))
}
