'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - redirecting', () => {
  [301, 302, 307, 308].forEach((statusCode) => {
    test(`Should redirect on ${statusCode} status code`, async (t) => {
      const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
        if (res.req.url === '/redirect') {
          res.writeHead(statusCode, undefined, { Location: '/target' })
          res.end()
        } else if (res.req.url === '/target') {
          res.writeHead(200, 'dummy', { 'Content-Type': 'text/event-stream' })
          res.end()
        }
      })

      await once(server.listen(0), 'listening')

      const port = server.address().port

      const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
      eventSourceInstance.onerror = (e) => {
        t.assert.fail('Should not have errored')
      }
      eventSourceInstance.onopen = () => {
        t.assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/redirect`)
        eventSourceInstance.close()
        server.close()
      }
    })
  })

  test('Stop trying to connect when getting a 204 response', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (res.req.url === '/redirect') {
        res.writeHead(301, undefined, { Location: '/target' })
        res.end()
      } else if (res.req.url === '/target') {
        res.writeHead(204, 'OK')
        res.end()
      }
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
    eventSourceInstance.onerror = (event) => {
      t.assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/redirect`)
      t.assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
      server.close()
    }
    eventSourceInstance.onopen = () => {
      t.assert.fail('Should not have opened')
    }
  })

  test('Throw when missing a Location header', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (res.req.url === '/redirect') {
        res.writeHead(301, undefined)
        res.end()
      } else if (res.req.url === '/target') {
        res.writeHead(204, 'OK')
        res.end()
      }
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
    eventSourceInstance.onerror = () => {
      t.assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/redirect`)
      t.assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
      server.close()
    }
  })

  test('Should reconnect to the original URL after a redirect', async (t) => {
    const requests = []
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      requests.push([req.url, req.headers['last-event-id']])
      if (req.url === '/redirect') {
        res.writeHead(307, undefined, { Location: '/target' })
        res.end()
      } else {
        res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
        res.end(`id: ${requests.length}\nretry: 0\ndata: x\n\n`)
      }
    })
    await once(server.listen(0), 'listening')

    const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}/redirect`)
    t.after(() => {
      eventSourceInstance.close()
      server.close()
    })

    let opens = 0
    await new Promise((resolve) => {
      eventSourceInstance.onopen = () => {
        if (++opens === 3) resolve()
      }
    })
    eventSourceInstance.close()

    t.assert.deepStrictEqual(requests, [
      ['/redirect', undefined],
      ['/target', undefined],
      ['/redirect', '2'],
      ['/target', '2'],
      ['/redirect', '4'],
      ['/target', '4']
    ])
  })

  test('Should keep reconnecting after more than 20 redirects in total', async (t) => {
    // Every URL serves the stream once and redirects to a new URL afterwards,
    // so each reconnect follows exactly one redirect.
    const served = new Set()
    let next = 0
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (served.has(req.url)) {
        res.writeHead(307, undefined, { Location: `/node/${++next}` })
        res.end()
        return
      }
      served.add(req.url)
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end('retry: 0\ndata: x\n\n')
    })
    await once(server.listen(0), 'listening')

    const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}/events`)
    t.after(() => {
      eventSourceInstance.close()
      server.close()
    })

    let opens = 0
    let errors = 0
    await new Promise((resolve, reject) => {
      eventSourceInstance.onopen = () => {
        if (++opens === 25) resolve()
      }
      eventSourceInstance.onerror = () => {
        // Each connection ends with one error before reconnecting. More
        // errors than opens means reconnects are failing without opening.
        if (++errors > opens + 2) {
          reject(new Error(`reconnects stopped opening after ${opens} connections`))
        }
      }
    })

    t.assert.strictEqual(opens, 25)
    t.assert.strictEqual(eventSourceInstance.readyState, EventSource.OPEN)
  })

  test('Should set origin attribute of messages after redirecting', async (t) => {
    const targetServer = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (res.req.url === '/target') {
        res.writeHead(200, undefined, { 'Content-Type': 'text/event-stream' })
        res.write('event: message\ndata: test\n\n')
      }
    })

    await once(targetServer.listen(0), 'listening')
    const targetPort = targetServer.address().port

    const sourceServer = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(301, undefined, { Location: `http://127.0.0.1:${targetPort}/target` })
      res.end()
    })

    await once(sourceServer.listen(0), 'listening')
    const sourcePort = sourceServer.address().port

    const eventSourceInstance = new EventSource(`http://127.0.0.1:${sourcePort}/redirect`)
    eventSourceInstance.onmessage = (event) => {
      t.assert.strictEqual(event.origin, `http://127.0.0.1:${targetPort}`)
      eventSourceInstance.close()
      targetServer.close()
      sourceServer.close()
    }
    eventSourceInstance.onerror = (e) => {
      t.assert.fail('Should not have errored')
    }
  })
})
