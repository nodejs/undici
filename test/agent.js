'use strict'

const tap = require('tap')
const http = require('http')
const { Agent, request, stream, pipeline, setGlobalAgent } = require('../lib/agent')
const { PassThrough } = require('stream')
const { InvalidArgumentError, InvalidReturnValueError } = require('../lib/core/errors')
const { kAgentCache } = require('../lib/core/symbols')

const SKIP = typeof WeakRef === 'undefined' || typeof FinalizationRegistry === 'undefined'

tap.test('Agent', { skip: SKIP }, t => {
  t.plan(5)

  t.test('setGlobalAgent', t => {
    t.plan(2)

    t.test('fails if agent does not implement `get` method', t => {
      t.plan(1)
      t.throw(() => setGlobalAgent({ get: 'not a function' }), InvalidArgumentError)
    })

    t.test('sets global agent', t => {
      t.plan(2)
      t.notThrow(() => setGlobalAgent(new Agent()))
      t.notThrow(() => setGlobalAgent({ get: () => {} }))
    })

    t.tearDown(() => {
      // reset globalAgent to a fresh Agent instance for later tests
      setGlobalAgent(new Agent())
    })
  })

  t.test('Agent', t => {
    t.plan(4)

    t.notThrow(() => new Agent())
    t.notThrow(() => new Agent({ connections: 5 }))
    t.throw(() => new Agent().get(), InvalidArgumentError)
    t.throw(() => new Agent().get(''), InvalidArgumentError)
  })

  t.test('Agent close and destroy', t => {
    t.plan(2)

    const wanted = 'payload'

    const createServer = () => http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end(wanted)
    })

    const promisifyServerListen = server => new Promise((resolve, reject) => {
      server.listen(0, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })

    const _request = async (t, agent, server) => {
      try {
        const { statusCode, headers, body } = await request(`http://localhost:${server.address().port}`, { agent })
        t.strictEqual(statusCode, 200, 'status code should be 200')
        t.strictEqual(headers['content-type'], 'text/plain', 'header should be text/plain')
        const bufs = []
        for await (const buf of body) {
          bufs.push(buf)
        }
        t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'), 'wanted data should be stream by body')
      } catch (err) {
        t.fail(err)
      }
    }

    t.test('closes all origins', async t => {
      t.plan(15)
      const N = 3

      const servers = Array.from(Array(N)).map(() => createServer())

      const agent = new Agent()

      await Promise.all(servers.map(server => promisifyServerListen(server)))
      await Promise.all(servers.map(server => _request(t, agent, server)))
      for (const server of servers) {
        t.ok(server.listening, 'server should be listening')
      }
      await agent.close()
      for (const ref of agent[kAgentCache].values()) {
        const pool = ref.deref()
        t.ok(pool.closed, 'pools should be closed')
      }
    })

    t.test('destroys all origins', async t => {
      t.plan(15)
      const N = 3

      const servers = Array.from(Array(N)).map(() => createServer())

      const agent = new Agent()

      await Promise.all(servers.map(server => promisifyServerListen(server)))
      await Promise.all(servers.map(server => _request(t, agent, server)))
      for (const server of servers) {
        t.ok(server.listening, 'server should be listening')
      }
      await agent.destroy()
      for (const ref of agent[kAgentCache].values()) {
        const pool = ref.deref()
        t.ok(pool.destroyed, 'pools should be destroyed')
      }
    })
  })

  t.test('request a resource', t => {
    t.plan(5)

    t.test('with globalAgent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.strictEqual('/', req.url)
        t.strictEqual('GET', req.method)
        t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.tearDown(server.close.bind(server))

      server.listen(0, () => {
        request(`http://localhost:${server.address().port}`)
          .then(({ statusCode, headers, body }) => {
            t.strictEqual(statusCode, 200)
            t.strictEqual(headers['content-type'], 'text/plain')
            const bufs = []
            body.on('data', (buf) => {
              bufs.push(buf)
            })
            body.on('end', () => {
              t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
            })
          })
          .catch(err => {
            t.fail(err)
          })
      })
    })

    t.test('with local agent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.strictEqual('/', req.url)
        t.strictEqual('GET', req.method)
        t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.tearDown(server.close.bind(server))

      const agent = new Agent()

      server.listen(0, () => {
        request(`http://localhost:${server.address().port}`, { agent })
          .then(({ statusCode, headers, body }) => {
            t.strictEqual(statusCode, 200)
            t.strictEqual(headers['content-type'], 'text/plain')
            const bufs = []
            body.on('data', (buf) => {
              bufs.push(buf)
            })
            body.on('end', () => {
              t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
            })
          })
          .catch(err => {
            t.fail(err)
          })
      })
    })

    t.test('fails with invalid URL', t => {
      t.plan(4)
      t.throw(() => request(), InvalidArgumentError, 'throws on missing url argument')
      t.throw(() => request(''), TypeError, 'throws on invalid url')
      t.throw(() => request({}), InvalidArgumentError, 'throws on missing url.origin argument')
      t.throw(() => request({ origin: '' }), InvalidArgumentError, 'throws on invalid url.origin argument')
    })

    t.test('fails with unsupported opts.path', t => {
      t.plan(3)
      t.throw(() => request('https://example.com', { path: 'asd' }), InvalidArgumentError, 'throws on opts.path argument')
      t.throw(() => request('https://example.com', { path: '' }), InvalidArgumentError, 'throws on opts.path argument')
      t.throw(() => request('https://example.com', { path: 0 }), InvalidArgumentError, 'throws on opts.path argument')
    })

    t.test('fails with invalid client', t => {
      t.plan(1)
      const agent = {
        get: () => ({})
      }
      t.throw(() => request('https://example.com', { agent }), InvalidReturnValueError)
    })
  })

  t.test('stream a resource', t => {
    t.plan(4)

    t.test('with globalAgent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.strictEqual('/', req.url)
        t.strictEqual('GET', req.method)
        t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.tearDown(server.close.bind(server))

      server.listen(0, () => {
        stream(
          `http://localhost:${server.address().port}`,
          {
            opaque: new PassThrough()
          },
          ({ statusCode, headers, opaque: pt }) => {
            t.strictEqual(statusCode, 200)
            t.strictEqual(headers['content-type'], 'text/plain')
            const bufs = []
            pt.on('data', (buf) => {
              bufs.push(buf)
            })
            pt.on('end', () => {
              t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
            })
            pt.on('error', () => {
              t.fail()
            })
            return pt
          }
        )
      })
    })

    t.test('with a local agent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.strictEqual('/', req.url)
        t.strictEqual('GET', req.method)
        t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.tearDown(server.close.bind(server))

      const agent = new Agent()

      server.listen(0, () => {
        stream(
          `http://localhost:${server.address().port}`,
          {
            agent,
            opaque: new PassThrough()
          },
          ({ statusCode, headers, opaque: pt }) => {
            t.strictEqual(statusCode, 200)
            t.strictEqual(headers['content-type'], 'text/plain')
            const bufs = []
            pt.on('data', (buf) => {
              bufs.push(buf)
            })
            pt.on('end', () => {
              t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
            })
            pt.on('error', () => {
              t.fail()
            })
            return pt
          }
        )
      })
    })

    t.test('fails with invalid URL', t => {
      t.plan(4)
      t.throw(() => stream(), InvalidArgumentError, 'throws on missing url argument')
      t.throw(() => stream(''), TypeError, 'throws on invalid url')
      t.throw(() => stream({}), InvalidArgumentError, 'throws on missing url.origin argument')
      t.throw(() => stream({ origin: '' }), InvalidArgumentError, 'throws on invalid url.origin argument')
    })

    t.test('fails with invalid client', t => {
      t.plan(1)
      const agent = {
        get: () => ({})
      }
      t.throw(() => stream('https://example.com', { agent }), InvalidReturnValueError)
    })
  })

  t.test('pipeline a resource', t => {
    t.plan(4)

    t.test('with globalAgent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.strictEqual('/', req.url)
        t.strictEqual('GET', req.method)
        t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.tearDown(server.close.bind(server))

      server.listen(0, () => {
        const bufs = []

        pipeline(
          `http://localhost:${server.address().port}`,
          {},
          ({ statusCode, headers, body }) => {
            t.strictEqual(statusCode, 200)
            t.strictEqual(headers['content-type'], 'text/plain')
            return body
          }
        )
          .end()
          .on('data', buf => {
            bufs.push(buf)
          })
          .on('end', () => {
            t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
          })
          .on('error', () => {
            t.fail()
          })
      })
    })

    t.test('with a local agent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.strictEqual('/', req.url)
        t.strictEqual('GET', req.method)
        t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.tearDown(server.close.bind(server))

      const agent = new Agent()

      server.listen(0, () => {
        const bufs = []

        pipeline(
          `http://localhost:${server.address().port}`,
          { agent },
          ({ statusCode, headers, body }) => {
            t.strictEqual(statusCode, 200)
            t.strictEqual(headers['content-type'], 'text/plain')
            return body
          }
        )
          .end()
          .on('data', buf => {
            bufs.push(buf)
          })
          .on('end', () => {
            t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
          })
          .on('error', () => {
            t.fail()
          })
      })
    })

    t.test('fails with invalid URL', t => {
      t.plan(4)
      t.throw(() => pipeline(), InvalidArgumentError, 'throws on missing url argument')
      t.throw(() => pipeline(''), TypeError, 'throws on invalid url')
      t.throw(() => pipeline({}), InvalidArgumentError, 'throws on missing url.origin argument')
      t.throw(() => pipeline({ origin: '' }), InvalidArgumentError, 'throws on invalid url.origin argument')
    })

    t.test('fails with invalid client', t => {
      t.plan(1)
      const agent = {
        get: () => ({})
      }
      t.throw(() => pipeline('https://example.com', { agent }), InvalidReturnValueError)
    })
  })
})
