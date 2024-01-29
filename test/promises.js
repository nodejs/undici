'use strict'

const { test } = require('tap')
const { Client, Pool } = require('..')
const { createServer } = require('node:http')
const { readFileSync, createReadStream } = require('node:fs')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')

test('basic get, async await support', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })
})

function postServer (t, expected) {
  return function (req, res) {
    t.equal(req.url, '/')
    t.equal(req.method, 'POST')

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.equal(data, expected)
      res.end('hello')
    })
  }
}

test('basic POST with string, async await support', (t) => {
  t.plan(5)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      const { statusCode, body } = await client.request({ path: '/', method: 'POST', body: expected })
      t.equal(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })
})

test('basic POST with Buffer, async await support', (t) => {
  t.plan(5)

  const expected = readFileSync(__filename)

  const server = createServer(postServer(t, expected.toString()))
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      const { statusCode, body } = await client.request({ path: '/', method: 'POST', body: expected })
      t.equal(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })
})

test('basic POST with stream, async await support', (t) => {
  t.plan(5)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      const { statusCode, body } = await client.request({
        path: '/',
        method: 'POST',
        headers: {
          'content-length': Buffer.byteLength(expected)
        },
        body: createReadStream(__filename)
      })
      t.equal(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })
})

test('basic POST with async-iterator, async await support', (t) => {
  t.plan(5)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      const { statusCode, body } = await client.request({
        path: '/',
        method: 'POST',
        headers: {
          'content-length': Buffer.byteLength(expected)
        },
        body: wrapWithAsyncIterable(createReadStream(__filename))
      })
      t.equal(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })
})

test('20 times GET with pipelining 10, async await support', (t) => {
  const num = 20
  t.plan(2 * num + 1)

  const sleep = ms => new Promise((resolve, reject) => {
    setTimeout(resolve, ms)
  })

  let count = 0
  let countGreaterThanOne = false
  const server = createServer(async (req, res) => {
    count++
    await sleep(10)
    countGreaterThanOne = countGreaterThanOne || count > 1
    res.end(req.url)
  })
  t.teardown(server.close.bind(server))

  // needed to check for a warning on the maxListeners on the socket
  function onWarning (warning) {
    if (!/ExperimentalWarning/.test(warning)) {
      t.fail()
    }
  }
  process.on('warning', onWarning)
  t.teardown(() => {
    process.removeListener('warning', onWarning)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    t.teardown(client.close.bind(client))

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    async function makeRequest (i) {
      await makeRequestAndExpectUrl(client, i, t)
      count--
      if (i === num - 1) {
        t.ok(countGreaterThanOne, 'seen more than one parallel request')
      }
    }
  })
})

async function makeRequestAndExpectUrl (client, i, t) {
  try {
    const { statusCode, body } = await client.request({ path: '/' + i, method: 'GET' })
    t.equal(statusCode, 200)
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.equal('/' + i, Buffer.concat(bufs).toString('utf8'))
    })
  } catch (err) {
    t.fail(err)
  }
  return true
}

test('pool, async await support', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })
})
