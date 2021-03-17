'use strict'

const t = require('tap')
const { request, Agent, RedirectPool } = require('..')
const { createServer } = require('http')

function defaultHandler(req, res) {
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
    res.end('Did not switch to GET')
    return
  }

  // End the chain at some point
  if (redirections === 5) {
    res.end(
      `${req.method} :: ${Object.entries(req.headers)
        .map(([k, v]) => `${k}@${v}`)
        .join(' ')}`
    )
    return
  }

  // Redirect by default
  res.statusCode = code
  res.setHeader('Location', `http://localhost:${this.address().port}/${code}/${++redirections}`)
  res.end('')
}

function startServer(t, handler = defaultHandler) {
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
    res.setHeader('Location', serverRoot)
    res.end('')
  })

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}`)
  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 301)
  t.is(headers.location, serverRoot)
  t.equal(body.length, 0)
})

t.test('should follow redirection after a HTTP 300', async t => {
  t.plan(4)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${serverRoot}/300`, {
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.deepEqual(redirections, [
    `http://${serverRoot}/300`,
    `http://${serverRoot}/300/1`,
    `http://${serverRoot}/300/2`,
    `http://${serverRoot}/300/3`,
    `http://${serverRoot}/300/4`
  ])
  t.is(body, `GET :: connection@keep-alive host@${serverRoot}`)
})

t.test('should follow redirection after a HTTP 301', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/301`, {
    method: 'POST',
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.is(body, `POST :: connection@keep-alive host@${serverRoot} content-length@0`)
})

t.test('should follow redirection after a HTTP 302', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/302`, {
    method: 'PUT',
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.is(body, `PUT :: connection@keep-alive host@${serverRoot} content-length@0`)
})

t.test('should follow redirection after a HTTP 303 changing method to GET', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/303`, {
    method: 'PATCH',
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.is(body, `GET :: connection@keep-alive host@${serverRoot}`)
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
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.is(body, `GET :: connection@keep-alive host@${serverRoot} x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
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
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.is(body, `GET :: connection@keep-alive host@${serverRoot} x-foo1@1 x-foo2@2 x-foo3@3 x-bar@4`)
})

t.test('should follow redirection after a HTTP 307', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/307`, {
    method: 'DELETE',
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.is(body, `DELETE :: connection@keep-alive host@${serverRoot}`)
})

t.test('should follow redirection after a HTTP 308', async t => {
  t.plan(3)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/308`, {
    method: 'OPTIONS',
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.is(body, `OPTIONS :: connection@keep-alive host@${serverRoot}`)
})

t.only('should ignore HTTP 3xx response bodies', async t => {
  t.plan(4)

  let body = ''
  const serverRoot = await startServer(t, (req, res) => {
    if (req.url === '/') {
      res.statusCode = 301
      res.setHeader('Location', `http://${serverRoot}/end`)
      res.end('REDIRECT')
      return
    }

    res.end('FINAL')
  })

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${serverRoot}/`, {
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.deepEqual(redirections, [`http://${serverRoot}/`])
  t.is(body, `FINAL`)
})

t.test('should follow a redirect chain up to the allowed number of times', async t => {
  t.plan(4)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${serverRoot}/300`, {
    agent: new Agent({ poolClass: RedirectPool }),
    maxRedirections: 2
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 300)
  t.is(headers.location, `http://${serverRoot}/300/4`)
  t.deepEqual(redirections, [`http://${serverRoot}/300`, `http://${serverRoot}/300/1`, `http://${serverRoot}/300/2`])
  t.equal(body.length, 0)
})

t.test('should not follow redirections when disabled', async t => {
  t.plan(4)

  let body = ''
  const serverRoot = await startServer(t)

  const { statusCode, headers, body: bodyStream, redirections } = await request(`http://${serverRoot}/300`, {
    agent: new Agent({ poolClass: RedirectPool }),
    maxRedirections: false
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 300)
  t.is(headers.location, `http://${serverRoot}/300/1`)
  t.notOk(redirections)
  t.equal(body.length, 0)
})

t.test('should follow redirections when going cross origin', async t => {
  const server1 = await startServer(t, (req, res) => {
    if (req.url === '/') {
      res.statusCode = 301
      res.setHeader('Location', `http://${server2}/`)
      res.end('')
      return
    }

    res.end(req.method)
  })

  const server2 = await startServer(t, (req, res) => {
    res.statusCode = 301

    if (req.url === '/') {
      res.setHeader('Location', `http://${server3}/`)
    } else {
      res.setHeader('Location', `http://${server3}/end`)
    }

    res.end('')
  })

  const server3 = await startServer(t, (req, res) => {
    res.statusCode = 301

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
    agent: new Agent({ poolClass: RedirectPool })
  })

  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 200)
  t.notOk(headers.location)
  t.deepEqual(redirections, [
    `http://${server1}/`,
    `http://${server2}/`,
    `http://${server3}/`,
    `http://${server2}/end`,
    `http://${server3}/end`
  ])
  t.is(body, 'POST')
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
    res.end('')
  })

  t.plan(redirectCodes.length)

  for (const code of redirectCodes) {
    t.test(`should return the original response after a HTTP ${code}`, async t => {
      t.plan(3)

      let body = ''

      const { statusCode, headers, body: bodyStream } = await request(`http://${serverRoot}/${code}`, {
        agent: new Agent({ poolClass: RedirectPool })
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, code)
      t.notOk(headers.location)
      t.equal(body.length, 0)
    })
  }
})

t.test('should handle errors (callback)', t => {
  t.plan(1)

  request(
    'http://localhost:0',
    {
      agent: new Agent({ poolClass: RedirectPool })
    },
    error => {
      t.is(error.code, 'EADDRNOTAVAIL')
    }
  )
})

t.test('should handle errors (promise)', async t => {
  t.plan(1)

  try {
    await request('http://localhost:0', { agent: new Agent({ poolClass: RedirectPool }) })
    throw new Error('Did not throw')
  } catch (e) {
    t.is(e.code, 'EADDRNOTAVAIL')
  }
})
