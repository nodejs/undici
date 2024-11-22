'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { stream, Agent, Client, interceptors: { redirect } } = require('..')
const {
  startRedirectingServer,
  startRedirectingWithBodyServer,
  startRedirectingChainServers,
  startRedirectingWithoutLocationServer,
  startRedirectingWithAuthorization,
  startRedirectingWithCookie
} = require('./utils/redirecting-servers')
const { createReadable, createWritable } = require('./utils/stream')

test('should always have a history with the final URL even if no redirections were followed', async t => {
  t = tspl(t, { plan: 4 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/200?key=value`,
    { opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque, context: { history } }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)
      t.deepStrictEqual(history.map(x => x.toString()), [
        `http://${server}/200?key=value`
      ])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET /5 key=value :: host@${server} connection@keep-alive`)
})

test('should not follow redirection by default if max redirect = 0', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(`http://${server}`, { opaque: body, dispatcher: new Agent({}).compose(redirect({ maxRedirections: 0 })) }, ({ statusCode, headers, opaque }) => {
    t.strictEqual(statusCode, 302)
    t.strictEqual(headers.location, `http://${server}/302/1`)

    return createWritable(opaque)
  })

  t.strictEqual(body.length, 0)
})

test('should follow redirection after a HTTP 300', async t => {
  t = tspl(t, { plan: 4 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/300?key=value`,
    { opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque, context: { history } }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)
      t.deepStrictEqual(history.map(x => x.toString()), [
        `http://${server}/300?key=value`,
        `http://${server}/300/1?key=value`,
        `http://${server}/300/2?key=value`,
        `http://${server}/300/3?key=value`,
        `http://${server}/300/4?key=value`,
        `http://${server}/300/5?key=value`
      ])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET /5 key=value :: host@${server} connection@keep-alive`)
})

test('should follow redirection after a HTTP 301 changing method to GET', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/301`,
    { method: 'POST', body: 'REQUEST', opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET /5 :: host@${server} connection@keep-alive`)
})

test('should follow redirection after a HTTP 302', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/302`,
    { method: 'PUT', body: Buffer.from('REQUEST'), opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `PUT /5 :: host@${server} connection@keep-alive content-length@7 :: REQUEST`)
})

test('should follow redirection after a HTTP 303 changing method to GET', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(`http://${server}/303`, { opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) }, ({ statusCode, headers, opaque }) => {
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers.location, undefined)

    return createWritable(opaque)
  })

  t.strictEqual(body.join(''), `GET /5 :: host@${server} connection@keep-alive`)
})

test('should remove Host and request body related headers when following HTTP 303 (array)', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/303`,
    {
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
      opaque: body,
      dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 }))
    },
    ({ statusCode, headers, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
})

test('should remove Host and request body related headers when following HTTP 303 (object)', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/303`,
    {
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
      opaque: body,
      dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 }))
    },
    ({ statusCode, headers, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET /5 :: host@${server} connection@keep-alive x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
})

test('should follow redirection after a HTTP 307', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/307`,
    { method: 'DELETE', opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `DELETE /5 :: host@${server} connection@keep-alive`)
})

test('should follow redirection after a HTTP 308', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/308`,
    { method: 'OPTIONS', opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `OPTIONS /5 :: host@${server} connection@keep-alive`)
})

test('should ignore HTTP 3xx response bodies', async t => {
  t = tspl(t, { plan: 4 })

  const body = []
  const server = await startRedirectingWithBodyServer()

  await stream(
    `http://${server}/`,
    { opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque, context: { history } }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)
      t.deepStrictEqual(history.map(x => x.toString()), [`http://${server}/`, `http://${server}/end`])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), 'FINAL')
})

test('should follow a redirect chain up to the allowed number of times', async t => {
  t = tspl(t, { plan: 4 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}/300`,
    { opaque: body, dispatcher: new Client(`http://${server}/`).compose(redirect({ maxRedirections: 2 })) },
    ({ statusCode, headers, opaque, context: { history } }) => {
      t.strictEqual(statusCode, 300)
      t.strictEqual(headers.location, `http://${server}/300/3`)
      t.deepStrictEqual(history.map(x => x.toString()), [`http://${server}/300`, `http://${server}/300/1`, `http://${server}/300/2`])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.length, 0)
})

test('should follow redirections when going cross origin', async t => {
  t = tspl(t, { plan: 4 })

  const [server1, server2, server3] = await startRedirectingChainServers()
  const body = []

  await stream(
    `http://${server1}`,
    { method: 'POST', opaque: body, dispatcher: new Agent({}).compose(redirect({ maxRedirections: 10 })) },
    ({ statusCode, headers, opaque, context: { history } }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers.location, undefined)
      t.deepStrictEqual(history.map(x => x.toString()), [
        `http://${server1}/`,
        `http://${server2}/`,
        `http://${server3}/`,
        `http://${server2}/end`,
        `http://${server3}/end`,
        `http://${server1}/end`
      ])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), 'GET')
})

describe('when a Location response header is NOT present', async () => {
  const redirectCodes = [300, 301, 302, 303, 307, 308]
  const server = await startRedirectingWithoutLocationServer()

  for (const code of redirectCodes) {
    test(`should return the original response after a HTTP ${code}`, async t => {
      t = tspl(t, { plan: 3 })

      const body = []

      await stream(
        `http://${server}/${code}`,
        { opaque: body, maxRedirections: 10 },
        ({ statusCode, headers, opaque }) => {
          t.strictEqual(statusCode, code)
          t.strictEqual(headers.location, undefined)

          return createWritable(opaque)
        }
      )

      t.strictEqual(body.length, 0)
      await t.completed
    })
  }
})

test('should not follow redirects when using Readable request bodies', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const server = await startRedirectingServer()

  await stream(
    `http://${server}`,
    {
      method: 'POST',
      body: createReadable('REQUEST'),
      opaque: body,
      maxRedirections: 10
    },
    ({ statusCode, headers, opaque }) => {
      t.strictEqual(statusCode, 302)
      t.strictEqual(headers.location, `http://${server}/302/1`)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.length, 0)
})

test('should handle errors', async t => {
  t = tspl(t, { plan: 2 })

  const body = []

  try {
    await stream('http://localhost:0', { opaque: body, maxRedirections: 10 }, ({ statusCode, headers, opaque }) => {
      return createWritable(opaque)
    })

    throw new Error('Did not throw')
  } catch (error) {
    t.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
    t.strictEqual(body.length, 0)
  }
})

test('removes authorization header on third party origin', async t => {
  t = tspl(t, { plan: 1 })

  const body = []

  const [server1] = await startRedirectingWithAuthorization('secret')
  await stream(`http://${server1}`, {
    maxRedirections: 10,
    opaque: body,
    headers: {
      authorization: 'secret'
    }
  }, ({ statusCode, headers, opaque }) => createWritable(opaque))

  t.strictEqual(body.length, 0)
})

test('removes cookie header on third party origin', async t => {
  t = tspl(t, { plan: 1 })

  const body = []

  const [server1] = await startRedirectingWithCookie('a=b')
  await stream(`http://${server1}`, {
    maxRedirections: 10,
    opaque: body,
    headers: {
      cookie: 'a=b'
    }
  }, ({ statusCode, headers, opaque }) => createWritable(opaque))

  t.strictEqual(body.length, 0)
})
