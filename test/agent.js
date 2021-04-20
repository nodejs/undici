'use strict'

const tap = require('tap')
const http = require('http')
const { Agent, request, stream, pipeline, setGlobalAgent } = require('../lib/agent')
const { PassThrough } = require('stream')
const { InvalidArgumentError, InvalidReturnValueError } = require('../lib/core/errors')
const { errors } = require('..')

tap.test('Agent', t => {
  t.plan(6)

  t.test('setGlobalAgent', t => {
    t.plan(2)

    t.test('fails if agent does not implement `get` method', t => {
      t.plan(1)
      t.throws(() => setGlobalAgent({ get: 'not a function' }), InvalidArgumentError)
    })

    t.test('sets global agent', t => {
      t.plan(2)
      t.doesNotThrow(() => setGlobalAgent(new Agent()))
      t.doesNotThrow(() => setGlobalAgent({ get: () => {} }))
    })

    t.teardown(() => {
      // reset globalAgent to a fresh Agent instance for later tests
      setGlobalAgent(new Agent())
    })
  })

  t.test('Agent', t => {
    t.plan(4)

    t.doesNotThrow(() => new Agent())
    t.doesNotThrow(() => new Agent({ connections: 5 }))
    t.throws(() => new Agent().get(), InvalidArgumentError)
    t.throws(() => new Agent().get(''), InvalidArgumentError)
  })

  t.test('Agent close and destroy', t => {
    t.plan(2)

    t.test('agent should close internal pools', t => {
      t.plan(2)

      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        const agent = new Agent()

        const origin = `http://localhost:${server.address().port}`

        request(origin, { agent })
          .then(() => {
            t.pass('first request should resolve')
          })
          .catch(err => {
            t.fail(err)
          })

        const pool = agent.get(origin)
        pool.once('connect', () => {
          agent.close().then(() => {
            request(origin, { agent })
              .then(() => {
                t.fail('second request should not resolve')
              })
              .catch(err => {
                t.error(err instanceof errors.ClientClosedError)
              })
          })
        })
      })
    })
    t.test('agent should destroy internal pools', t => {
      t.plan(2)

      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        const agent = new Agent()

        const origin = `http://localhost:${server.address().port}`

        request(origin, { agent })
          .then(() => {
            t.fail()
          })
          .catch(err => {
            t.ok(err instanceof errors.ClientDestroyedError)
          })

        const pool = agent.get(origin)
        pool.once('connect', () => {
          agent.destroy().then(() => {
            request(origin, { agent })
              .then(() => {
                t.fail()
              })
              .catch(err => {
                t.ok(err instanceof errors.ClientDestroyedError)
              })
          })
        })
      })
    })
  })

  t.test('request a resource', t => {
    t.plan(5)

    t.test('with globalAgent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.equal('/', req.url)
        t.equal('GET', req.method)
        t.equal(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        request(`http://localhost:${server.address().port}`)
          .then(({ statusCode, headers, body }) => {
            t.equal(statusCode, 200)
            t.equal(headers['content-type'], 'text/plain')
            const bufs = []
            body.on('data', (buf) => {
              bufs.push(buf)
            })
            body.on('end', () => {
              t.equal(wanted, Buffer.concat(bufs).toString('utf8'))
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
        t.equal('/', req.url)
        t.equal('GET', req.method)
        t.equal(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      const agent = new Agent()

      server.listen(0, () => {
        request(`http://localhost:${server.address().port}`, { agent })
          .then(({ statusCode, headers, body }) => {
            t.equal(statusCode, 200)
            t.equal(headers['content-type'], 'text/plain')
            const bufs = []
            body.on('data', (buf) => {
              bufs.push(buf)
            })
            body.on('end', () => {
              t.equal(wanted, Buffer.concat(bufs).toString('utf8'))
            })
          })
          .catch(err => {
            t.fail(err)
          })
      })
    })

    t.test('fails with invalid URL', t => {
      t.plan(4)
      t.throws(() => request(), InvalidArgumentError, 'throws on missing url argument')
      t.throws(() => request(''), TypeError, 'throws on invalid url')
      t.throws(() => request({}), InvalidArgumentError, 'throws on missing url.origin argument')
      t.throws(() => request({ origin: '' }), InvalidArgumentError, 'throws on invalid url.origin argument')
    })

    t.test('fails with unsupported opts.path', t => {
      t.plan(3)
      t.throws(() => request('https://example.com', { path: 'asd' }), InvalidArgumentError, 'throws on opts.path argument')
      t.throws(() => request('https://example.com', { path: '' }), InvalidArgumentError, 'throws on opts.path argument')
      t.throws(() => request('https://example.com', { path: 0 }), InvalidArgumentError, 'throws on opts.path argument')
    })

    t.test('fails with invalid client', t => {
      t.plan(1)
      const agent = {
        get: () => ({})
      }
      t.throws(() => request('https://example.com', { agent }), InvalidReturnValueError)
    })
  })

  t.test('stream a resource', t => {
    t.plan(4)

    t.test('with globalAgent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.equal('/', req.url)
        t.equal('GET', req.method)
        t.equal(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        stream(
          `http://localhost:${server.address().port}`,
          {
            opaque: new PassThrough()
          },
          ({ statusCode, headers, opaque: pt }) => {
            t.equal(statusCode, 200)
            t.equal(headers['content-type'], 'text/plain')
            const bufs = []
            pt.on('data', (buf) => {
              bufs.push(buf)
            })
            pt.on('end', () => {
              t.equal(wanted, Buffer.concat(bufs).toString('utf8'))
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
        t.equal('/', req.url)
        t.equal('GET', req.method)
        t.equal(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      const agent = new Agent()

      server.listen(0, () => {
        stream(
          `http://localhost:${server.address().port}`,
          {
            agent,
            opaque: new PassThrough()
          },
          ({ statusCode, headers, opaque: pt }) => {
            t.equal(statusCode, 200)
            t.equal(headers['content-type'], 'text/plain')
            const bufs = []
            pt.on('data', (buf) => {
              bufs.push(buf)
            })
            pt.on('end', () => {
              t.equal(wanted, Buffer.concat(bufs).toString('utf8'))
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
      t.throws(() => stream(), InvalidArgumentError, 'throws on missing url argument')
      t.throws(() => stream(''), TypeError, 'throws on invalid url')
      t.throws(() => stream({}), InvalidArgumentError, 'throws on missing url.origin argument')
      t.throws(() => stream({ origin: '' }), InvalidArgumentError, 'throws on invalid url.origin argument')
    })

    t.test('fails with invalid client', t => {
      t.plan(1)
      const agent = {
        get: () => ({})
      }
      t.throws(() => stream('https://example.com', { agent }), InvalidReturnValueError)
    })
  })

  t.test('pipeline a resource', t => {
    t.plan(4)

    t.test('with globalAgent', t => {
      t.plan(6)
      const wanted = 'payload'

      const server = http.createServer((req, res) => {
        t.equal('/', req.url)
        t.equal('GET', req.method)
        t.equal(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      server.listen(0, () => {
        const bufs = []

        pipeline(
          `http://localhost:${server.address().port}`,
          {},
          ({ statusCode, headers, body }) => {
            t.equal(statusCode, 200)
            t.equal(headers['content-type'], 'text/plain')
            return body
          }
        )
          .end()
          .on('data', buf => {
            bufs.push(buf)
          })
          .on('end', () => {
            t.equal(wanted, Buffer.concat(bufs).toString('utf8'))
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
        t.equal('/', req.url)
        t.equal('GET', req.method)
        t.equal(`localhost:${server.address().port}`, req.headers.host)
        res.setHeader('Content-Type', 'text/plain')
        res.end(wanted)
      })

      t.teardown(server.close.bind(server))

      const agent = new Agent()

      server.listen(0, () => {
        const bufs = []

        pipeline(
          `http://localhost:${server.address().port}`,
          { agent },
          ({ statusCode, headers, body }) => {
            t.equal(statusCode, 200)
            t.equal(headers['content-type'], 'text/plain')
            return body
          }
        )
          .end()
          .on('data', buf => {
            bufs.push(buf)
          })
          .on('end', () => {
            t.equal(wanted, Buffer.concat(bufs).toString('utf8'))
          })
          .on('error', () => {
            t.fail()
          })
      })
    })

    t.test('fails with invalid URL', t => {
      t.plan(4)
      t.throws(() => pipeline(), InvalidArgumentError, 'throws on missing url argument')
      t.throws(() => pipeline(''), TypeError, 'throws on invalid url')
      t.throws(() => pipeline({}), InvalidArgumentError, 'throws on missing url.origin argument')
      t.throws(() => pipeline({ origin: '' }), InvalidArgumentError, 'throws on invalid url.origin argument')
    })

    t.test('fails with invalid client', t => {
      t.plan(1)
      const agent = {
        get: () => ({})
      }
      t.throws(() => pipeline('https://example.com', { agent }), InvalidReturnValueError)
    })
  })
})
