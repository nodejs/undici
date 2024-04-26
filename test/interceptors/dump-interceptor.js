'use strict'

const { setTimeout: sleep } = require('node:timers/promises')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')

const { Client, interceptors } = require('../..')
const { dump } = interceptors

test('Should not dump on abort', async t => {
  t = tspl(t, { plan: 4 })
  const server = createServer((req, res) => {
    const max = 1024 * 1024
    let offset = 0
    const buffer = Buffer.alloc(max)

    res.writeHead(200, {
      'Content-Length': buffer.length,
      'Content-Type': 'application/octet-stream'
    })

    const interval = setInterval(() => {
      offset += 256
      const chunk = buffer.subarray(offset - 256, offset + 1)

      if (offset === max) {
        clearInterval(interval)
        res.end(chunk)
        return
      }

      res.write(chunk)
    }, 250)
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
  ).compose(dump({ dumpOnAbort: false }))

  after(async () => {
    await client.close()

    server.close()
    await once(server, 'close')
  })

  const response = await client.request(requestOptions)
  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-length'], `${1024 * 1024}`)
  await sleep(500)
  abc.abort()

  try {
    await response.body.text()
    t.fail('Should not reach this point')
  } catch (error) {
    t.equal(error.name, 'AbortError')
    t.equal(error.message, 'This operation was aborted')
  }

  await t.completed
})

test('Should dump on abort', async t => {
  t = tspl(t, { plan: 2 })
  const server = createServer((req, res) => {
    const max = 1024 * 1024
    let offset = 0
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
    }, 250)
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
  t.equal(response.statusCode, 200)

  await sleep(500)
  abc.abort()

  const body = await response.body.text()
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
  t = tspl(t, { plan: 12 })

  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ dumpOnAbort: {} }))
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
      message: 'dumpOnAbort must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost')
        .compose(dump({ dumpOnAbort: 'true' }))
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
      message: 'dumpOnAbort must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump({ dumpOnAbort: 1 })).dispatch(
        {
          method: 'GET',
          path: '/'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'dumpOnAbort must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          dumpOnAbort: {}
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'dumpOnAbort must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          dumpOnAbort: 'false'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'dumpOnAbort must be a boolean'
    }
  )
  t.throws(
    () => {
      new Client('http://localhost').compose(dump()).dispatch(
        {
          method: 'GET',
          path: '/',
          dumpOnAbort: '0'
        },
        {}
      )
    },
    {
      name: 'InvalidArgumentError',
      message: 'dumpOnAbort must be a boolean'
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

  await t.rejects(
    () => {
      return client.request(requestOptions).then(res => res.body.text())
    },
    {
      name: 'AbortError',
      message: 'Response size (2048) larger than maxSize (1024)'
    }
  )

  await t.completed
})
