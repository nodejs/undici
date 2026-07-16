/* globals AbortController */

'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { fetch, Response, Request, FormData } = require('../..')
const { Client, setGlobalDispatcher, getGlobalDispatcher, Agent } = require('../..')
const nodeFetch = require('../../index-fetch')
const { once } = require('node:events')
const { gzipSync } = require('node:zlib')
const { promisify } = require('node:util')
const { randomFillSync, createHash } = require('node:crypto')

const { closeServerAsPromise } = require('../utils/node-http')

const previousDispatcher = getGlobalDispatcher()
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1
}))

after(() => {
  setGlobalDispatcher(previousDispatcher)
})

test('function signature', (t) => {
  t.plan(2)

  t.assert.strictEqual(fetch.name, 'fetch')
  t.assert.strictEqual(fetch.length, 1)
})

test('args validation', async (t) => {
  t.plan(2)

  await t.assert.rejects(fetch(), TypeError)
  await t.assert.rejects(fetch('ftp://unsupported'), TypeError)
})

test('request json', (t, done) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.assert.deepStrictEqual(obj, await body.json())
    done()
  })
})

test('request text', (t, done) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.assert.strictEqual(JSON.stringify(obj), await body.text())
    done()
  })
})

test('request arrayBuffer', (t, done) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.assert.deepStrictEqual(Buffer.from(JSON.stringify(obj)), Buffer.from(await body.arrayBuffer()))
    done()
  })
})

test('should set type of blob object to the value of the `Content-Type` header from response', (t, done) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const response = await fetch(`http://localhost:${server.address().port}`)
    t.assert.strictEqual('application/json', (await response.blob()).type)
    done()
  })
})

test('pre aborted with readable request body', (t, done) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const ac = new AbortController()
    ac.abort()
    await fetch(`http://localhost:${server.address().port}`, {
      signal: ac.signal,
      method: 'POST',
      body: new ReadableStream({
        async cancel (reason) {
          t.assert.strictEqual(reason.name, 'AbortError')
        }
      }),
      duplex: 'half'
    }).catch(err => {
      t.assert.strictEqual(err.name, 'AbortError')
    }).finally(done)
  })
})

test('pre aborted with closed readable request body', (t, done) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const ac = new AbortController()
    ac.abort()
    const body = new ReadableStream({
      async start (c) {
        t.assert.ok(true)
        c.close()
      },
      async cancel (reason) {
        t.assert.fail()
      }
    })
    queueMicrotask(() => {
      fetch(`http://localhost:${server.address().port}`, {
        signal: ac.signal,
        method: 'POST',
        body,
        duplex: 'half'
      }).catch(err => {
        t.assert.strictEqual(err.name, 'AbortError')
      }).finally(done)
    })
  })
})

test('unsupported formData 1', (t, done) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'asdasdsad')
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.formData())
      .catch(err => {
        t.assert.strictEqual(err.name, 'TypeError')
      })
      .finally(done)
  })
})

test('multipart formdata not base64', async (t) => {
  t.plan(2)

  // Construct example form data, with text and blob fields
  const formData = new FormData()
  formData.append('field1', 'value1')
  const blob = new Blob(['example\ntext file'], { type: 'text/plain' })
  formData.append('field2', blob, 'file.txt')

  const tempRes = new Response(formData)
  const boundary = tempRes.headers.get('content-type').split('boundary=')[1]
  const formRaw = await tempRes.text()

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'multipart/form-data; boundary=' + boundary)
    res.write(formRaw)
    res.end()
  })
  t.after(closeServerAsPromise(server))

  const listen = promisify(server.listen.bind(server))
  await listen(0)

  const res = await fetch(`http://localhost:${server.address().port}`)
  const form = await res.formData()
  t.assert.strictEqual(form.get('field1'), 'value1')

  const text = await form.get('field2').text()
  t.assert.strictEqual(text, 'example\ntext file')
})

test('multipart formdata base64', (t, done) => {
  t.plan(1)

  // Example form data with base64 encoding
  const data = randomFillSync(Buffer.alloc(256))
  const formRaw =
    '------formdata-undici-0.5786922755719377\r\n' +
    'Content-Disposition: form-data; name="file"; filename="test.txt"\r\n' +
    'Content-Type: application/octet-stream\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n' +
    data.toString('base64') +
    '\r\n' +
    '------formdata-undici-0.5786922755719377--'

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    res.setHeader('content-type', 'multipart/form-data; boundary=----formdata-undici-0.5786922755719377')

    for (let offset = 0; offset < formRaw.length;) {
      res.write(formRaw.slice(offset, offset += 2))
      await new Promise(resolve => setTimeout(resolve))
    }
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.formData())
      .then(form => form.get('file').arrayBuffer())
      .then(buffer => createHash('sha256').update(Buffer.from(buffer)).digest('base64'))
      .then(digest => {
        t.assert.strictEqual(createHash('sha256').update(data).digest('base64'), digest)
      })
      .finally(done)
  })
})

