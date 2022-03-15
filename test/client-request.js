'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const EE = require('events')
const { kConnect } = require('../lib/core/symbols')
const { Readable } = require('stream')
const net = require('net')
const { promisify } = require('util')
const { NotSupportedError } = require('../lib/core/errors')

const nodeMajor = Number(process.versions.node.split('.')[0])

test('request dump', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    let dumped = false
    client.on('disconnect', () => {
      t.equal(dumped, true)
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.dump().then(() => {
        dumped = true
        t.pass()
      })
    })
  })
})

test('request abort before headers', (t) => {
  t.plan(6)

  const signal = new EE()
  const server = createServer((req, res) => {
    res.end('hello')
    signal.emit('abort')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.type(err, errors.RequestAbortedError)
        t.equal(signal.listenerCount('abort'), 0)
      })
      t.equal(signal.listenerCount('abort'), 1)

      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.type(err, errors.RequestAbortedError)
        t.equal(signal.listenerCount('abort'), 0)
      })
      t.equal(signal.listenerCount('abort'), 2)
    })
  })
})

test('request body destroyed on invalid callback', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const body = new Readable({
      read () {}
    })
    try {
      client.request({
        path: '/',
        method: 'GET',
        body
      }, null)
    } catch (err) {
      t.equal(body.destroyed, true)
    }
  })
})

test('trailers', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeHead(200, { Trailer: 'Content-MD5' })
    res.addTrailers({ 'Content-MD5': 'test' })
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const { body, trailers } = await client.request({
      path: '/',
      method: 'GET'
    })

    body
      .on('data', () => t.fail())
      .on('end', () => {
        t.strictSame(trailers, { 'content-md5': 'test' })
      })
  })
})

test('destroy socket abruptly', { skip: true }, async (t) => {
  t.plan(2)

  const server = net.createServer((socket) => {
    const lines = [
      'HTTP/1.1 200 OK',
      'Date: Sat, 09 Oct 2010 14:28:02 GMT',
      'Connection: close',
      '',
      'the body'
    ]
    socket.end(lines.join('\r\n'))

    // Unfortunately calling destroy synchronously might get us flaky results,
    // therefore we delay it to the next event loop run.
    setImmediate(socket.destroy.bind(socket))
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const client = new Client(`http://localhost:${server.address().port}`)
  t.teardown(client.close.bind(client))

  const { statusCode, body } = await client.request({
    path: '/',
    method: 'GET'
  })

  t.equal(statusCode, 200)

  body.setEncoding('utf8')

  let actual = ''

  for await (const chunk of body) {
    actual += chunk
  }

  t.equal(actual, 'the body')
})

test('destroy socket abruptly with keep-alive', { skip: true }, async (t) => {
  t.plan(2)

  const server = net.createServer((socket) => {
    const lines = [
      'HTTP/1.1 200 OK',
      'Date: Sat, 09 Oct 2010 14:28:02 GMT',
      'Connection: keep-alive',
      'Content-Length: 42',
      '',
      'the body'
    ]
    socket.end(lines.join('\r\n'))

    // Unfortunately calling destroy synchronously might get us flaky results,
    // therefore we delay it to the next event loop run.
    setImmediate(socket.destroy.bind(socket))
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const client = new Client(`http://localhost:${server.address().port}`)
  t.teardown(client.close.bind(client))

  const { statusCode, body } = await client.request({
    path: '/',
    method: 'GET'
  })

  t.equal(statusCode, 200)

  body.setEncoding('utf8')

  try {
    /* eslint-disable */
    for await (const _ of body) {
      // empty on purpose
    }
    /* eslint-enable */
    t.fail('no error')
  } catch (err) {
    t.pass('error happened')
  }
})

test('request json', (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(obj, await body.json())
  })
})

test('request long multibyte json', (t) => {
  t.plan(1)

  const obj = { asd: 'あ'.repeat(100000) }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(obj, await body.json())
  })
})

test('request text', (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(JSON.stringify(obj), await body.text())
  })
})

test('empty host header', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end(req.headers.host)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const serverAddress = `localhost:${server.address().port}`
    const client = new Client(`http://${serverAddress}`)
    t.teardown(client.destroy.bind(client))

    const getWithHost = async (host, wanted) => {
      const { body } = await client.request({
        path: '/',
        method: 'GET',
        headers: { host }
      })
      t.strictSame(await body.text(), wanted)
    }

    await getWithHost('test', 'test')
    await getWithHost(undefined, serverAddress)
    await getWithHost('', '')
  })
})

test('request long multibyte text', (t) => {
  t.plan(1)

  const obj = { asd: 'あ'.repeat(100000) }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(JSON.stringify(obj), await body.text())
  })
})

test('request blob', { skip: nodeMajor < 16 }, (t) => {
  t.plan(2)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })

    const blob = await body.blob()
    t.strictSame(obj, JSON.parse(await blob.text()))
    t.equal(blob.type, 'application/json')
  })
})

