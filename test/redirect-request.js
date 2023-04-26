'use strict'

const t = require('tap')
const undici = require('..')
const { nodeMajor } = require('../lib/core/util')
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

for (const factory of [
  (server, opts) => new undici.Agent(opts),
  (server, opts) => new undici.Pool(`http://${server}`, opts),
  (server, opts) => new undici.Client(`http://${server}`, opts)
]) {
  const request = (server, opts, ...args) => {
    const dispatcher = factory(server, opts)
    return undici.request(args[0], { ...args[1], dispatcher }, args[2])
      .finally(() => dispatcher.destroy())
  }

  t.test('should always have a history with the final URL even if no redirections were followed', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(server, undefined, `http://${server}/200?key=value`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.same(history.map(x => x.toString()), [`http://${server}/200?key=value`])
    t.equal(body, `GET /5 key=value :: host@${server} connection@keep-alive`)
  })

  t.test('should not follow redirection by default if not using RedirectAgent', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}`)
    const body = await bodyStream.text()

    t.equal(statusCode, 302)
    t.equal(headers.location, `http://${server}/302/1`)
    t.equal(body.length, 0)
  })

  t.test('should follow redirection after a HTTP 300', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(server, undefined, `http://${server}/300?key=value`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.same(history.map(x => x.toString()), [
      `http://${server}/300?key=value`,
      `http://${server}/300/1?key=value`,
      `http://${server}/300/2?key=value`,
      `http://${server}/300/3?key=value`,
      `http://${server}/300/4?key=value`,
      `http://${server}/300/5?key=value`
    ])
    t.equal(body, `GET /5 key=value :: host@${server} connection@keep-alive`)
  })

  t.test('should follow redirection after a HTTP 300 default', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(server, { maxRedirections: 10 }, `http://${server}/300?key=value`)
    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.same(history.map(x => x.toString()), [
      `http://${server}/300?key=value`,
      `http://${server}/300/1?key=value`,
      `http://${server}/300/2?key=value`,
      `http://${server}/300/3?key=value`,
      `http://${server}/300/4?key=value`,
      `http://${server}/300/5?key=value`
    ])
    t.equal(body, `GET /5 key=value :: host@${server} connection@keep-alive`)
  })

  t.test('should follow redirection after a HTTP 301', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/301`, {
      method: 'POST',
      body: 'REQUEST',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.equal(body, `POST /5 :: host@${server} connection@keep-alive content-length@7 :: REQUEST`)
  })

  t.test('should follow redirection after a HTTP 302', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/302`, {
      method: 'PUT',
      body: Buffer.from('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.equal(body, `PUT /5 :: host@${server} connection@keep-alive content-length@7 :: REQUEST`)
  })

  t.test('should follow redirection after a HTTP 303 changing method to GET', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/303`, {
      method: 'PATCH',
      body: 'REQUEST',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.equal(body, `GET /5 :: host@${server} connection@keep-alive`)
  })

  t.test('should remove Host and request body related headers when following HTTP 303 (array)', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/303`, {
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

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.equal(body, `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
  })

  t.test('should remove Host and request body related headers when following HTTP 303 (object)', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/303`, {
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

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.equal(body, `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
  })

  t.test('should follow redirection after a HTTP 307', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/307`, {
      method: 'DELETE',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.equal(body, `DELETE /5 :: host@${server} connection@keep-alive`)
  })

  t.test('should follow redirection after a HTTP 308', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/308`, {
      method: 'OPTIONS',
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.equal(body, `OPTIONS /5 :: host@${server} connection@keep-alive`)
  })

  t.test('should ignore HTTP 3xx response bodies', async t => {
    const server = await startRedirectingWithBodyServer(t)

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(server, undefined, `http://${server}/`, {
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.same(history.map(x => x.toString()), [`http://${server}/`, `http://${server}/end`])
    t.equal(body, 'FINAL')
  })

  t.test('should ignore query after redirection', async t => {
    const server = await startRedirectingWithQueryParams(t)

    const { statusCode, headers, context: { history } } = await request(server, undefined, `http://${server}/`, {
      maxRedirections: 10,
      query: { param1: 'first' }
    })

    t.equal(statusCode, 200)
    t.notOk(headers.location)
    t.same(history.map(x => x.toString()), [`http://${server}/`, `http://${server}/?param2=second`])
  })

  t.test('should follow a redirect chain up to the allowed number of times', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream, context: { history } } = await request(server, undefined, `http://${server}/300`, {
      maxRedirections: 2
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 300)
    t.equal(headers.location, `http://${server}/300/3`)
    t.same(history.map(x => x.toString()), [`http://${server}/300`, `http://${server}/300/1`, `http://${server}/300/2`])
    t.equal(body.length, 0)
  })

  t.test('when a Location response header is NOT present', async t => {
    const redirectCodes = [300, 301, 302, 303, 307, 308]
    const server = await startRedirectingWithoutLocationServer(t)

    for (const code of redirectCodes) {
      const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/${code}`, {
        maxRedirections: 10
      })

      const body = await bodyStream.text()

      t.equal(statusCode, code)
      t.notOk(headers.location)
      t.equal(body.length, 0)
    }
  })

  t.test('should not allow invalid maxRedirections arguments', async t => {
    try {
      await request('localhost', undefined, 'http://localhost', {
        method: 'GET',
        maxRedirections: 'INVALID'
      })

      t.fail('Did not throw')
    } catch (err) {
      t.equal(err.message, 'maxRedirections must be a positive number')
    }
  })

  t.test('should not allow invalid maxRedirections arguments default', async t => {
    try {
      await request('localhost', {
        maxRedirections: 'INVALID'
      }, 'http://localhost', {
        method: 'GET'
      })

      t.fail('Did not throw')
    } catch (err) {
      t.equal(err.message, 'maxRedirections must be a positive number')
    }
  })

  t.test('should not follow redirects when using ReadableStream request bodies', { skip: nodeMajor < 16 }, async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/301`, {
      method: 'POST',
      body: createReadableStream('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 301)
    t.equal(headers.location, `http://${server}/301/2`)
    t.equal(body.length, 0)
  })

  t.test('should not follow redirects when using Readable request bodies', async t => {
    const server = await startRedirectingServer(t)

    const { statusCode, headers, body: bodyStream } = await request(server, undefined, `http://${server}/301`, {
      method: 'POST',
      body: createReadable('REQUEST'),
      maxRedirections: 10
    })

    const body = await bodyStream.text()

    t.equal(statusCode, 301)
    t.equal(headers.location, `http://${server}/301/1`)
    t.equal(body.length, 0)
  })
}

t.test('should follow redirections when going cross origin', async t => {
  const [server1, server2, server3] = await startRedirectingChainServers(t)

  const { statusCode, headers, body: bodyStream, context: { history } } = await undici.request(`http://${server1}`, {
    method: 'POST',
    maxRedirections: 10
  })

  const body = await bodyStream.text()

  t.equal(statusCode, 200)
  t.notOk(headers.location)
  t.same(history.map(x => x.toString()), [
    `http://${server1}/`,
    `http://${server2}/`,
    `http://${server3}/`,
    `http://${server2}/end`,
    `http://${server3}/end`,
    `http://${server1}/end`
  ])
  t.equal(body, 'POST')
})

t.test('should handle errors (callback)', t => {
  t.plan(1)

  undici.request(
    'http://localhost:0',
    {
      maxRedirections: 10
    },
    error => {
      t.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
    }
  )
})

t.test('should handle errors (promise)', async t => {
  try {
    await undici.request('http://localhost:0', { maxRedirections: 10 })
    t.fail('Did not throw')
  } catch (error) {
    t.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
  }
})

t.test('removes authorization header on third party origin', async t => {
  const [server1] = await startRedirectingWithAuthorization(t, 'secret')
  const { body: bodyStream } = await undici.request(`http://${server1}`, {
    maxRedirections: 10,
    headers: {
      authorization: 'secret'
    }
  })

  const body = await bodyStream.text()

  t.equal(body, '')
})

t.test('removes cookie header on third party origin', async t => {
  const [server1] = await startRedirectingWithCookie(t, 'a=b')
  const { body: bodyStream } = await undici.request(`http://${server1}`, {
    maxRedirections: 10,
    headers: {
      cookie: 'a=b'
    }
  })

  const body = await bodyStream.text()

  t.equal(body, '')
})
