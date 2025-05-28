'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, Pool } = require('..')
const { createServer } = require('node:http')
const { readFileSync, createReadStream } = require('node:fs')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')

test('basic get, async await support', async (t) => {
  t = tspl(t, { plan: 5 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })

  await t.completed
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

test('basic POST with string, async await support', async (t) => {
  t = tspl(t, { plan: 5 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      const { statusCode, body } = await client.request({ path: '/', method: 'POST', body: expected })
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })

  await t.completed
})

test('basic POST with Buffer, async await support', async (t) => {
  t = tspl(t, { plan: 5 })

  const expected = readFileSync(__filename)

  const server = createServer(postServer(t, expected.toString()))
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      const { statusCode, body } = await client.request({ path: '/', method: 'POST', body: expected })
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })

  await t.completed
})

test('basic POST with stream, async await support', async (t) => {
  t = tspl(t, { plan: 5 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      const { statusCode, body } = await client.request({
        path: '/',
        method: 'POST',
        headers: {
          'content-length': Buffer.byteLength(expected)
        },
        body: createReadStream(__filename)
      })
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })

  await t.completed
})

test('basic POST with async-iterator, async await support', async (t) => {
  t = tspl(t, { plan: 5 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      const { statusCode, body } = await client.request({
        path: '/',
        method: 'POST',
        headers: {
          'content-length': Buffer.byteLength(expected)
        },
        body: wrapWithAsyncIterable(createReadStream(__filename))
      })
      t.strictEqual(statusCode, 200)
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })

  await t.completed
})

test('20 times GET with pipelining 10, async await support', async (t) => {
  const num = 20
  t = tspl(t, { plan: 2 * num + 1 })

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
  after(() => server.close())

  // needed to check for a warning on the maxListeners on the socket
  function onWarning (warning) {
    if (!/ExperimentalWarning/.test(warning)) {
      t.fail()
    }
  }
  process.on('warning', onWarning)
  after(() => {
    process.removeListener('warning', onWarning)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    after(() => client.close())

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

  await t.completed
})

async function makeRequestAndExpectUrl (client, i, t) {
  try {
    const { statusCode, body } = await client.request({ path: '/' + i, method: 'GET', blocking: false })
    t.strictEqual(statusCode, 200)
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.strictEqual('/' + i, Buffer.concat(bufs).toString('utf8'))
    })
  } catch (err) {
    t.fail(err)
  }
  return true
}

test('pool, async await support', async (t) => {
  t = tspl(t, { plan: 5 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    } catch (err) {
      t.fail(err)
    }
  })

  await t.completed
})
