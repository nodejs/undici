'use strict'
const { createServer } = require('node:http')
const { once } = require('node:events')

const { getLocal } = require('mockttp')
const tap = require('tap')

const { RetryHandler, Client } = require('..')

tap.test('Should retry status code', async t => {
  let counter = 0
  let res
  const chunks = []
  const server = getLocal()
  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }
  const promise = new Promise(resolve => {
    res = resolve
  })

  await server.start()

  const client = new Client(`http://localhost:${server.port}`)
  const handler = new RetryHandler(
    dispatchOptions,
    {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
          t.equal(counter, 2)
          res()
        },
        onError () {
          t.fail()
        }
      }
    },
    {
      retry: err => {
        counter++

        if (
          err.statusCode === 500 ||
          err.message.includes('other side closed')
        ) {
          return 500
        }
      }
    }
  )

  t.teardown(async () => {
    await client.close()
    await server.stop()
  })

  await server.forAnyRequest().thenCloseConnection()
  await server.forAnyRequest().thenReply(500, 'Internal Server Error')
  await server.forAnyRequest().thenReply(200, 'hello world!')

  client.dispatch(
    {
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'application/json'
      }
    },
    handler
  )

  await promise
})

tap.test('Should support idempotency over safe method', async t => {
  let res, rej
  const chunks = []
  const server = getLocal()
  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }
  const promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })

  await server.start()

  const client = new Client(`http://localhost:${server.port}`)
  const handler = new RetryHandler(dispatchOptions, {
    dispatch: client.dispatch.bind(client),
    handler: {
      onConnect () {
        t.pass()
      },
      onBodySent () {
        t.pass()
      },
      onHeaders (status, _rawHeaders, resume, _statusMessage) {
        t.equal(status, 200)
        return true
      },
      onData (chunk) {
        chunks.push(chunk)
        return true
      },
      onComplete () {
        t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
      },
      onError (err) {
        rej(err)
      }
    }
  })

  const handler2 = new RetryHandler(dispatchOptions, {
    dispatch: client.dispatch.bind(client),
    handler: {
      onConnect () {
        t.pass()
      },
      onBodySent () {
        t.pass()
      },
      onHeaders (status, _rawHeaders, resume, _statusMessage) {
        t.equal(status, 200)
        return true
      },
      onData (chunk) {
        chunks.push(chunk)
        return true
      },
      onComplete () {
        t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        rej()
      },
      onError (err) {
        t.equal(err.message, 'other side closed')
        t.equal(err.code, 'UND_ERR_SOCKET')
        res()
      }
    }
  })

  t.teardown(async () => {
    await client.close()
    await server.stop()
  })

  await server.forAnyRequest().thenCloseConnection()
  await server.forAnyRequest().thenReply(500, 'Internal Server Error')
  await server.forAnyRequest().thenReply(200, 'hello world!')
  await server.forAnyRequest().thenCloseConnection()

  client.dispatch(
    {
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'application/json'
      }
    },
    handler
  )

  client.dispatch(
    {
      method: 'POST',
      path: '/',
      headers: {
        'content-type': 'application/json'
      },
      body: 'hello world!'
    },
    handler2
  )

  return promise
})

tap.test('Should retry with defaults', async t => {
  let res, rej
  const chunks = []
  const server = getLocal()
  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }
  const promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })

  await server.start()

  const client = new Client(`http://localhost:${server.port}`)
  const handler = new RetryHandler(dispatchOptions, {
    dispatch: client.dispatch.bind(client),
    handler: {
      onConnect () {
        t.pass()
      },
      onBodySent () {
        t.pass()
      },
      onHeaders (status, _rawHeaders, resume, _statusMessage) {
        t.equal(status, 200)
        return true
      },
      onData (chunk) {
        chunks.push(chunk)
        return true
      },
      onComplete () {
        t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        res()
      },
      onError (err) {
        rej(err)
      }
    }
  })

  t.teardown(async () => {
    await client.close()
    await server.stop()
  })

  await server.forAnyRequest().thenCloseConnection()
  await server.forAnyRequest().thenReply(500, 'Internal Server Error')
  await server.forAnyRequest().thenReply(200, 'hello world!')

  client.dispatch(
    {
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'application/json'
      }
    },
    handler
  )

  await promise
})

tap.test('Should handle 206 partial content', async t => {
  const chunks = []
  let counter = 0
  let res

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.same(req.headers.range, 'bytes=3-')
      res.setHeader('content-range', 'bytes 3-6/6')
      res.setHeader('etag', 'asd')
      res.statusCode = 206
      res.end('def')
    }
    x++
  })

  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }
  const promise = new Promise(resolve => {
    res = resolve
  })

  server.listen()
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  const handler = new RetryHandler(
    dispatchOptions,
    {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {},
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
          t.equal(counter, 1)
          res()
        },
        onError () {
          t.fail()
        }
      }
    },
    {
      retry: function (err) {
        counter++

        if (err.code && err.code === 'UND_ERR_DESTROYED') {
          return null
        }

        return err.statusCode === 206 ? null : 800
      }
    }
  )

  client.dispatch(
    {
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'application/json'
      }
    },
    handler
  )

  t.teardown(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  await promise
})
