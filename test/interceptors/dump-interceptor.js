'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')

const { Client, interceptors } = require('../..')
const { dump } = interceptors

test('Should dump response body up to limit (no abort)', async t => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
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
  ).compose(dump({ abortOnDumped: false }))

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  const response = await client.request(requestOptions)
  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-length'], `${1024 * 1024}`)
  t.equal(body, '')

  await t.completed
})

test('Should dump response body up to limit (default)', async t => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
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

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-length'], `${1024 * 1024}`)
  t.equal(body, '')

  await t.completed
})

test('Should dump response body up to limit and wait for trailers', async t => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
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
    path: '/',
    waitForTrailers: true
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

  t.equal(response.statusCode, 200)
  t.equal(body, '')
  t.equal(response.trailers['x-foo'], 'bar')

  await t.completed
})

test('Should dump response body up to limit and ignore trailers', async t => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
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

  t.equal(response.statusCode, 200)
  t.equal(body, '')
  t.equal(response.trailers['x-foo'], undefined)

  await t.completed
})

test('Should forward common error', async t => {
  t = tspl(t, { plan: 1 })
  const server = createServer((req, res) => {
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

  await t.rejects(client.request.bind(client, requestOptions), {
    name: 'SocketError',
    code: 'UND_ERR_SOCKET',
    message: 'other side closed'
  })

  await t.completed
})

test('Should throw on bad opts', async t => {
  t = tspl(t, { plan: 18 })

  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ waitForTrailers: {} }))
        .dispatch(
          {
            method: 'GET',
            path: '/'
          },
          {}
        )
    },
    {
      name: 'InvalidArgumentError',
      message: 'waitForTrailers must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ waitForTrailers: 'true' }))
        .dispatch(
          {
            method: 'GET',
            path: '/'
          },
          {}
        )
    },
    {
      name: 'InvalidArgumentError',
      message: 'waitForTrailers must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ waitForTrailers: 1 }))
        .dispatch(
          {
            method: 'GET',
            path: '/'
          },
          {}
        )
    },
    {
      name: 'InvalidArgumentError',
      message: 'waitForTrailers must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          waitForTrailers: {}
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'waitForTrailers must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          waitForTrailers: 'false'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'waitForTrailers must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          waitForTrailers: '0'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'waitForTrailers must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ abortOnDumped: {} }))
        .dispatch(
          {
            method: 'GET',
            path: '/'
          },
          {}
        )
    },
    {
      name: 'InvalidArgumentError',
      message: 'abortOnDumped must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ abortOnDumped: 'true' }))
        .dispatch(
          {
            method: 'GET',
            path: '/'
          },
          {}
        )
    },
    {
      name: 'InvalidArgumentError',
      message: 'abortOnDumped must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ abortOnDumped: 1 }))
        .dispatch(
          {
            method: 'GET',
            path: '/'
          },
          {}
        )
    },
    {
      name: 'InvalidArgumentError',
      message: 'abortOnDumped must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          abortOnDumped: {}
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'abortOnDumped must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          abortOnDumped: 'false'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'abortOnDumped must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          abortOnDumped: '0'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'abortOnDumped must be a boolean'
    }
  )
  t.throws(
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
  t.throws(
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
  t.throws(
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
  t.throws(
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
  t.throws(
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
  t.throws(
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

test('Should dump response body up to limit (opts)', async t => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
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

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-length'], `${1 * 1024}`)
  t.equal(body, '')

  await t.completed
})

test('Should abort if content length grater than max size', async t => {
  t = tspl(t, { plan: 1 })
  const server = createServer((req, res) => {
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

  t.rejects(client.request(requestOptions), {
    name: 'AbortError',
    message: 'Response size (2048) larger than maxSize (1024)'
  })

  await t.completed
})

test('Should dump response body up to limit (dispatch opts)', async t => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
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

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-length'], `${1 * 1024}`)
  t.equal(body, '')

  await t.completed
})

test('Should abort if content length grater than max size (dispatch opts)', async t => {
  t = tspl(t, { plan: 1 })
  const server = createServer((req, res) => {
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
    dumpMaxSize: 1 * 1024
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

  t.rejects(client.request(requestOptions), {
    name: 'AbortError',
    message: 'Response size (2048) larger than maxSize (1024)'
  })

  await t.completed
})
