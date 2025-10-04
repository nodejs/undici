'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const undici = require('../..')
const {
  startRedirectingServer,
  startRedirectingWithBodyServer,
  startRedirectingChainServers,
  startRedirectingWithoutLocationServer,
  startRedirectingWithAuthorization,
  startRedirectingWithCookie,
  startRedirectingWithQueryParams,
  startServer,
  startRedirectingWithRelativePath
} = require('../utils/redirecting-servers')
const { createReadable, createReadableStream } = require('../utils/stream')

const {
  interceptors: { redirect }
} = undici

for (const factory of [
  (server, opts) =>
    new undici.Agent(opts).compose(
      redirect({ maxRedirections: opts?.maxRedirections })
    ),
  (server, opts) =>
    new undici.Pool(`http://${server}`, opts).compose(
      redirect({ maxRedirections: opts?.maxRedirections })
    ),
  (server, opts) =>
    new undici.Client(`http://${server}`, opts).compose(
      redirect({ maxRedirections: opts?.maxRedirections })
    )
]) {
  const request = (t, server, opts, ...args) => {
    const dispatcher = factory(server, opts)
    after(() => dispatcher.close())
    return undici.request(args[0], { ...args[1], dispatcher }, args[2])
  }

  test('should always have a history with the final URL even if no redirections were followed', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream,
      context: { history }
    } = await request(t, server, undefined, `http://${server}/200?key=value`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(
      history.map(x => x.toString()),
      [`http://${server}/200?key=value`]
    )
    t.assert.strictEqual(
      body,
      `GET /5 key=value :: host@${server} connection@keep-alive`
    )
  })

  test('should not follow redirection by default if not using RedirectAgent', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}`)
    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 302)
    t.assert.strictEqual(headers.location, `http://${server}/302/1`)
    t.assert.strictEqual(body.length, 0)
  })

  test('should follow redirection after a HTTP 300', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream,
      context: { history }
    } = await request(t, server, undefined, `http://${server}/300?key=value`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(
      history.map(x => x.toString()),
      [
        `http://${server}/300?key=value`,
        `http://${server}/300/1?key=value`,
        `http://${server}/300/2?key=value`,
        `http://${server}/300/3?key=value`,
        `http://${server}/300/4?key=value`,
        `http://${server}/300/5?key=value`
      ]
    )
    t.assert.strictEqual(
      body,
      `GET /5 key=value :: host@${server} connection@keep-alive`
    )
  })

  test('should follow redirection after a HTTP 300 default', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream,
      context: { history }
    } = await request(
      t,
      server,
      { maxRedirections: 10 },
      `http://${server}/300?key=value`
    )
    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(
      history.map(x => x.toString()),
      [
        `http://${server}/300?key=value`,
        `http://${server}/300/1?key=value`,
        `http://${server}/300/2?key=value`,
        `http://${server}/300/3?key=value`,
        `http://${server}/300/4?key=value`,
        `http://${server}/300/5?key=value`
      ]
    )
    t.assert.strictEqual(
      body,
      `GET /5 key=value :: host@${server} connection@keep-alive`
    )
  })

  test('should follow redirection after a HTTP 301 changing method to GET', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/301`, {
      method: 'POST',
      body: 'REQUEST',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(
      body,
      `GET /5 :: host@${server} connection@keep-alive`
    )
  })

  test('should follow redirection after a HTTP 302', async t => {
    t.plan(3)
    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/302`, {
      method: 'PUT',
      body: Buffer.from('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(
      body,
      `PUT /5 :: host@${server} connection@keep-alive content-length@7 :: REQUEST`
    )
  })

  test('should follow redirection after a HTTP 303 changing method to GET', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/303`, {
      method: 'PATCH',
      body: 'REQUEST',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `GET /5 :: host@${server} connection@keep-alive`)
  })

  test('should remove Host and request body related headers when following HTTP 303 (array)', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/303`, {
      method: 'PATCH',
      headers: [
        'Content-Encoding',
        'gzip',
        'X-Foo1',
        '1',
        'X-Foo2',
        '2',
        'Content-Type',
        'application/json',
        'X-Foo3',
        '3',
        'Host',
        'localhost',
        'X-Bar',
        '4'
      ],
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(
      body,
      `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`
    )
  })

  test('should remove Host and request body related headers when following HTTP 303 (object)', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/303`, {
      method: 'PATCH',
      headers: {
        'Content-Encoding': 'gzip',
        'X-Foo1': '1',
        'X-Foo2': '2',
        'Content-Type': 'application/json',
        'X-Foo3': '3',
        Host: 'localhost',
        'X-Bar': '4'
      },
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(
      body,
      `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`
    )
  })

  test('should follow redirection after a HTTP 307', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/307`, {
      method: 'DELETE',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `DELETE /5 :: host@${server} connection@keep-alive`)
  })

  test('should follow redirection after a HTTP 308', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/308`, {
      method: 'OPTIONS',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `OPTIONS /5 :: host@${server} connection@keep-alive`)
  })

  test('should ignore HTTP 3xx response bodies', async t => {
    t.plan(4)

    const server = await startRedirectingWithBodyServer()

    const {
      statusCode,
      headers,
      body: bodyStream,
      context: { history }
    } = await request(t, server, undefined, `http://${server}/`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(
      history.map(x => x.toString()),
      [`http://${server}/`, `http://${server}/end`]
    )
    t.assert.strictEqual(body, 'FINAL')
  })

  test('should ignore query after redirection', async t => {
    t.plan(3)

    const server = await startRedirectingWithQueryParams()

    const {
      statusCode,
      headers,
      context: { history }
    } = await request(t, server, undefined, `http://${server}/`, {
      maxRedirections: 10,
      query: { param1: 'first' }
    })

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(
      history.map(x => x.toString()),
      [`http://${server}/`, `http://${server}/?param2=second`]
    )
  })

  test('should follow a redirect chain up to the allowed number of times', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream,
      context: { history }
    } = await request(t, server, undefined, `http://${server}/300`, {
      maxRedirections: 2
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 300)
    t.assert.strictEqual(headers.location, `http://${server}/300/3`)
    t.assert.deepStrictEqual(
      history.map(x => x.toString()),
      [
        `http://${server}/300`,
        `http://${server}/300/1`,
        `http://${server}/300/2`
      ]
    )
    t.assert.strictEqual(body.length, 0)
  })

  test('should follow a redirect chain up to the allowed number of times for redirectionLimitReached', async t => {
    t.plan(1)

    const server = await startRedirectingServer()

    try {
      await request(t, server, undefined, `http://${server}/300`, {
        maxRedirections: 2,
        throwOnMaxRedirect: true
      })
    } catch (error) {
      if (error.message.startsWith('max redirects')) {
        t.assert.ok(true, 'Max redirects handled correctly')
      } else {
        t.assert.fail(`Unexpected error: ${error.message}`)
      }
    }
  })

  test('when a Location response header is NOT present', async t => {
    t.plan(6 * 3)

    const redirectCodes = [300, 301, 302, 303, 307, 308]
    const server = await startRedirectingWithoutLocationServer()

    for (const code of redirectCodes) {
      const {
        statusCode,
        headers,
        body: bodyStream
      } = await request(t, server, undefined, `http://${server}/${code}`, {
        maxRedirections: 10
      })

      const body = await bodyStream.text()

      t.assert.strictEqual(statusCode, code)
      t.assert.ok(!headers.location)
      t.assert.strictEqual(body.length, 0)
    }
  })

  test('should not allow invalid maxRedirections arguments', async t => {
    t.plan(1)

    try {
      await request(t, 'localhost', undefined, 'http://localhost', {
        method: 'GET',
        maxRedirections: 'INVALID'
      })

      t.assert.fail('Did not throw')
    } catch (err) {
      t.assert.strictEqual(err.message, 'maxRedirections must be a positive number')
    }
  })

  test('should not allow invalid maxRedirections arguments default', async t => {
    t.plan(1)

    try {
      await request(
        t,
        'localhost',
        {
          maxRedirections: 'INVALID'
        },
        'http://localhost',
        {
          method: 'GET'
        }
      )

      t.assert.fail('Did not throw')
    } catch (err) {
      t.assert.strictEqual(err.message, 'maxRedirections must be a positive number')
    }
  })

  test('should not follow redirects when using ReadableStream request bodies', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/301`, {
      method: 'PUT',
      body: createReadableStream('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 301)
    t.assert.strictEqual(headers.location, `http://${server}/301/2`)
    t.assert.strictEqual(body.length, 0)
  })

  test('should not follow redirects when using Readable request bodies', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const {
      statusCode,
      headers,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/301`, {
      method: 'PUT',
      body: createReadable('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 301)
    t.assert.strictEqual(headers.location, `http://${server}/301/1`)
    t.assert.strictEqual(body.length, 0)
  })

  test('should follow redirects when using Readable request bodies w/ POST 101', async t => {
    t.plan(1)

    const server = await startRedirectingServer()

    const {
      statusCode,
      body: bodyStream
    } = await request(t, server, undefined, `http://${server}/301`, {
      method: 'POST',
      body: createReadable('REQUEST'),
      maxRedirections: 10
    })

    await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
  })
}

