'use strict'

const t = require('tap')
const { stream, Agent, redirectPoolFactory } = require('..')
const { createServer } = require('http')
const { Readable, Writable } = require('stream')

function defaultHandler (req, res) {
  // Parse the path and normalize arguments
  let [code, redirections] = req.url
    .slice(1)
    .split('/')
    .map(r => parseInt(r, 10))

  if (isNaN(code) || code < 0) {
    code = 302
  }

  if (isNaN(redirections) || redirections < 0) {
    redirections = 0
  }

  // On 303, the method must be GET or HEAD after the first redirect
  if (code === 303 && redirections > 0 && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 400
    res.setHeader('Connection', 'close')
    res.end('Did not switch to GET')
    return
  }

  // End the chain at some point
  if (redirections === 5) {
    res.setHeader('Connection', 'close')
    res.write(
      `${req.method} :: ${Object.entries(req.headers)
        .map(([k, v]) => `${k}@${v}`)
        .join(' ')}`
    )

    if (parseInt(req.headers['content-length']) > 0) {
      res.write(' :: ')
      req.pipe(res)
    } else {
      res.end('')
    }

    return
  }

  // Redirect by default
  res.statusCode = code
  res.setHeader('Connection', 'close')
  res.setHeader('Location', `http://localhost:${this.address().port}/${code}/${++redirections}`)
  res.end('')
}

function startServer (t, handler = defaultHandler) {
  return new Promise(resolve => {
    const server = createServer(handler)

    server.listen(0, () => {
      resolve(`localhost:${server.address().port}`)
    })

    t.teardown(server.close.bind(server))
  })
}

function createWritable (target) {
  return new Writable({
    write (chunk, _, callback) {
      target.push(chunk.toString())
      callback()
    },
    final (callback) {
      callback()
    }
  })
}

t.test('should not follow redirection by default if not using RedirectPool', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t, (req, res) => {
    res.statusCode = 301
    res.setHeader('Connection', 'close')
    res.setHeader('Location', serverRoot)
    res.end('')
  })

  await stream(`http://${serverRoot}`, { opaque: body }, ({ statusCode, headers, opaque }) => {
    t.strictEqual(statusCode, 301)
    t.strictEqual(headers.location, serverRoot)

    return createWritable(opaque)
  })

  t.strictEqual(body.length, 0)
})

t.test('should follow redirection after a HTTP 300', async t => {
  t.plan(4)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/300`,
    { opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)
      t.deepEqual(redirections, [
        `http://${serverRoot}/300`,
        `http://${serverRoot}/300/1`,
        `http://${serverRoot}/300/2`,
        `http://${serverRoot}/300/3`,
        `http://${serverRoot}/300/4`
      ])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET :: connection@keep-alive host@${serverRoot}`)
})

t.test('should follow redirection after a HTTP 301', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/301`,
    { method: 'POST', body: 'REQUEST', opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `POST :: connection@keep-alive host@${serverRoot} content-length@7 :: REQUEST`)
})

t.test('should follow redirection after a HTTP 302', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/302`,
    { method: 'PUT', body: Buffer.from('REQUEST'), opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `PUT :: connection@keep-alive host@${serverRoot} content-length@7 :: REQUEST`)
})

t.test('should follow redirection after a HTTP 303 changing method to GET', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/303`,
    { opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET :: connection@keep-alive host@${serverRoot}`)
})

t.test('should remove Host and request body related headers when following HTTP 303 (array)', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/303`,
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
      agent: new Agent({ factory: redirectPoolFactory })
    },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET :: connection@keep-alive host@${serverRoot} x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
})

t.test('should remove Host and request body related headers when following HTTP 303 (object)', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/303`,
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
      agent: new Agent({ factory: redirectPoolFactory })
    },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `GET :: connection@keep-alive host@${serverRoot} x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
})

t.test('should follow redirection after a HTTP 307', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/307`,
    { method: 'DELETE', opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `DELETE :: connection@keep-alive host@${serverRoot}`)
})

t.test('should follow redirection after a HTTP 308', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/308`,
    { method: 'OPTIONS', opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), `OPTIONS :: connection@keep-alive host@${serverRoot}`)
})

t.test('should ignore HTTP 3xx response bodies', async t => {
  t.plan(4)

  const body = []
  const serverRoot = await startServer(t, (req, res) => {
    if (req.url === '/') {
      res.statusCode = 301
      res.setHeader('Connection', 'close')
      res.setHeader('Location', `http://${serverRoot}/end`)
      res.end('REDIRECT')
      return
    }

    res.setHeader('Connection', 'close')
    res.end('FINAL')
  })

  await stream(
    `http://${serverRoot}/`,
    { opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)
      t.deepEqual(redirections, [`http://${serverRoot}/`])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), 'FINAL')
})