test('multipart fromdata non-ascii filed names', async (t) => {
  t.plan(1)

  const request = new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=----formdata-undici-0.6204674738279623'
    },
    body:
      '------formdata-undici-0.6204674738279623\r\n' +
      'Content-Disposition: form-data; name="fiŝo"\r\n' +
      '\r\n' +
      'value1\r\n' +
      '------formdata-undici-0.6204674738279623--'
  })

  const form = await request.formData()
  t.assert.strictEqual(form.get('fiŝo'), 'value1')
})

test('busboy emit error', async (t) => {
  t.plan(1)
  const formData = new FormData()
  formData.append('field1', 'value1')

  const tempRes = new Response(formData)
  const formRaw = await tempRes.text()

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'multipart/form-data; boundary=wrongboundary')
    res.write(formRaw)
    res.end()
  })
  t.after(closeServerAsPromise(server))

  const listen = promisify(server.listen.bind(server))
  await listen(0)

  const res = await fetch(`http://localhost:${server.address().port}`)
  await t.assert.rejects(res.formData(), 'Unexpected end of multipart data')
})

// https://github.com/nodejs/undici/issues/2244
test('parsing formData preserve full path on files', async (t) => {
  t.plan(1)
  const formData = new FormData()
  formData.append('field1', new File(['foo'], 'a/b/c/foo.txt'))

  const tempRes = new Response(formData)
  const form = await tempRes.formData()

  t.assert.strictEqual(form.get('field1').name, 'a/b/c/foo.txt')
})

test('urlencoded formData', (t, done) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'application/x-www-form-urlencoded')
    res.end('field1=value1&field2=value2')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.formData())
      .then(formData => {
        t.assert.strictEqual(formData.get('field1'), 'value1')
        t.assert.strictEqual(formData.get('field2'), 'value2')
      })
      .finally(done)
  })
})

test('text with BOM', (t, done) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'application/x-www-form-urlencoded')
    res.end('\uFEFFtest=\uFEFF')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.text())
      .then(text => {
        t.assert.strictEqual(text, 'test=\uFEFF')
      })
      .finally(done)
  })
})

test('formData with BOM', (t, done) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'application/x-www-form-urlencoded')
    res.end('\uFEFFtest=\uFEFF')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.formData())
      .then(formData => {
        t.assert.strictEqual(formData.get('\uFEFFtest'), '\uFEFF')
      })
      .finally(done)
  })
})

test('locked blob body', (t, done) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`)
    const reader = res.body.getReader()
    res.blob().catch(err => {
      t.assert.strictEqual(err.message, 'Body is unusable: Body has already been read')
      reader.cancel()
    }).finally(done)
  })
})

test('disturbed blob body', (t, done) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`)
    await res.blob().then(() => {
      t.assert.ok(true)
    })
    await res.blob().catch(err => {
      t.assert.strictEqual(err.message, 'Body is unusable: Body has already been read')
    })
    done()
  })
})

test('redirect with body', (t, done) => {
  t.plan(3)

  let count = 0
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    let body = ''
    for await (const chunk of req) {
      body += chunk
    }
    t.assert.strictEqual(body, 'asd')
    if (count++ === 0) {
      res.setHeader('location', 'asd')
      res.statusCode = 302
      res.end()
    } else {
      res.end(String(count))
    }
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`, {
      method: 'PUT',
      body: 'asd'
    })
    t.assert.strictEqual(await res.text(), '2')
    done()
  })
})

test('redirect with stream', (t, done) => {
  t.plan(3)

  const location = '/asd'
  const body = 'hello!'
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    res.writeHead(302, { location })
    let count = 0
    const l = setInterval(() => {
      res.write(body[count++])
      if (count === body.length) {
        res.end()
        clearInterval(l)
      }
    }, 50)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`, {
      redirect: 'manual'
    })
    t.assert.strictEqual(res.status, 302)
    t.assert.strictEqual(res.headers.get('location'), location)
    t.assert.strictEqual(await res.text(), body)
    done()
  })
})

test('fail to extract locked body', (t) => {
  t.plan(1)

  const stream = new ReadableStream({})
  const reader = stream.getReader()
  try {
    // eslint-disable-next-line
    new Response(stream)
  } catch (err) {
    t.assert.strictEqual(err.name, 'TypeError')
  }
  reader.cancel()
})

test('fail to extract locked body', (t) => {
  t.plan(1)

  const stream = new ReadableStream({})
  const reader = stream.getReader()
  try {
    // eslint-disable-next-line
    new Request('http://asd', {
      method: 'PUT',
      body: stream,
      keepalive: true
    })
  } catch (err) {
    t.assert.strictEqual(err.message, 'keepalive')
  }
  reader.cancel()
})

