'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Agent, Client, Pool, RedirectHandler, interceptors } = require('..')

// https://github.com/nodejs/undici/issues/1744
for (const Dispatcher of [Client, Pool, Agent]) {
  test(`${Dispatcher.name} respects its origin when following redirects`, { timeout: 10000 }, async (t) => {
    const received = []
    const destination = createServer((req, res) => {
      received.push(['destination', req.url])
      res.end('destination')
    })
    const source = createServer((req, res) => {
      received.push(['source', req.url])
      if (req.url === '/start') {
        res.writeHead(302, { location: '/cross-origin' })
        res.end('same-origin redirect')
      } else if (req.url === '/cross-origin') {
        res.writeHead(307, { location: `http://127.0.0.1:${destination.address().port}/final` })
        res.end('cross-origin redirect')
      } else {
        res.end('wrong origin')
      }
    })
    t.after(() => { source.closeAllConnections(); source.close(); destination.closeAllConnections(); destination.close() })
    source.listen(0, '127.0.0.1')
    destination.listen(0, '127.0.0.1')
    await Promise.all([once(source, 'listening'), once(destination, 'listening')])
    const origin = `http://127.0.0.1:${source.address().port}`
    const dispatcher = (Dispatcher === Agent ? new Agent() : new Dispatcher(origin))
      .compose(interceptors.redirect({ maxRedirections: 3 }))
    t.after(() => dispatcher.destroy())

    const response = await dispatcher.request({ origin, path: '/start', method: 'GET' })
    const body = await response.body.text()
    if (Dispatcher === Agent) {
      t.assert.strictEqual(response.statusCode, 200)
      t.assert.strictEqual(body, 'destination')
      t.assert.deepStrictEqual(received, [['source', '/start'], ['source', '/cross-origin'], ['destination', '/final']])
    } else {
      t.assert.strictEqual(response.statusCode, 307)
      t.assert.strictEqual(body, 'cross-origin redirect')
      t.assert.strictEqual(response.headers.location, `http://127.0.0.1:${destination.address().port}/final`)
      t.assert.deepStrictEqual(received, [['source', '/start'], ['source', '/cross-origin']])
    }
  })
}

for (const Dispatcher of [Client, Pool]) {
  test(`buildDispatch preserves a ${Dispatcher.name}'s cross-origin response`, { timeout: 10000 }, async (t) => {
    const received = []
    const server = createServer((req, res) => {
      received.push(req.url)
      res.writeHead(303, { location: 'http://example.test/elsewhere' })
      res.end('redirect body')
    })
    t.after(() => { server.closeAllConnections(); server.close() })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    const dispatcher = new Dispatcher(origin)
    t.after(() => dispatcher.destroy())
    const dispatch = RedirectHandler.buildDispatch(dispatcher, 2)
    const response = await new Promise((resolve, reject) => {
      let status
      let body = ''
      dispatch({ origin, path: '/start', method: 'GET' }, {
        onResponseStart (_controller, statusCode) { status = statusCode },
        onResponseData (_controller, chunk) { body += chunk },
        onResponseEnd () { resolve({ status, body }) },
        onResponseError (_controller, error) { reject(error) }
      })
    })
    t.assert.deepStrictEqual(response, { status: 303, body: 'redirect body' })
    t.assert.deepStrictEqual(received, ['/start'])
  })
}
