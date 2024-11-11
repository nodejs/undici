'use strict'

const { test } = require('node:test')
const { Client, errors } = require('../..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { tspl } = require('@matteo.collina/tspl')

class OnAbortError extends Error {}

test('aborted response errors', async (t) => {
  const p = tspl(t, { plan: 3 })

  const server = createServer()
  server.once('request', (req, res) => {
    // TODO: res.write will cause body to emit 'error' twice
    // due to bug in readable-stream.
    res.end('asd')
  })
  t.after(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      p.ifError(err)
      body.destroy()
      body
        .on('error', err => {
          p.ok(err instanceof errors.RequestAbortedError)
        })
        .on('close', () => {
          p.ok(1)
        })
    })
  })

  await p.completed
})

test('aborted req', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.after(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({
      method: 'POST',
      path: '/',
      body: new Readable({
        read () {
          setImmediate(() => {
            this.destroy()
          })
        }
      })
    }, (err) => {
      p.ok(err instanceof errors.RequestAbortedError)
    })
  })

  await p.completed
})

test('abort', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  t.after(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.dispatch({
      method: 'GET',
      path: '/'
    }, {
      onConnect (abort) {
        setImmediate(abort)
      },
      onHeaders () {
        p.ok(0)
      },
      onData () {
        p.ok(0)
      },
      onComplete () {
        p.ok(0)
      },
      onError (err) {
        p.ok(err instanceof errors.RequestAbortedError)
      }
    })

    client.on('disconnect', () => {
      p.ok(1)
    })
  })

  await p.completed
})

test('abort pipelined', async (t) => {
  const p = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
  })
  t.after(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.after(client.destroy.bind(client))

    let counter = 0
    client.dispatch({
      method: 'GET',
      path: '/',
      blocking: false
    }, {
      onConnect (abort) {
        // This request will be retried
        if (counter++ === 1) {
          abort()
        }
        p.ok(1)
      },
      onHeaders () {
        p.ok(0)
      },
      onData () {
        p.ok(0)
      },
      onComplete () {
        p.ok(0)
      },
      onError (err) {
        p.ok(err instanceof errors.RequestAbortedError)
      }
    })

    client.dispatch({
      method: 'GET',
      path: '/',
      blocking: false
    }, {
      onConnect (abort) {
        abort()
      },
      onHeaders () {
        p.ok(0)
      },
      onData () {
        p.ok(0)
      },
      onComplete () {
        p.ok(0)
      },
      onError (err) {
        p.ok(err instanceof errors.RequestAbortedError)
      }
    })

    client.on('disconnect', () => {
      p.ok(1)
    })
  })

  await p.completed
})

test('propagate unallowed throws in request.onError', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  t.after(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.dispatch({
      method: 'GET',
      path: '/'
    }, {
      onConnect (abort) {
        setImmediate(abort)
      },
      onHeaders () {
        p.ok(0)
      },
      onData () {
        p.ok(0)
      },
      onComplete () {
        p.ok(0)
      },
      onError () {
        throw new OnAbortError('error')
      }
    })

    client.on('error', (err) => {
      p.ok(err instanceof OnAbortError)
    })

    client.on('disconnect', () => {
      p.ok(1)
    })
  })

  await p.completed
})