test('post FormData with Blob', (t, done) => {
  t.plan(1)

  const body = new FormData()
  body.append('field1', new Blob(['asd1']))

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    req.pipe(res)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`, {
      method: 'PUT',
      body
    })
    t.assert.ok(/asd1/.test(await res.text()))
    done()
  })
})

test('post FormData with File', (t, done) => {
  t.plan(2)

  const body = new FormData()
  body.append('field1', new File(['asd1'], 'filename123'))

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    req.pipe(res)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`, {
      method: 'PUT',
      body
    })
    const result = await res.text()
    t.assert.ok(/asd1/.test(result))
    t.assert.ok(/filename123/.test(result))
    done()
  })
})

test('invalid url', async (t) => {
  t.plan(1)

  try {
    await fetch('http://invalid')
  } catch (e) {
    t.assert.match(e.cause.message, /invalid/)
  }
})

test('custom agent', (t, done) => {
  t.plan(2)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const dispatcher = new Client('http://localhost:' + server.address().port, {
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1
    })
    const oldDispatch = dispatcher.dispatch
    dispatcher.dispatch = function (options, handler) {
      t.assert.ok(true)
      return oldDispatch.call(this, options, handler)
    }
    const body = await fetch(`http://localhost:${server.address().port}`, {
      dispatcher
    })
    t.assert.deepStrictEqual(obj, await body.json())
    done()
  })
})

test('custom agent node fetch', (t, done) => {
  t.plan(2)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const dispatcher = new Client('http://localhost:' + server.address().port, {
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1
    })
    const oldDispatch = dispatcher.dispatch
    dispatcher.dispatch = function (options, handler) {
      t.assert.ok(true)
      return oldDispatch.call(this, options, handler)
    }
    const body = await nodeFetch.fetch(`http://localhost:${server.address().port}`, {
      dispatcher
    })
    t.assert.deepStrictEqual(obj, await body.json())
    done()
  })
})

test('error on redirect', (t, done) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.statusCode = 302
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const errorCause = await fetch(`http://localhost:${server.address().port}`, {
      redirect: 'error'
    }).catch((e) => e.cause)

    t.assert.strictEqual(errorCause.message, 'unexpected redirect')
    done()
  })
})

// https://github.com/nodejs/undici/issues/1527
test('fetching with Request object - issue #1527', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.ok(true)
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const body = JSON.stringify({ foo: 'bar' })
  const request = new Request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body
  })

  await t.assert.doesNotReject(fetch(request))
})

test('do not decode redirect body', (t, done) => {
  t.plan(3)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (req.url === '/resource') {
      t.assert.ok(true)
      res.statusCode = 301
      res.setHeader('location', '/resource/')
      // Some dumb http servers set the content-encoding gzip
      // even if there is no response
      res.setHeader('content-encoding', 'gzip')
      res.end()
      return
    }
    t.assert.ok(true)
    res.setHeader('content-encoding', 'gzip')
    res.end(gzipSync(JSON.stringify(obj)))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/resource`)
    t.assert.strictEqual(JSON.stringify(obj), await body.text())
    done()
  })
})

test('decode non-redirect body with location header', (t, done) => {
  t.plan(2)

  const obj = { asd: true }
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.ok(true)
    res.statusCode = 201
    res.setHeader('location', '/resource/')
    res.setHeader('content-encoding', 'gzip')
    res.end(gzipSync(JSON.stringify(obj)))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/resource`)
    t.assert.strictEqual(JSON.stringify(obj), await body.text())
    done()
  })
})

test('Receiving non-Latin1 headers', async (t) => {
  const ContentDisposition = [
    'inline; filename=rock&roll.png',
    'inline; filename="rock\'n\'roll.png"',
    'inline; filename="image â\x80\x94 copy (1).png"; filename*=UTF-8\'\'image%20%E2%80%94%20copy%20(1).png',
    'inline; filename="_å\x9C\x96ç\x89\x87_ð\x9F\x96¼_image_.png"; filename*=UTF-8\'\'_%E5%9C%96%E7%89%87_%F0%9F%96%BC_image_.png',
    'inline; filename="100 % loading&perf.png"; filename*=UTF-8\'\'100%20%25%20loading%26perf.png'
  ]

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    for (let i = 0; i < ContentDisposition.length; i++) {
      res.setHeader(`Content-Disposition-${i + 1}`, ContentDisposition[i])
    }

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const url = `http://localhost:${server.address().port}`
  const response = await fetch(url, { method: 'HEAD' })
  const cdHeaders = [...response.headers]
    .filter(([k]) => k.startsWith('content-disposition'))
    .map(([, v]) => v)
  const lengths = cdHeaders.map(h => h.length)

  t.assert.deepStrictEqual(cdHeaders, ContentDisposition)
  t.assert.deepStrictEqual(lengths, [30, 34, 94, 104, 90])
})
