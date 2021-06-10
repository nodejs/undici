'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')

class OnAbortError extends Error {}

test('aborted response errors', (t) => {
  t.plan(3)

  const server = createServer()
  server.once('request', (req, res) => {
    // TODO: res.write will cause body to emit 'error' twice
    // due to bug in readable-stream.
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.destroy()
      body
        .on('error', err => {
          t.type(err, errors.RequestAbortedError)
        })
        .on('close', () => {
          t.pass()
        })
    })
  })
})

test('aborted req', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

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
      t.type(err, errors.RequestAbortedError)
    })
  })
})

test('abort', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.dispatch({
      method: 'GET',
      path: '/'
    }, {
      onConnect (abort) {
        setImmediate(abort)
      },
      onHeaders () {
        t.fail()
      },
      onData () {
        t.fail()
      },
      onComplete () {
        t.fail()
      },
      onError (err) {
        t.type(err, errors.RequestAbortedError)
      }
    })

    client.on('disconnect', () => {
      t.pass()
    })
  })
})

test('abort pipelined', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.teardown(client.destroy.bind(client))

    let counter = 0
    client.dispatch({
      method: 'GET',
      path: '/'
    }, {
      onConnect (abort) {
        // This request will be retried
        if (counter++ === 1) {
          abort()
        }
        t.pass()
      },
      onHeaders () {
        t.fail()
      },
      onData () {
        t.fail()
      },
      onComplete () {
        t.fail()
      },
      onError (err) {
        t.type(err, errors.RequestAbortedError)
      }
    })

    client.dispatch({
      method: 'GET',
      path: '/'
    }, {
      onConnect (abort) {
        abort()
      },
      onHeaders () {
        t.fail()
      },
      onData () {
        t.fail()
      },
      onComplete () {
        t.fail()
      },
      onError (err) {
        t.type(err, errors.RequestAbortedError)
      }
    })

    client.on('disconnect', () => {
      t.pass()
    })
  })
})

test('propagate unallowed throws in request.onError', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.dispatch({
      method: 'GET',
      path: '/'
    }, {
      onConnect (abort) {
        setImmediate(abort)
      },
      onHeaders () {
        t.pass()
      },
      onData () {
        t.pass()
      },
      onComplete () {
        t.pass()
      },
      onError () {
        throw new OnAbortError('error')
      }
    })

    client.on('error', (err) => {
      t.type(err, OnAbortError)
    })

    client.on('disconnect', () => {
      t.pass()
    })
  })
})
