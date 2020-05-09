'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { readFileSync, createReadStream } = require('fs')

test('basic get', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('localhost', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('basic head', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('HEAD', req.method)
    t.strictEqual('localhost', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      t.strictEqual(body, null)
    })
  })
})

test('get with host header', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello from example.com', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('head with host header', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('HEAD', req.method)
    t.strictEqual('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'HEAD', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      t.strictEqual(body, null)
    })
  })
})

function postServer (t, expected) {
  return function (req, res) {
    t.strictEqual(req.url, '/')
    t.strictEqual(req.method, 'POST')

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.strictEqual(data, expected)
      res.end('hello')
    })
  }
}

test('basic POST with string', (t) => {
  t.plan(6)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: expected }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('basic POST with empty string', (t) => {
  t.plan(6)

  const server = createServer(postServer(t, ''))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: '' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('basic POST with string and content-length', (t) => {
  t.plan(6)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      body: expected
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('basic POST with Buffer', (t) => {
  t.plan(6)

  const expected = readFileSync(__filename)

  const server = createServer(postServer(t, expected.toString()))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: expected }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('basic POST with stream', (t) => {
  t.plan(6)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      body: createReadStream(__filename)
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('basic POST with transfer encoding: chunked', (t) => {
  t.plan(6)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      // no content-length header
      body: createReadStream(__filename)
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('10 times GET', (t) => {
  const num = 10
  t.plan(3 * 10)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    for (var i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.strictEqual(statusCode, 200)
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.strictEqual('/' + i, Buffer.concat(bufs).toString('utf8'))
        })
      })
    }
  })
})

test('10 times HEAD', (t) => {
  const num = 10
  t.plan(3 * 10)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    for (var i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'HEAD' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.strictEqual(statusCode, 200)
        t.strictEqual(body, null)
      })
    }
  })
})

test('Set-Cookie', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.setHeader('Set-Cookie', ['a cookie', 'another cookie'])
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictDeepEqual(headers['Set-Cookie'], ['a cookie', 'another cookie'])
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('aborted GET maxAbortedPayload reset', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(1e6 - 1))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2,
      maxAbortedPayload: 1e6
    })
    t.tearDown(client.close.bind(client))

    client.on('reconnect', () => {
      t.fail()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', (chunk) => {
        body.destroy()
      }).once('error', (err) => {
        t.ok(err)
      }).on('end', () => {
        t.fail()
      })
    })

    // Make sure read counter is reset.
    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', (chunk) => {
        body.destroy()
      }).on('error', (err) => {
        t.ok(err)
      }).on('end', () => {
        t.fail()
      })
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })
  })
})

test('aborted GET maxAbortedPayload', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(100000 + 1, 'a'))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1,
      maxAbortedPayload: 100000
    })
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', () => {
        body.destroy()
      }).once('error', (err) => {
        t.ok(err)
      })
        // old Readable emits error twice
        .on('error', () => {})
    })

    client.on('reconnect', () => {
      t.pass()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })

    client.close((err) => {
      t.error(err)
    })
  })
})

test('aborted GET maxAbortedPayload less than HWM', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1,
      maxAbortedPayload: 4
    })
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', () => {
        body.destroy()
      }).once('error', (err) => {
        t.ok(err)
      })
        // old Readable emits error twice
        .on('error', () => {})
    })

    client.on('reconnect', () => {
      t.fail()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })

    client.close((err) => {
      t.error(err)
    })
  })
})

test('ignore request header mutations', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    t.strictEqual(req.headers.test, 'test')
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const headers = { test: 'test' }
    client.request({
      path: '/',
      method: 'GET',
      headers
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })
    headers.test = 'asd'
  })
})

test('drain when queue is empty', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

    client.on('drain', () => {
      t.strictEqual(client.size, 0)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })
  })
})