t.test('should follow a redirect chain up to the allowed number of times', async t => {
  t.plan(4)

  const body = []
  const serverRoot = await startServer(t)

  await stream(
    `http://${serverRoot}/300`,
    { opaque: body, agent: new Agent({ factory: redirectPoolFactory }), maxRedirections: 2 },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 300)
      t.strictEqual(headers.location, `http://${serverRoot}/300/4`)
      t.deepEqual(redirections, [
        `http://${serverRoot}/300`,
        `http://${serverRoot}/300/1`,
        `http://${serverRoot}/300/2`
      ])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.length, 0)
})

t.test('should follow redirections when going cross origin', async t => {
  const server1 = await startServer(t, (req, res) => {
    if (req.url === '/') {
      res.statusCode = 301
      res.setHeader('Connection', 'close')
      res.setHeader('Location', `http://${server2}/`)
      res.end('')
      return
    }

    res.setHeader('Connection', 'close')
    res.end(req.method)
  })

  const server2 = await startServer(t, (req, res) => {
    res.statusCode = 301
    res.setHeader('Connection', 'close')

    if (req.url === '/') {
      res.setHeader('Location', `http://${server3}/`)
    } else {
      res.setHeader('Location', `http://${server3}/end`)
    }

    res.end('')
  })

  const server3 = await startServer(t, (req, res) => {
    res.statusCode = 301
    res.setHeader('Connection', 'close')

    if (req.url === '/') {
      res.setHeader('Location', `http://${server2}/end`)
    } else {
      res.setHeader('Location', `http://${server1}/end`)
    }

    res.end('')
  })

  t.plan(4)

  const body = []

  await stream(
    `http://${server1}`,
    { method: 'POST', opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      t.strictEqual(statusCode, 200)
      t.notOk(headers.location)
      t.deepEqual(redirections, [
        `http://${server1}/`,
        `http://${server2}/`,
        `http://${server3}/`,
        `http://${server2}/end`,
        `http://${server3}/end`
      ])

      return createWritable(opaque)
    }
  )

  t.strictEqual(body.join(''), 'POST')
})

t.test('when a Location response header is NOT present', async t => {
  const redirectCodes = [300, 301, 302, 303, 307, 308]

  const serverRoot = await startServer(t, (req, res) => {
    // Parse the path and normalize arguments
    let [code] = req.url
      .slice(1)
      .split('/')
      .map(r => parseInt(r, 10))

    if (isNaN(code) || code < 0) {
      code = 302
    }

    res.statusCode = code
    res.setHeader('Connection', 'close')
    res.end('')
  })

  t.plan(redirectCodes.length)

  for (const code of redirectCodes) {
    t.test(`should return the original response after a HTTP ${code}`, async t => {
      t.plan(3)

      const body = []

      await stream(
        `http://${serverRoot}/${code}`,
        { opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
        ({ statusCode, headers, opaque }) => {
          t.strictEqual(statusCode, code)
          t.notOk(headers.location)

          return createWritable(opaque)
        }
      )

      t.strictEqual(body.length, 0)
    })
  }
})

t.test('should not allow Readable request bodies when using RedirectPool', async t => {
  t.plan(1)

  const body = []

  try {
    await stream(
      'http://localhost:0',
      {
        method: 'POST',
        body: new Readable({
          read () {
            this.push(Buffer.from('REQUEST'))
            this.push(null)
          }
        }),
        opaque: body,
        agent: new Agent({ factory: redirectPoolFactory })
      },
      ({ statusCode, headers, redirections, opaque }) => {
        t.strictEqual(statusCode, 200)
        t.notOk(headers.location)

        return createWritable(opaque)
      }
    )

    throw new Error('Did not throw')
  } catch (error) {
    t.strictEqual(error.message, 'body cannot be a stream when using RedirectPool')
  }
})

t.test('should handle errors (callback)', t => {
  t.plan(2)

  const body = []

  stream(
    'http://localhost:0',
    { opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
    ({ statusCode, headers, redirections, opaque }) => {
      return createWritable(opaque)
    },
    error => {
      t.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
      t.strictEqual(body.length, 0)
    }
  )
})

t.test('should handle errors (promise)', async t => {
  t.plan(2)

  const body = []

  try {
    await stream(
      'http://localhost:0',
      { opaque: body, agent: new Agent({ factory: redirectPoolFactory }) },
      ({ statusCode, headers, redirections, opaque }) => {
        return createWritable(opaque)
      }
    )

    throw new Error('Did not throw')
  } catch (error) {
    t.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
    t.strictEqual(body.length, 0)
  }
})
