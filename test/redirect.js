'use strict'

const { test } = require('tap')
const { request } = require('..')
const { createServer } = require('http')
const RedirectAgent = require('../lib/agents/redirect')

function startServer (t, handler) {
  return new Promise(resolve => {
    const server = createServer(handler)

    server.listen(0, () => {
      resolve(`http://localhost:${server.address().port}`)
    })

    t.teardown(server.close.bind(server))
  })
}

test('redirect without a RedirectAgent should not follow redirect', async t => {
  t.plan(3)

  const serverRoot = await startServer(t, (req, res) => {
    res.statusCode = 301
    res.setHeader('Location', serverRoot)
    res.end('')
  })

  let body = ''

  const { statusCode, headers, body: bodyStream } = await request(serverRoot)
  for await (const b of bodyStream) {
    body += b
  }

  t.is(statusCode, 301)
  t.is(headers.location, serverRoot)
  t.equal(body.length, 0)
})

test('redirect with a RedirectAgent', async t => {
  t.plan(4)

  t.test('when a Location response header is present', async t => {
    const serverRoot = await startServer(t, (req, res) => {
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
        res.end(req.method)
        return
      }

      // Redirect by default
      res.statusCode = code
      res.setHeader('Location', `${serverRoot}/${code}/${++redirections}`)
      res.end('')
    })

    t.plan(9)

    t.test('should follow redirect after a HTTP 300', async t => {
      t.plan(4)

      let body = ''

      const { statusCode, headers, body: bodyStream, redirections } = await request(serverRoot + '/300', {
        agent: new RedirectAgent()
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 200)
      t.notOk(headers.location)
      t.deepEqual(redirections, [
        `${serverRoot}/300`,
        `${serverRoot}/300/1`,
        `${serverRoot}/300/2`,
        `${serverRoot}/300/3`,
        `${serverRoot}/300/4`
      ])
      t.is(body, 'GET')
    })

    t.test('should follow redirect after a HTTP 301', async t => {
      t.plan(3)

      let body = ''

      const { statusCode, headers, body: bodyStream } = await request(serverRoot + '/301', {
        method: 'POST',
        agent: new RedirectAgent()
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 200)
      t.notOk(headers.location)
      t.is(body, 'POST')
    })

    t.test('should follow redirect after a HTTP 302', async t => {
      t.plan(3)

      let body = ''

      const { statusCode, headers, body: bodyStream } = await request(serverRoot + '/302', {
        method: 'PUT',
        agent: new RedirectAgent()
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 200)
      t.notOk(headers.location)
      t.is(body, 'PUT')
    })

    t.test('should follow redirect after a HTTP 303 changing method to GET', async t => {
      t.plan(3)

      let body = ''

      const { statusCode, headers, body: bodyStream } = await request(serverRoot + '/303', {
        method: 'PATCH',
        agent: new RedirectAgent()
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 200)
      t.notOk(headers.location)
      t.is(body, 'GET')
    })

    t.test('should follow redirect after a HTTP 307', async t => {
      t.plan(3)

      let body = ''

      const { statusCode, headers, body: bodyStream } = await request(serverRoot + '/307', {
        method: 'DELETE',
        agent: new RedirectAgent()
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 200)
      t.notOk(headers.location)
      t.is(body, 'DELETE')
    })

    t.test('should follow redirect after a HTTP 308', async t => {
      t.plan(3)

      let body = ''

      const { statusCode, headers, body: bodyStream } = await request(serverRoot + '/308', {
        method: 'OPTIONS',
        agent: new RedirectAgent()
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 200)
      t.notOk(headers.location)
      t.is(body, 'OPTIONS')
    })

    t.test('should follow a redirect chain up to the allowed number of times', async t => {
      t.plan(4)

      let body = ''

      const { statusCode, headers, body: bodyStream, redirections } = await request(serverRoot + '/300', {
        agent: new RedirectAgent(),
        maxRedirections: 2
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 300)
      t.is(headers.location, `${serverRoot}/300/4`)
      t.deepEqual(redirections, [`${serverRoot}/300`, `${serverRoot}/300/1`, `${serverRoot}/300/2`])
      t.equal(body.length, 0)
    })

    t.test('should not follow redirections when disabled', async t => {
      t.plan(4)

      let body = ''

      const { statusCode, headers, body: bodyStream, redirections } = await request(serverRoot + '/300', {
        agent: new RedirectAgent(),
        maxRedirections: false
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 300)
      t.is(headers.location, `${serverRoot}/300/1`)
      t.notOk(redirections)
      t.equal(body.length, 0)
    })

    t.test('should work when going cross origin', async t => {
      const server1 = await startServer(t, (req, res) => {
        if (req.url === '/') {
          res.statusCode = 301
          res.setHeader('Location', `${server2}/`)
          res.end('')
          return
        }

        res.end(req.method)
      })

      const server2 = await startServer(t, (req, res) => {
        res.statusCode = 301

        if (req.url === '/') {
          res.setHeader('Location', `${server3}/`)
        } else {
          res.setHeader('Location', `${server3}/end`)
        }

        res.end('')
      })

      const server3 = await startServer(t, (req, res) => {
        res.statusCode = 301

        if (req.url === '/') {
          res.setHeader('Location', `${server2}/end`)
        } else {
          res.setHeader('Location', `${server1}/end`)
        }

        res.end('')
      })

      t.plan(4)

      let body = ''

      const { statusCode, headers, body: bodyStream, redirections } = await request(server1, {
        method: 'POST',
        agent: new RedirectAgent()
      })

      for await (const b of bodyStream) {
        body += b
      }

      t.is(statusCode, 200)
      t.notOk(headers.location)
      t.deepEqual(redirections, [`${server1}/`, `${server2}/`, `${server3}/`, `${server2}/end`, `${server3}/end`])
      t.is(body, 'POST')
    })
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

        const { statusCode, headers, body: bodyStream } = await request(`${serverRoot}/${code}`, {
          agent: new RedirectAgent()
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
        agent: new RedirectAgent()
      },
      error => {
        t.is(error.code, 'EADDRNOTAVAIL')
      }
    )
  })

  t.test('should handle errors (promise)', async t => {
    t.plan(1)

    try {
      await request('http://localhost:0', { agent: new RedirectAgent() })
      throw new Error('Did not throw')
    } catch (e) {
      t.is(e.code, 'EADDRNOTAVAIL')
    }
  })
})
