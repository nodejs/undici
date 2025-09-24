'use strict'
const { platform } = require('node:os')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')

const { Client, Agent, interceptors } = require('../..')
const { dump } = interceptors

// TODO: Fix tests on windows
const skip = platform() === 'win32'

test('Should handle preemptive network error', { skip }, async t => {
  t.plan(4)
  let offset = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const max = 1024 * 1024
    const buffer = Buffer.alloc(max)

    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'application/octet-stream'
    })

    const interval = setInterval(() => {
      offset += 256
      const chunk = buffer.subarray(offset - 256, offset)

      if (offset === max) {
        clearInterval(interval)
        res.end(chunk)
        return
      }

      res.write(chunk)
    }, 0)
  })

  const requestOptions = {
    method: 'GET',
    path: '/'
  }

  const client = new Agent().compose(dump({ maxSize: 1024 * 1024 }))

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  try {
    await client.request({
      origin: 'http://localhost',
      ...requestOptions
    })
  } catch (error) {
    t.assert.strictEqual(error.code, 'ECONNREFUSED')
  }

  server.listen(0)
  await once(server, 'listening')

  const response = await client.request({
    origin: `http://localhost:${server.address().port}`,
    ...requestOptions
  })
  const body = await response.body.text()

  t.assert.strictEqual(response.headers['content-length'], `${1024 * 1024}`)
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(body, '')
})

test('Should dump on abort', { skip }, async t => {
  t.plan(2)
  let offset = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const max = 1024 * 1024
    const buffer = Buffer.alloc(max)

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream'
    })

    const interval = setInterval(() => {
      offset += 256
      const chunk = buffer.subarray(offset - 256, offset)

      if (offset === max) {
        clearInterval(interval)
        res.end(chunk)
        return
      }

      res.write(chunk)
    }, 0)
  })

  const abc = new AbortController()

  const requestOptions = {
    method: 'GET',
    path: '/',
    signal: abc.signal
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump({ maxSize: 512 }))

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  const response = await client.request(requestOptions)

  abc.abort()

  try {
    await response.body.text()
  } catch (error) {
    t.assert.strictEqual(response.statusCode, 200)
    t.assert.strictEqual(error.name, 'AbortError')
  }
})

test('Should dump on already aborted request', { skip }, async t => {
  t.plan(3)
  let offset = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const max = 1024
    const buffer = Buffer.alloc(max)

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream'
    })

    res.once('close', () => {
      t.assert.strictEqual(offset, 1024)
    })

    const interval = setInterval(() => {
      offset += 256
      const chunk = buffer.subarray(offset - 256, offset)

      if (offset === max) {
        clearInterval(interval)
        res.end(chunk)
        return
      }

      res.write(chunk)
    }, 0)
  })

  const abc = new AbortController()

  const requestOptions = {
    method: 'GET',
    path: '/',
    signal: abc.signal
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump({ maxSize: 512 }))

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  abc.abort()
  client.request(requestOptions).catch(err => {
    t.assert.strictEqual(err.name, 'AbortError')
    t.assert.strictEqual(err.message, 'This operation was aborted')
  })
})

test('Should dump response body up to limit (default)', { skip }, async t => {
  t.plan(3)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const buffer = Buffer.alloc(1024 * 1024)
    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'application/octet-stream'
    })

    res.end(buffer)
  })

  const requestOptions = {
    method: 'GET',
    path: '/'
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump())

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  const response = await client.request(requestOptions)
  const body = await response.body.text()

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-length'], `${1024 * 1024}`)
  t.assert.strictEqual(body, '')
})

test('Should dump response body up to limit and ignore trailers', { skip }, async t => {
  t.plan(3)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked',
      Trailer: 'X-Foo'
    })

    res.write(Buffer.alloc(1024 * 1024).toString('utf-8'))
    res.addTrailers({ 'X-Foo': 'bar' })
    res.end()
  })

  const requestOptions = {
    method: 'GET',
    path: '/'
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump())

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  const response = await client.request(requestOptions)
  const body = await response.body.text()

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(body, '')
  t.assert.strictEqual(response.trailers['x-foo'], undefined)
})

test('Should forward common error', { skip }, async t => {
  t.plan(1)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.destroy()
  })

  const requestOptions = {
    method: 'GET',
    path: '/'
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump())

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  await t.assert.rejects(client.request.bind(client, requestOptions), {
    name: 'SocketError',
    code: 'UND_ERR_SOCKET',
    message: 'other side closed'
  })
})

test('Should throw on bad opts', { skip }, async t => {
  t.plan(6)

  t.assert.throws(
    () => {
      new Client('http://localhost').compose(dump({ maxSize: {} })).dispatch(
        {
          method: 'GET',
          path: '/'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'maxSize must be a number greater than 0'
    }
  )
  t.assert.throws(
    () => {
      new Client('http://localhost').compose(dump({ maxSize: '0' })).dispatch(
        {
          method: 'GET',
          path: '/'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'maxSize must be a number greater than 0'
    }
  )
  t.assert.throws(
    () => {
      new Client('http://localhost').compose(dump({ maxSize: -1 })).dispatch(
        {
          method: 'GET',
          path: '/'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'maxSize must be a number greater than 0'
    }
  )
  t.assert.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          dumpMaxSize: {}
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'maxSize must be a number greater than 0'
    }
  )
  t.assert.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          dumpMaxSize: '0'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'maxSize must be a number greater than 0'
    }
  )
  t.assert.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          dumpMaxSize: -1
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'maxSize must be a number greater than 0'
    }
  )
})

test('Should dump response body up to limit (opts)', { skip }, async t => {
  t.plan(3)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const buffer = Buffer.alloc(1 * 1024)
    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'application/octet-stream'
    })
    res.end(buffer)
  })

  const requestOptions = {
    method: 'GET',
    path: '/'
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump({ maxSize: 1 * 1024 }))

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  const response = await client.request(requestOptions)
  const body = await response.body.text()

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-length'], `${1 * 1024}`)
  t.assert.strictEqual(body, '')
})

test('Should abort if content length grater than max size', { skip }, async t => {
  t.plan(1)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const buffer = Buffer.alloc(2 * 1024)
    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'application/octet-stream'
    })
    res.end(buffer)
  })

  const requestOptions = {
    method: 'GET',
    path: '/'
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump({ maxSize: 1 * 1024, abortOnDumped: false }))

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  await t.assert.rejects(client.request(requestOptions), {
    name: 'AbortError',
    message: 'Response size (2048) larger than maxSize (1024)'
  })
})

test('Should dump response body up to limit (dispatch opts)', { skip }, async t => {
  t.plan(3)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const buffer = Buffer.alloc(1 * 1024)
    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'application/octet-stream'
    })
    res.end(buffer)
  })

  const requestOptions = {
    method: 'GET',
    path: '/',
    dumpMaxSize: 1 * 1024,
    abortOnDumped: false
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump())

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  const response = await client.request(requestOptions)
  const body = await response.body.text()

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-length'], `${1 * 1024}`)
  t.assert.strictEqual(body, '')
})

test('Should abort if content length grater than max size (dispatch opts)', { skip }, async t => {
  t.plan(1)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const buffer = Buffer.alloc(2 * 1024)
    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'application/octet-stream'
    })
    res.end(buffer)
  })

  const requestOptions = {
    method: 'GET',
    path: '/',
    dumpMaxSize: 100
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(dump())

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  await t.assert.rejects(
    async () => {
      return await client.request(requestOptions).then(res => res.body.text())
    },
    {
      name: 'AbortError',
      message: 'Response size (2048) larger than maxSize (100)'
    }
  )
})