test('request arrayBuffer', (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(Buffer.from(JSON.stringify(obj)), Buffer.from(await body.arrayBuffer()))
  })
})

test('request body', { skip: nodeMajor < 16 }, (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })

    let x = ''
    for await (const chunk of body.body) {
      x += Buffer.from(chunk)
    }
    t.strictSame(JSON.stringify(obj), x)
  })
})

test('request post body no missing data', { skip: nodeMajor < 16 }, (t) => {
  t.plan(2)

  const server = createServer(async (req, res) => {
    let ret = ''
    for await (const chunk of req) {
      ret += chunk
    }
    t.equal(ret, 'asd')
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET',
      body: new Readable({
        read () {
          this.push('asd')
          this.push(null)
        }
      }),
      maxRedirections: 2
    })
    await body.text()
    t.pass()
  })
})

test('request post body no extra data handler', { skip: nodeMajor < 16 }, (t) => {
  t.plan(3)

  const server = createServer(async (req, res) => {
    let ret = ''
    for await (const chunk of req) {
      ret += chunk
    }
    t.equal(ret, 'asd')
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const reqBody = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    process.nextTick(() => {
      t.equal(reqBody.listenerCount('data'), 0)
    })
    const { body } = await client.request({
      path: '/',
      method: 'GET',
      body: reqBody,
      maxRedirections: 0
    })
    await body.text()
    t.pass()
  })
})

test('request with onInfo callback', (t) => {
  t.plan(3)
  const infos = []
  const server = createServer((req, res) => {
    res.writeProcessing()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ foo: 'bar' }))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    await client.request({
      path: '/',
      method: 'GET',
      onInfo: (x) => { infos.push(x) }
    })
    t.equal(infos.length, 1)
    t.equal(infos[0].statusCode, 102)
    t.pass()
  })
})

test('request with onInfo callback but socket is destroyed before end of response', (t) => {
  t.plan(5)
  const infos = []
  let response
  const server = createServer((req, res) => {
    response = res
    res.writeProcessing()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))
    try {
      await client.request({
        path: '/',
        method: 'GET',
        onInfo: (x) => {
          infos.push(x)
          response.destroy()
        }
      })
      t.error()
    } catch (e) {
      t.ok(e)
      t.equal(e.message, 'other side closed')
    }
    t.equal(infos.length, 1)
    t.equal(infos[0].statusCode, 102)
    t.pass()
  })
})

test('request onInfo callback headers parsing', async (t) => {
  t.plan(4)
  const infos = []

  const server = net.createServer((socket) => {
    const lines = [
      'HTTP/1.1 103 Early Hints',
      'Link: </style.css>; rel=preload; as=style',
      '',
      'HTTP/1.1 200 OK',
      'Date: Sat, 09 Oct 2010 14:28:02 GMT',
      'Connection: close',
      '',
      'the body'
    ]
    socket.end(lines.join('\r\n'))
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.teardown(client.close.bind(client))

  await client.request({
    path: '/',
    method: 'GET',
    onInfo: (x) => { infos.push(x) }
  })
  t.equal(infos.length, 1)
  t.equal(infos[0].statusCode, 103)
  t.same(infos[0].headers, { link: '</style.css>; rel=preload; as=style' })
  t.pass()
})

test('request raw responseHeaders', async (t) => {
  t.plan(4)
  const infos = []

  const server = net.createServer((socket) => {
    const lines = [
      'HTTP/1.1 103 Early Hints',
      'Link: </style.css>; rel=preload; as=style',
      '',
      'HTTP/1.1 200 OK',
      'Date: Sat, 09 Oct 2010 14:28:02 GMT',
      'Connection: close',
      '',
      'the body'
    ]
    socket.end(lines.join('\r\n'))
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.teardown(client.close.bind(client))

  const { headers } = await client.request({
    path: '/',
    method: 'GET',
    responseHeaders: 'raw',
    onInfo: (x) => { infos.push(x) }
  })
  t.equal(infos.length, 1)
  t.same(infos[0].headers, ['Link', '</style.css>; rel=preload; as=style'])
  t.same(headers, ['Date', 'Sat, 09 Oct 2010 14:28:02 GMT', 'Connection', 'close'])
  t.pass()
})

test('request formData', { skip: nodeMajor < 16 }, (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })

    try {
      await body.formData()
      t.fail('should throw NotSupportedError')
    } catch (error) {
      t.ok(error instanceof NotSupportedError)
    }
  })
})

test('request text2', (t) => {
  t.plan(2)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    const p = body.text()
    let ret = ''
    body.on('data', chunk => {
      ret += chunk
    }).on('end', () => {
      t.equal(JSON.stringify(obj), ret)
    })
    t.strictSame(JSON.stringify(obj), await p)
  })
})
