'use strict'

const t = require('tap')
const { request, Agent, redirectPoolFactory } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')

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

t.test('should not follow redirection by default if not using RedirectPool', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t, (req, res) => {
    res.statusCode = 301
    res.setHeader('Connection', 'close')
    res.setHeader('Location', serverRoot)
    res.end('')
  })

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}`)
  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 301)
  t.strictEqual(headers.location, serverRoot)
  t.strictEqual(body.length, 0)
})

t.test('should follow redirection after a HTTP 300', async t => {
  t.plan(4)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${serverRoot}/300`, {
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.deepEqual(redirections, [
    `http://${serverRoot}/300`,
    `http://${serverRoot}/300/1`,
    `http://${serverRoot}/300/2`,
    `http://${serverRoot}/300/3`,
    `http://${serverRoot}/300/4`
  ])
  t.strictEqual(body, `GET :: connection@keep-alive host@${serverRoot}`)
})

t.test('should follow redirection after a HTTP 301', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/301`, {
    method: 'POST',
    body: 'REQUEST',
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.strictEqual(body, `POST :: connection@keep-alive host@${serverRoot} content-length@7 :: REQUEST`)
})

t.test('should follow redirection after a HTTP 302', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/302`, {
    method: 'PUT',
    body: Buffer.from('REQUEST'),
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.strictEqual(body, `PUT :: connection@keep-alive host@${serverRoot} content-length@7 :: REQUEST`)
})

t.test('should follow redirection after a HTTP 303 changing method to GET', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/303`, {
    method: 'PATCH',
    body: 'REQUEST',
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.strictEqual(body, `GET :: connection@keep-alive host@${serverRoot}`)
})

t.test('should remove Host and request body related headers when following HTTP 303 (array)', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/303`, {
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
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.strictEqual(body, `GET :: connection@keep-alive host@${serverRoot} x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
})

t.test('should remove Host and request body related headers when following HTTP 303 (object)', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/303`, {
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
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.strictEqual(body, `GET :: connection@keep-alive host@${serverRoot} x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
})

t.test('should follow redirection after a HTTP 307', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/307`, {
    method: 'DELETE',
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.strictEqual(body, `DELETE :: connection@keep-alive host@${serverRoot}`)
})

t.test('should follow redirection after a HTTP 308', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/308`, {
    method: 'OPTIONS',
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.strictEqual(body, `OPTIONS :: connection@keep-alive host@${serverRoot}`)
})

t.test('should ignore HTTP 3xx response bodies', async t => {
  t.plan(4)

  let body = ''
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

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${serverRoot}/`, {
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.deepEqual(redirections, [`http://${serverRoot}/`])
  t.strictEqual(body, 'FINAL')
})

t.test('should follow a redirect chain up to the allowed number of times', async t => {
  t.plan(4)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${serverRoot}/300`, {
    agent: new Agent({ factory: redirectPoolFactory }),
    maxRedirections: 2
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 300)
  t.strictEqual(headers.location, `http://${serverRoot}/300/4`)
  t.deepEqual(redirections, [`http://${serverRoot}/300`, `http://${serverRoot}/300/1`, `http://${serverRoot}/300/2`])
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

  let body = ''

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${server1}`, {
    method: 'POST',
    agent: new Agent({ factory: redirectPoolFactory })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.strictEqual(statusCode, 200)
  t.notOk(headers.location)
  t.deepEqual(redirections, [
    `http://${server1}/`,
    `http://${server2}/`,
    `http://${server3}/`,
    `http://${server2}/end`,
    `http://${server3}/end`
  ])
  t.strictEqual(body, 'POST')
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

      let body = ''

      const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/${code}`, {
        agent: new Agent({ factory: redirectPoolFactory })
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.strictEqual(statusCode, code)
      t.notOk(headers.location)
      t.strictEqual(body.length, 0)
    })
  }
})

t.test('should not allow invalid maxRedirections arguments', async t => {
  t.plan(1)

  try {
    await request('http://localhost:0', {
      method: 'GET',
      agent: new Agent({ factory: redirectPoolFactory }),
      maxRedirections: 'INVALID'
    })

    throw new Error('Did not throw')
  } catch (error) {
    t.strictEqual(error.message, 'maxRedirections must be a positive number')
  }
})

t.test('should not allow Readable request bodies when using RedirectPool', async t => {
  t.plan(1)

  try {
    await request('http://localhost:0', {
      method: 'POST',
      body: new Readable({
        read () {
          this.push(Buffer.from('REQUEST'))
          this.push(null)
        }
      }),
      agent: new Agent({ factory: redirectPoolFactory })
    })

    throw new Error('Did not throw')
  } catch (error) {
    t.strictEqual(error.message, 'body cannot be a stream when using RedirectPool')
  }
})

t.test('should handle errors (callback)', t => {
  t.plan(1)

  request(
    'http://localhost:0',
    {
      agent: new Agent({ factory: redirectPoolFactory })
    },
    error => {
      t.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
    }
  )
})

t.test('should handle errors (promise)', async t => {
  t.plan(1)

  try {
    await request('http://localhost:0', { agent: new Agent({ factory: redirectPoolFactory }) })
    throw new Error('Did not throw')
  } catch (error) {
    t.match(error.code, /EADDRNOTAVAIL|ECONNREFUSED/)
  }
})
