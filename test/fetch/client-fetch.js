/* globals AbortController */

'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { createServer } = require('node:http')
const { Blob, File } = require('node:buffer')
const { fetch, Response, Request, FormData } = require('../..')
const { Client, setGlobalDispatcher, Agent } = require('../..')
const nodeFetch = require('../../index-fetch')
const { once } = require('node:events')
const { gzipSync } = require('node:zlib')
const { promisify } = require('node:util')
const { randomFillSync, createHash } = require('node:crypto')

const { closeServerAsPromise } = require('../utils/node-http')

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1
}))

test('function signature', (t) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  strictEqual(fetch.name, 'fetch')
  strictEqual(fetch.length, 1)
})

test('args validation', async (t) => {
  const { rejects } = tspl(t, { plan: 2 })

  await rejects(fetch(), TypeError)
  await rejects(fetch('ftp://unsupported'), TypeError)
})

test('request json', (t, done) => {
  const { deepStrictEqual } = tspl(t, { plan: 1 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    deepStrictEqual(obj, await body.json())
    done()
  })
})

test('request text', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    strictEqual(JSON.stringify(obj), await body.text())
    done()
  })
})

test('request arrayBuffer', (t, done) => {
  const { deepStrictEqual } = tspl(t, { plan: 1 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    deepStrictEqual(Buffer.from(JSON.stringify(obj)), Buffer.from(await body.arrayBuffer()))
    done()
  })
})

test('should set type of blob object to the value of the `Content-Type` header from response', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const response = await fetch(`http://localhost:${server.address().port}`)
    strictEqual('application/json', (await response.blob()).type)
    done()
  })
})

test('pre aborted with readable request body', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
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
          strictEqual(reason.name, 'AbortError')
        }
      }),
      duplex: 'half'
    }).catch(err => {
      strictEqual(err.name, 'AbortError')
    }).finally(done)
  })
})

test('pre aborted with closed readable request body', (t, done) => {
  const { ok, strictEqual } = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const ac = new AbortController()
    ac.abort()
    const body = new ReadableStream({
      async start (c) {
        ok(true)
        c.close()
      },
      async cancel (reason) {
        assert.fail()
      }
    })
    queueMicrotask(() => {
      fetch(`http://localhost:${server.address().port}`, {
        signal: ac.signal,
        method: 'POST',
        body,
        duplex: 'half'
      }).catch(err => {
        strictEqual(err.name, 'AbortError')
      }).finally(done)
    })
  })
})

test('unsupported formData 1', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'asdasdsad')
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.formData())
      .catch(err => {
        strictEqual(err.name, 'TypeError')
      })
      .finally(done)
  })
})

test('multipart formdata not base64', async (t) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  // Construct example form data, with text and blob fields
  const formData = new FormData()
  formData.append('field1', 'value1')
  const blob = new Blob(['example\ntext file'], { type: 'text/plain' })
  formData.append('field2', blob, 'file.txt')

  const tempRes = new Response(formData)
  const boundary = tempRes.headers.get('content-type').split('boundary=')[1]
  const formRaw = await tempRes.text()

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'multipart/form-data; boundary=' + boundary)
    res.write(formRaw)
    res.end()
  })
  t.after(closeServerAsPromise(server))

  const listen = promisify(server.listen.bind(server))
  await listen(0)

  const res = await fetch(`http://localhost:${server.address().port}`)
  const form = await res.formData()
  strictEqual(form.get('field1'), 'value1')

  const text = await form.get('field2').text()
  strictEqual(text, 'example\ntext file')
})

test('multipart formdata base64', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 1 })

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

  const server = createServer(async (req, res) => {
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
        strictEqual(createHash('sha256').update(data).digest('base64'), digest)
      })
      .finally(done)
  })
})

test('multipart fromdata non-ascii filed names', async (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

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
  strictEqual(form.get('fiŝo'), 'value1')
})

test('busboy emit error', async (t) => {
  const { rejects } = tspl(t, { plan: 1 })
  const formData = new FormData()
  formData.append('field1', 'value1')

  const tempRes = new Response(formData)
  const formRaw = await tempRes.text()

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'multipart/form-data; boundary=wrongboundary')
    res.write(formRaw)
    res.end()
  })
  t.after(closeServerAsPromise(server))

  const listen = promisify(server.listen.bind(server))
  await listen(0)

  const res = await fetch(`http://localhost:${server.address().port}`)
  await rejects(res.formData(), 'Unexpected end of multipart data')
})

// https://github.com/nodejs/undici/issues/2244
test('parsing formData preserve full path on files', async (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  const formData = new FormData()
  formData.append('field1', new File(['foo'], 'a/b/c/foo.txt'))

  const tempRes = new Response(formData)
  const form = await tempRes.formData()

  strictEqual(form.get('field1').name, 'a/b/c/foo.txt')
})

test('urlencoded formData', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/x-www-form-urlencoded')
    res.end('field1=value1&field2=value2')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.formData())
      .then(formData => {
        strictEqual(formData.get('field1'), 'value1')
        strictEqual(formData.get('field2'), 'value2')
      })
      .finally(done)
  })
})

test('text with BOM', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/x-www-form-urlencoded')
    res.end('\uFEFFtest=\uFEFF')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.text())
      .then(text => {
        strictEqual(text, 'test=\uFEFF')
      })
      .finally(done)
  })
})

