'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { readFileSync, createReadStream } = require('fs')

test('basic get', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.call({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
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

    client.call({ path: '/', method: 'POST', body: expected }, (err, { statusCode, headers, body }) => {
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

    client.call({ path: '/', method: 'POST', body: expected }, (err, { statusCode, headers, body }) => {
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

    client.call({
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

    client.call({
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
      makeCall(i)
    }

    function makeCall (i) {
      client.call({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
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

test('10 times GET with pipelining 5', (t) => {
  const num = 10
  t.plan(5 * num - 1)

  let count = 0
  let total = 0
  const server = createServer((req, res) => {
    const curr = total++
    count++
    total++
    t.ok(count <= 5)
    setTimeout(function () {
      if (curr !== 0) {
        t.ok(count > 1, 'count greater than 1')
      }
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 5
    })
    t.tearDown(client.close.bind(client))

    for (var i = 0; i < num; i++) {
      makeCall(i)
    }

    function makeCall (i) {
      makeCallAndExpectUrl(client, i, t, () => count--)
    }
  })
})

function makeCallAndExpectUrl (client, i, t, cb) {
  return client.call({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
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
      t.ok(makeCall(), 'we can send more calls')
    }

    t.notOk(client.full, 'client is full')
    t.notOk(makeCall(), 'we must stop now')
    t.ok(client.full, 'client is full')

    client.on('drain', () => {
      t.ok(countGreaterThanOne, 'seen more than one parallel request')
      const start = sent
      for (; sent < start + 3 && sent < num;) {
        t.notOk(client.full, 'client is not full')
        t.ok(makeCall())
      }
    })

    function makeCall () {
      return makeCallAndExpectUrl(client, sent++, t, () => count--)
    }
  })
})