test('should follow redirections when going cross origin', async t => {
  t.plan(4)

  const [server1, server2, server3] = await startRedirectingChainServers()

  const {
    statusCode,
    headers,
    body: bodyStream,
    context: { history }
  } = await undici.request(`http://${server1}`, {
    method: 'POST',
    dispatcher: new undici.Agent({}).compose(redirect({ maxRedirections: 10 }))
  })

  const body = await bodyStream.text()

  t.assert.strictEqual(statusCode, 200)
  t.assert.ok(!headers.location)
  t.assert.deepStrictEqual(
    history.map(x => x.toString()),
    [
      `http://${server1}/`,
      `http://${server2}/`,
      `http://${server3}/`,
      `http://${server2}/end`,
      `http://${server3}/end`,
      `http://${server1}/end`
    ]
  )
  t.assert.strictEqual(body, 'GET')
})

test('should handle errors (callback)', (t, done) => {
  t.plan(1)

  undici.request(
    'http://localhost:0',
    {
      dispatcher: new undici.Agent({}).compose(
        redirect({ maxRedirections: 10 })
      )
    },
    error => {
      t.assert.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
      done()
    }
  )
})

test('should handle errors (promise)', async t => {
  t.plan(1)

  try {
    await undici.request('http://localhost:0', {
      dispatcher: new undici.Agent({}).compose(
        redirect({ maxRedirections: 10 })
      )
    })
    t.assert.fail('Did not throw')
  } catch (error) {
    t.assert.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
  }
})

