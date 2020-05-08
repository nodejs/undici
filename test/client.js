'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { readFileSync, createReadStream } = require('fs')
const { finished, Readable } = require('readable-stream')

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

test('20 times GET with pipelining 10', (t) => {
  const num = 20
  t.plan(3 * num + 1)

  let count = 0
  let countGreaterThanOne = false
  const server = createServer((req, res) => {
    count++
    setTimeout(function () {
      countGreaterThanOne = countGreaterThanOne || count > 1
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  // needed to check for a warning on the maxListeners on the socket
  process.on('warning', t.fail)
  t.tearDown(() => {
    process.removeListener('warning', t.fail)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    t.tearDown(client.close.bind(client))

    for (var i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      makeRequestAndExpectUrl(client, i, t, () => {
        count--

        if (i === num - 1) {
          t.ok(countGreaterThanOne, 'seen more than one parallel request')
        }
      })
    }
  })
})

function makeRequestAndExpectUrl (client, i, t, cb) {
  return client.request({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
    cb()
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

test('20 times HEAD with pipelining 10', (t) => {
  const num = 20
  t.plan(3 * num + 1)

  let count = 0
  let countGreaterThanOne = false
  const server = createServer((req, res) => {
    count++
    setTimeout(function () {
      countGreaterThanOne = countGreaterThanOne || count > 1
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  // needed to check for a warning on the maxListeners on the socket
  process.on('warning', t.fail)
  t.tearDown(() => {
    process.removeListener('warning', t.fail)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    t.tearDown(client.close.bind(client))

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      makeHeadRequestAndExpectUrl(client, i, t, () => {
        count--

        if (i === num - 1) {
          t.ok(countGreaterThanOne, 'seen more than one parallel request')
        }
      })
    }
  })
})

function makeHeadRequestAndExpectUrl (client, i, t, cb) {
  return client.request({ path: '/' + i, method: 'HEAD' }, (err, { statusCode, headers, body }) => {
    cb()
    t.error(err)
    t.strictEqual(statusCode, 200)
    t.strictEqual(body, null)
  })
}

test('A client should enqueue as much as twice its pipelining factor', (t) => {
  const num = 10
  let sent = 0
  t.plan(6 * num + 5)

  let count = 0
  let countGreaterThanOne = false
  const server = createServer((req, res) => {
    count++
    t.ok(count <= 5)
    setTimeout(function () {
      countGreaterThanOne = countGreaterThanOne || count > 1
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.close.bind(client))

    for (; sent < 2;) {
      t.notOk(client.full, 'client is not full')
      t.ok(makeRequest(), 'we can send more requests')
    }

    t.notOk(client.full, 'client is full')
    t.notOk(makeRequest(), 'we must stop now')
    t.ok(client.full, 'client is full')

    client.on('drain', () => {
      t.ok(countGreaterThanOne, 'seen more than one parallel request')
      const start = sent
      for (; sent < start + 2 && sent < num;) {
        t.notOk(client.full, 'client is not full')
        t.ok(makeRequest())
      }
    })

    function makeRequest () {
      return makeRequestAndExpectUrl(client, sent++, t, () => count--)
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

test('close should call callback once finished', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    setTimeout(function () {
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.on('drain', () => {
      t.fail()
    })
    client.close((err) => {
      t.strictEqual(err, null)
      t.strictEqual(client.closed, true)
    })

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        data.body.resume()
      })
    }
  })
})

test('close should still reconnect', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.close((err) => {
      t.strictEqual(err, null)
      t.strictEqual(client.closed, true)
    })
    client.socket.destroy()

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' }, (err, data) => {
        data.body.resume()
        t.error(err)
      })
    }
  })
})

test('close waits until socket is destroyed', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    makeRequest()

    client.on('connect', () => {
      let done = false
      finished(client.socket, () => {
        done = true
      })
      client.destroy(null, (err) => {
        t.error(err)
      })
      client.close((err) => {
        t.error(err)
        t.strictEqual(client.closed, true)
        t.strictEqual(done, true)
      })
    })

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.ok(err)
      })
    }
  })
})

test('pipeline 1 is 1 active request', (t) => {
  t.plan(7)

  let res2
  const server = createServer((req, res) => {
    res.write('asd')
    res2 = res
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

    t.ok(client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.strictEqual(client.size, 1)
      t.error(err)
      t.notOk(client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        finished(data.body, (err) => {
          t.ok(err)
        })
        data.body.destroy()
      }))
      data.body.resume()
      res2.end()
    }))
    t.strictEqual(client.size, 1)
  })
})

test('pipelined chunked POST ', (t) => {
  t.plan(4 + 8 + 8)

  let a = 0
  let b = 0

  const server = createServer((req, res) => {
    req.on('data', chunk => {
      // Make sure a and b don't interleave.
      t.ok(a === 9 || b === 0)
      res.write(chunk)
    }).on('end', () => {
      res.end()
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.error(err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
        read () {
          this.push(++a > 8 ? null : 'a')
        }
      })
    }, (err, { body }) => {
      body.resume()
      t.error(err)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.error(err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
        read () {
          this.push(++b > 8 ? null : 'b')
        }
      })
    }, (err, { body }) => {
      body.resume()
      t.error(err)
    })
  })
})

test('aborted GET', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    function write () {
      while (res.write('asdasdasdasd')) {
      }
    }
    res.once('drain', write)
    write()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2,
      maxAbortedPayload: 100
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

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err)
    })

    client.close((err) => {
      t.error(err)
    })
  })
})