test('formData with BOM', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/x-www-form-urlencoded')
    res.end('\uFEFFtest=\uFEFF')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`)
      .then(res => res.formData())
      .then(formData => {
        strictEqual(formData.get('\uFEFFtest'), '\uFEFF')
      })
      .finally(done)
  })
})

test('locked blob body', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`)
    const reader = res.body.getReader()
    res.blob().catch(err => {
      strictEqual(err.message, 'Body is unusable: Body has already been read')
      reader.cancel()
    }).finally(done)
  })
})

test('disturbed blob body', (t, done) => {
  const { ok, strictEqual } = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`)
    await res.blob().then(() => {
      ok(true)
    })
    await res.blob().catch(err => {
      strictEqual(err.message, 'Body is unusable: Body has already been read')
    })
    done()
  })
})

test('redirect with body', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 3 })

  let count = 0
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) {
      body += chunk
    }
    strictEqual(body, 'asd')
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
    strictEqual(await res.text(), '2')
    done()
  })
})

test('redirect with stream', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 3 })

  const location = '/asd'
  const body = 'hello!'
  const server = createServer(async (req, res) => {
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
    strictEqual(res.status, 302)
    strictEqual(res.headers.get('location'), location)
    strictEqual(await res.text(), body)
    done()
  })
})

test('fail to extract locked body', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const stream = new ReadableStream({})
  const reader = stream.getReader()
  try {
    // eslint-disable-next-line
    new Response(stream)
  } catch (err) {
    strictEqual(err.name, 'TypeError')
  }
  reader.cancel()
})

test('fail to extract locked body', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

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
    strictEqual(err.message, 'keepalive')
  }
  reader.cancel()
})

test('post FormData with Blob', (t, done) => {
  const { ok } = tspl(t, { plan: 1 })

  const body = new FormData()
  body.append('field1', new Blob(['asd1']))

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`, {
      method: 'PUT',
      body
    })
    ok(/asd1/.test(await res.text()))
    done()
  })
})

test('post FormData with File', (t, done) => {
  const { ok } = tspl(t, { plan: 2 })

  const body = new FormData()
  body.append('field1', new File(['asd1'], 'filename123'))

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const res = await fetch(`http://localhost:${server.address().port}`, {
      method: 'PUT',
      body
    })
    const result = await res.text()
    ok(/asd1/.test(result))
    ok(/filename123/.test(result))
    done()
  })
})

test('invalid url', async (t) => {
  const { match } = tspl(t, { plan: 1 })

  try {
    await fetch('http://invalid')
  } catch (e) {
    match(e.cause.message, /invalid/)
  }
})

test('custom agent', (t, done) => {
  const { ok, deepStrictEqual } = tspl(t, { plan: 2 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
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
      ok(true)
      return oldDispatch.call(this, options, handler)
    }
    const body = await fetch(`http://localhost:${server.address().port}`, {
      dispatcher
    })
    deepStrictEqual(obj, await body.json())
    done()
  })
})

test('custom agent node fetch', (t, done) => {
  const { ok, deepStrictEqual } = tspl(t, { plan: 2 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
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
      ok(true)
      return oldDispatch.call(this, options, handler)
    }
    const body = await nodeFetch.fetch(`http://localhost:${server.address().port}`, {
      dispatcher
    })
    deepStrictEqual(obj, await body.json())
    done()
  })
})

test('error on redirect', (t, done) => {
  const server = createServer((req, res) => {
    res.statusCode = 302
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const errorCause = await fetch(`http://localhost:${server.address().port}`, {
      redirect: 'error'
    }).catch((e) => e.cause)

    assert.strictEqual(errorCause.message, 'unexpected redirect')
    done()
  })
})

// https://github.com/nodejs/undici/issues/1527
test('fetching with Request object - issue #1527', async (t) => {
  const server = createServer((req, res) => {
    assert.ok(true)
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const body = JSON.stringify({ foo: 'bar' })
  const request = new Request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body
  })

  await assert.doesNotReject(fetch(request))
})

test('do not decode redirect body', (t, done) => {
  const { ok, strictEqual } = tspl(t, { plan: 3 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
    if (req.url === '/resource') {
      ok(true)
      res.statusCode = 301
      res.setHeader('location', '/resource/')
      // Some dumb http servers set the content-encoding gzip
      // even if there is no response
      res.setHeader('content-encoding', 'gzip')
      res.end()
      return
    }
    ok(true)
    res.setHeader('content-encoding', 'gzip')
    res.end(gzipSync(JSON.stringify(obj)))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/resource`)
    strictEqual(JSON.stringify(obj), await body.text())
    done()
  })
})

test('decode non-redirect body with location header', (t, done) => {
  const { ok, strictEqual } = tspl(t, { plan: 2 })

  const obj = { asd: true }
  const server = createServer((req, res) => {
    ok(true)
    res.statusCode = 201
    res.setHeader('location', '/resource/')
    res.setHeader('content-encoding', 'gzip')
    res.end(gzipSync(JSON.stringify(obj)))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/resource`)
    strictEqual(JSON.stringify(obj), await body.text())
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

  const server = createServer((req, res) => {
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

  assert.deepStrictEqual(cdHeaders, ContentDisposition)
  assert.deepStrictEqual(lengths, [30, 34, 94, 104, 90])
})
