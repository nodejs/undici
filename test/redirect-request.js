'use strict'

const { test, after } = require('node:test')
const undici = require('..')
const {
  startRedirectingServer,
  startRedirectingWithBodyServer,
  startRedirectingChainServers,
  startRedirectingWithoutLocationServer,
  startRedirectingWithAuthorization,
  startRedirectingWithCookie,
  startRedirectingWithQueryParams
} = require('./utils/redirecting-servers')
const { createReadable, createReadableStream } = require('./utils/stream')
const { Headers: UndiciHeaders } = require('..')
const redirect = undici.interceptors.redirect

for (const factory of [
  (server, opts) => new undici.Agent(opts).compose(redirect({ maxRedirections: opts?.maxRedirections })),
  (server, opts) => new undici.Pool(`http://${server}`, opts).compose(redirect({ maxRedirections: opts?.maxRedirections })),
  (server, opts) => new undici.Client(`http://${server}`, opts).compose(redirect({ maxRedirections: opts?.maxRedirections }))
]) {
  const request = (t, server, opts, ...args) => {
    const dispatcher = factory(server, opts)
    after(() => dispatcher.close())
    return undici.request(args[0], { ...args[1], dispatcher }, args[2])
  }

  test('should always have a history with the final URL even if no redirections were followed', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(t, server, undefined, `http://${server}/200?key=value`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(history.map(x => x.toString()), [`http://${server}/200?key=value`])
    t.assert.strictEqual(body, `GET /5 key=value :: host@${server} connection@keep-alive`)
  })

  test('should not follow redirection by default if not using RedirectAgent', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}`)
    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 302)
    t.assert.strictEqual(headers.location, `http://${server}/302/1`)
    t.assert.strictEqual(body.length, 0)
  })

  test('should follow redirection after a HTTP 300', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(t, server, undefined, `http://${server}/300?key=value`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(history.map(x => x.toString()), [
      `http://${server}/300?key=value`,
      `http://${server}/300/1?key=value`,
      `http://${server}/300/2?key=value`,
      `http://${server}/300/3?key=value`,
      `http://${server}/300/4?key=value`,
      `http://${server}/300/5?key=value`
    ])
    t.assert.strictEqual(body, `GET /5 key=value :: host@${server} connection@keep-alive`)
  })

  test('should follow redirection after a HTTP 300 default', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(t, server, undefined, `http://${server}/300?key=value`, { maxRedirections: 10 })
    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(history.map(x => x.toString()), [
      `http://${server}/300?key=value`,
      `http://${server}/300/1?key=value`,
      `http://${server}/300/2?key=value`,
      `http://${server}/300/3?key=value`,
      `http://${server}/300/4?key=value`,
      `http://${server}/300/5?key=value`
    ])
    t.assert.strictEqual(body, `GET /5 key=value :: host@${server} connection@keep-alive`)
  })

  test('should follow redirection after a HTTP 301', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/301`, {
      method: 'POST',
      body: 'REQUEST',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `GET /5 :: host@${server} connection@keep-alive`)
  })

  test('should follow redirection after a HTTP 302', async t => {
    t.plan(3)
    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/302`, {
      method: 'PUT',
      body: Buffer.from('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `PUT /5 :: host@${server} connection@keep-alive content-length@7 :: REQUEST`)
  })

  test('should follow redirection after a HTTP 303 changing method to GET', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/303`, {
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

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/303`, {
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
    t.assert.strictEqual(body, `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
  })

  test('should remove Host and request body related headers when following HTTP 303 (object)', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/303`, {
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
    t.assert.strictEqual(body, `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
  })

  test('should remove Host and request body related headers when following HTTP 303 (Global Headers)', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/303`, {
      method: 'PATCH',
      // eslint-disable-next-line no-restricted-globals
      headers: new Headers({
        'Content-Encoding': 'gzip',
        'X-Foo1': '1',
        'X-Foo2': '2',
        'Content-Type': 'application/json',
        'X-Foo3': '3',
        Host: 'localhost',
        'X-Bar': '4'
      }),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `GET /5 :: host@${server} connection@keep-alive x-bar@4 x-foo1@1 x-foo2@2 x-foo3@3`)
  })

  test('should remove Host and request body related headers when following HTTP 303 (Undici Headers)', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/303`, {
      method: 'PATCH',
      headers: new UndiciHeaders({
        'Content-Encoding': 'gzip',
        'X-Foo1': '1',
        'X-Foo2': '2',
        'Content-Type': 'application/json',
        'X-Foo3': '3',
        Host: 'localhost',
        'X-Bar': '4'
      }),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `GET /5 :: host@${server} connection@keep-alive x-bar@4 x-foo1@1 x-foo2@2 x-foo3@3`)
  })

  test('should remove Host and request body related headers when following HTTP 303 (Maps)', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/303`, {
      method: 'PATCH',
      headers: new Map([
        ['Content-Encoding', 'gzip'],
        ['X-Foo1', '1'],
        ['X-Foo2', '2'],
        ['Content-Type', 'application/json'],
        ['X-Foo3', '3'],
        ['Host', 'localhost'],
        ['X-Bar', '4']
      ]),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.strictEqual(body, `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
  })

  test('should follow redirection after a HTTP 307', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/307`, {
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

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/308`, {
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

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(t, server, undefined, `http://${server}/`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(history.map(x => x.toString()), [`http://${server}/`, `http://${server}/end`])
    t.assert.strictEqual(body, 'FINAL')
  })

  test('should ignore query after redirection', async t => {
    t.plan(3)

    const server = await startRedirectingWithQueryParams()

    const { statusCode, headers, context: { history } } = await request(t, server, undefined, `http://${server}/`, {
      maxRedirections: 10,
      query: { param1: 'first' }
    })

    t.assert.strictEqual(statusCode, 200)
    t.assert.ok(!headers.location)
    t.assert.deepStrictEqual(history.map(x => x.toString()), [`http://${server}/`, `http://${server}/?param2=second`])
  })

  test('should follow a redirect chain up to the allowed number of times', async t => {
    t.plan(4)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(t, server, undefined, `http://${server}/300`, {
      maxRedirections: 2
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 300)
    t.assert.strictEqual(headers.location, `http://${server}/300/3`)
    t.assert.deepStrictEqual(history.map(x => x.toString()), [`http://${server}/300`, `http://${server}/300/1`, `http://${server}/300/2`])
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
      const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/${code}`, {
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
      await request(t, 'localhost', undefined, 'http://localhost', {
        method: 'GET',
        maxRedirections: 'INVALID'
      })

      t.assert.fail('Did not throw')
    } catch (err) {
      t.assert.strictEqual(err.message, 'maxRedirections must be a positive number')
    }
  })

  test('should not follow redirects when using ReadableStream request bodies', async t => {
    t.plan(3)

    const server = await startRedirectingServer()

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/301`, {
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

    const { statusCode, headers, body: bodyStream } = await request(t, server, undefined, `http://${server}/301`, {
      method: 'PUT',
      body: createReadable('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.assert.strictEqual(statusCode, 301)
    t.assert.strictEqual(headers.location, `http://${server}/301/1`)
    t.assert.strictEqual(body.length, 0)
  })

  test('should follow redirects when using Readable request bodies for POST 301', async t => {
    t.plan(1)

    const server = await startRedirectingServer()

    const { statusCode, body: bodyStream } = await request(t, server, undefined, `http://${server}/301`, {
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

  const { statusCode, headers, body: bodyStream, context: { history } } = await undici.request(`http://${server1}`, {
    method: 'POST',
    dispatcher: new undici.Agent({}).compose(redirect({ maxRedirections: 10 }))
  })

  const body = await bodyStream.text()

  t.assert.strictEqual(statusCode, 200)
  t.assert.ok(!headers.location)
  t.assert.deepStrictEqual(history.map(x => x.toString()), [
    `http://${server1}/`,
    `http://${server2}/`,
    `http://${server3}/`,
    `http://${server2}/end`,
    `http://${server3}/end`,
    `http://${server1}/end`
  ])
  t.assert.strictEqual(body, 'GET')
})

test('should handle errors (callback)', (t, done) => {
  t.plan(1)

  undici.request(
    'http://localhost:0',
    {
      dispatcher: new undici.Agent({}).compose(redirect({ maxRedirections: 10 }))
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
    await undici.request('http://localhost:0', { dispatcher: new undici.Agent({}).compose(redirect({ maxRedirections: 10 })) })
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
