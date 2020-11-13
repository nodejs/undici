'use strict'

const { test } = require('tap')
const { AbortController: NPMAbortController } = require('abort-controller')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { createReadStream } = require('fs')

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
  test(`Abort ${controllerName} before creating request`, (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      t.fail()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const abortController = new AbortControllerImpl()
      t.teardown(client.destroy.bind(client))

      abortController.abort()

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })

  test(`Abort ${controllerName} before sending request (no body)`, (t) => {
    t.plan(3)

    let count = 0
    const server = createServer((req, res) => {
      if (count === 1) {
        t.fail('The second request should never be executed')
      }
      count += 1
      res.end('hello')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const abortController = new AbortControllerImpl()
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, response) => {
        t.error(err)
        const bufs = []
        response.body.on('data', (buf) => {
          bufs.push(buf)
        })
        response.body.on('end', () => {
          t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })

      abortController.abort()
    })
  })

  test(`Abort ${controllerName} while waiting response (no body)`, (t) => {
    t.plan(1)

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      abortController.abort()
      res.setHeader('content-type', 'text/plain')
      res.end('hello world')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })

  test(`Abort ${controllerName} while waiting response (write headers started) (no body)`, (t) => {
    t.plan(1)

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.flushHeaders()
      abortController.abort()
      res.end('hello world')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })

  test(`Abort ${controllerName} while waiting response (write headers and write body started) (no body)`, (t) => {
    t.plan(2)

    const abortController = new AbortControllerImpl()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('hello')
      res.end('world')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
        t.error(err)
        response.body.on('data', () => {
          abortController.abort()
        })
        response.body.on('error', err => {
          t.ok(err instanceof errors.RequestAbortedError)
        })
      })
    })
  })

  function waitingWithBody (body, type) { // eslint-disable-line
    test(`Abort ${controllerName} while waiting response (with body ${type})`, (t) => {
      t.plan(1)

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        abortController.abort()
        res.setHeader('content-type', 'text/plain')
        res.end('hello world')
      })
      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.teardown(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          t.ok(err instanceof errors.RequestAbortedError)
        })
      })
    })
  }

  waitingWithBody('hello', 'string')
  waitingWithBody(createReadStream(__filename), 'stream')
  waitingWithBody(new Uint8Array([42]), 'Uint8Array')

  function writeHeadersStartedWithBody (body, type) {  // eslint-disable-line
    test(`Abort ${controllerName} while waiting response (write headers started) (with body ${type})`, (t) => {
      t.plan(1)

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.flushHeaders()
        abortController.abort()
        res.end('hello world')
      })
      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.teardown(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          t.ok(err instanceof errors.RequestAbortedError)
        })
      })
    })
  }

  writeHeadersStartedWithBody('hello', 'string')
  writeHeadersStartedWithBody(createReadStream(__filename), 'stream')
  writeHeadersStartedWithBody(new Uint8Array([42]), 'Uint8Array')

  function writeBodyStartedWithBody (body, type) { // eslint-disable-line
    test(`Abort ${controllerName} while waiting response (write headers and write body started) (with body ${type})`, (t) => {
      t.plan(2)

      const abortController = new AbortControllerImpl()
      const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.write('hello')
        res.end('world')
      })
      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        const client = new Client(`http://localhost:${server.address().port}`)
        t.teardown(client.destroy.bind(client))

        client.request({ path: '/', method: 'POST', body, signal: abortController.signal }, (err, response) => {
          t.error(err)
          response.body.on('data', () => {
            abortController.abort()
          })
          response.body.on('error', err => {
            t.ok(err instanceof errors.RequestAbortedError)
          })
        })
      })
    })
  }

  writeBodyStartedWithBody('hello', 'string')
  writeBodyStartedWithBody(createReadStream(__filename), 'stream')
  writeBodyStartedWithBody(new Uint8Array([42]), 'Uint8Array')
}