test('removes authorization header on third party origin', async t => {
  t.plan(1)

  const [server1] = await startRedirectingWithAuthorization('secret')
  const { body: bodyStream } = await undici.request(`http://${server1}`, {
    dispatcher: new undici.Agent({}).compose(redirect({ maxRedirections: 10 })),
    headers: {
      authorization: 'secret'
    }
  })

  const body = await bodyStream.text()

  t.assert.strictEqual(body, '')
})

test('removes cookie header on third party origin', async t => {
  t.plan(1)
  const [server1] = await startRedirectingWithCookie('a=b')
  const { body: bodyStream } = await undici.request(`http://${server1}`, {
    dispatcher: new undici.Agent({}).compose(redirect({ maxRedirections: 10 })),
    headers: {
      cookie: 'a=b'
    }
  })

  const body = await bodyStream.text()

  t.assert.strictEqual(body, '')
})

test('should upgrade the connection when no redirects are present', async t => {
  t.plan(2)

  const server = await startServer((req, res) => {
    if (req.url === '/') {
      res.statusCode = 301
      res.setHeader('Location', `http://${server}/end`)
      res.end('REDIRECT')
      return
    }

    res.statusCode = 101
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Upgrade', req.headers.upgrade)
    res.end('')
  })

  const { headers, socket } = await undici.upgrade(`http://${server}/`, {
    method: 'GET',
    protocol: 'foo/1',
    dispatcher: new undici.Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 }))
  })

  socket.end()

  t.assert.strictEqual(headers.connection, 'upgrade')
  t.assert.strictEqual(headers.upgrade, 'foo/1')
})

test('should redirect to relative URL according to RFC 7231', async t => {
  t.plan(2)

  const server = await startRedirectingWithRelativePath()

  const { statusCode, body } = await undici.request(`http://${server}`, {
    dispatcher: new undici.Client(`http://${server}/`).compose(redirect({ maxRedirections: 3 }))
  })

  const finalPath = await body.text()

  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(finalPath, '/absolute/b')
})

test('Cross-origin redirects clear forbidden headers', async (t) => {
  t.plan(6)

  const server1 = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.cookie, undefined)
    t.assert.strictEqual(req.headers.authorization, undefined)
    t.assert.strictEqual(req.headers['proxy-authorization'], undefined)

    res.end('redirected')
  }).listen(0)

  const server2 = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.authorization, 'test')
    t.assert.strictEqual(req.headers.cookie, 'ddd=dddd')

    res.writeHead(302, {
      ...req.headers,
      Location: `http://localhost:${server1.address().port}`
    })
    res.end()
  }).listen(0)

  t.after(() => {
    server1.close()
    server2.close()
  })

  await Promise.all([
    once(server1, 'listening'),
    once(server2, 'listening')
  ])

  const res = await undici.request(`http://localhost:${server2.address().port}`, {
    dispatcher: new undici.Agent({}).compose(redirect({ maxRedirections: 1 })),
    headers: {
      Authorization: 'test',
      Cookie: 'ddd=dddd',
      'Proxy-Authorization': 'test'
    }
  })

  const text = await res.body.text()
  t.assert.strictEqual(text, 'redirected')
})
