'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { finished, Readable } = require('node:stream')
const { kConnect } = require('../lib/core/symbols')
const EE = require('node:events')
const { kBusy, kRunning, kSize } = require('../lib/core/symbols')
const { maybeWrapStream, consts } = require('./utils/async-iterators')

test('20 times GET with pipelining 10', async (t) => {
  const num = 20
  t = tspl(t, { plan: 3 * num + 1 })

  let count = 0
  let countGreaterThanOne = false
  const server = createServer((req, res) => {
    count++
    setTimeout(function () {
      countGreaterThanOne = countGreaterThanOne || count > 1
      res.end(req.url)
    }, 10)
  })
  after(() => server.close())

  // needed to check for a warning on the maxListeners on the socket
  function onWarning (warning) {
    if (!/ExperimentalWarning/.test(warning)) {
      t.fail()
    }
  }
  process.on('warning', onWarning)
  after(() => {
    process.removeListener('warning', onWarning)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    after(() => client.close())

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      makeRequestAndExpectUrl(client, i, t, () => {
        count--

        if (i === num - 1) {
          t.ok(countGreaterThanOne, 'seen more than one parallel request')
        }
      })
    }
  })

  await t.completed
})

function makeRequestAndExpectUrl (client, i, t, cb) {
  return client.request({ path: '/' + i, method: 'GET', blocking: false }, (err, { statusCode, headers, body }) => {
    cb()
    t.ifError(err)
    t.strictEqual(statusCode, 200)
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.strictEqual('/' + i, Buffer.concat(bufs).toString('utf8'))
    })
  })
}

test('A client should enqueue as much as twice its pipelining factor', async (t) => {
  const num = 10
  let sent = 0
  // x * 6 + 1 t.ok + 5 drain
  t = tspl(t, { plan: num * 6 + 1 + 5 + 2 })

  let count = 0
  let countGreaterThanOne = false
  const server = createServer((req, res) => {
    count++
    t.ok(count <= 5)
    setTimeout(function () {
      countGreaterThanOne = countGreaterThanOne || count > 1
      res.end(req.url)
    }, 10)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.close())

    for (; sent < 2;) {
      t.ok(client[kSize] <= client.pipelining, 'client is not full')
      makeRequest()
      t.ok(client[kSize] <= client.pipelining, 'we can send more requests')
    }

    t.ok(client[kBusy], 'client is busy')
    t.ok(client[kSize] <= client.pipelining, 'client is full')
    makeRequest()
    t.ok(client[kBusy], 'we must stop now')
    t.ok(client[kBusy], 'client is busy')
    t.ok(client[kSize] > client.pipelining, 'client is full')

    function makeRequest () {
      makeRequestAndExpectUrl(client, sent++, t, () => {
        count--
        setImmediate(() => {
          if (client[kSize] === 0) {
            t.ok(countGreaterThanOne, 'seen more than one parallel request')
            const start = sent
            for (; sent < start + 2 && sent < num;) {
              t.ok(client[kSize] <= client.pipelining, 'client is not full')
              t.ok(makeRequest())
            }
          }
        })
      })
      return client[kSize] <= client.pipelining
    }
  })

  await t.completed
})

test('pipeline 1 is 1 active request', async (t) => {
  t = tspl(t, { plan: 9 })

  let res2
  const server = createServer((req, res) => {
    res.write('asd')
    res2 = res
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    after(() => client.destroy())
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.strictEqual(client[kSize], 1)
      t.ifError(err)
      t.strictEqual(client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.ifError(err)
        finished(data.body, (err) => {
          t.ok(err)
          client.close((err) => {
            t.ifError(err)
          })
        })
        data.body.destroy()
        res2.end()
      }), undefined)
      data.body.resume()
      res2.end()
    })
    t.ok(client[kSize] <= client.pipelining)
    t.ok(client[kBusy])
    t.strictEqual(client[kSize], 1)
  })

  await t.completed
})

test('pipelined chunked POST stream', async (t) => {
  t = tspl(t, { plan: 4 + 8 + 8 })

  let a = 0
  let b = 0

  const server = createServer((req, res) => {
    req.on('data', chunk => {
      // Make sure a and b don't interleave.
      t.ok(a === 9 || b === 0)
      res.write(chunk)
    }).on('end', () => {
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
        read () {
          this.push(++a > 8 ? null : 'a')
        }
      })
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
        read () {
          this.push(++b > 8 ? null : 'b')
        }
      })
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })
  })

  await t.completed
})

test('pipelined chunked POST iterator', async (t) => {
  t = tspl(t, { plan: 4 + 8 + 8 })

  let a = 0
  let b = 0

  const server = createServer((req, res) => {
    req.on('data', chunk => {
      // Make sure a and b don't interleave.
      t.ok(a === 9 || b === 0)
      res.write(chunk)
    }).on('end', () => {
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: (async function * () {
        while (++a <= 8) {
          yield 'a'
        }
      })()
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: (async function * () {
        while (++b <= 8) {
          yield 'b'
        }
      })()
    }, (err, { body }) => {
      body.resume()
      t.ifError(err)
    })
  })

  await t.completed
})

function errordInflightPost (bodyType) {
  test(`errored POST body lets inflight complete ${bodyType}`, async (t) => {
    t = tspl(t, { plan: 6 })

    let serverRes
    const server = createServer()
    server.on('request', (req, res) => {
      serverRes = res
      res.write('asd')
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        pipelining: 2
      })
      after(() => client.destroy())

      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.ifError(err)
        data.body
          .resume()
          .once('data', () => {
            client.request({
              path: '/',
              method: 'POST',
              opaque: 'asd',
              body: maybeWrapStream(new Readable({
                read () {
                  this.destroy(new Error('kaboom'))
                }
              }).once('error', (err) => {
                t.ok(err)
              }).on('error', () => {
                // Readable emits error twice...
              }), bodyType)
            }, (err, data) => {
              t.ok(err)
              t.strictEqual(data.opaque, 'asd')
            })
            client.close((err) => {
              t.ifError(err)
            })
            serverRes.end()
          })
          .on('end', () => {
            t.ok(true, 'pass')
          })
      })
    })
    await t.completed
  })
}

errordInflightPost(consts.STREAM)
errordInflightPost(consts.ASYNC_ITERATOR)

test('pipelining non-idempotent', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer()
  server.on('request', (req, res) => {
    setTimeout(() => {
      res.end('asd')
    }, 10)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.close())

    let ended = false
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.ifError(err)
      data.body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
          ended = true
        })
    })

    client.request({
      path: '/',
      method: 'GET',
      idempotent: false
    }, (err, data) => {
      t.ifError(err)
      t.strictEqual(ended, true)
      data.body.resume()
    })
  })

  await t.completed
})

function pipeliningNonIdempotentWithBody (bodyType) {
  test(`pipelining non-idempotent w body ${bodyType}`, async (t) => {
    t = tspl(t, { plan: 4 })

    const server = createServer()
    server.on('request', (req, res) => {
      setImmediate(() => {
        res.end('asd')
      })
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        pipelining: 2
      })
      after(() => client.close())

      let ended = false
      let reading = false
      client.request({
        path: '/',
        method: 'POST',
        body: maybeWrapStream(new Readable({
          read () {
            if (reading) {
              return
            }
            reading = true
            this.push('asd')
            setImmediate(() => {
              this.push(null)
              ended = true
            })
          }
        }), bodyType)
      }, (err, data) => {
        t.ifError(err)
        data.body
          .resume()
          .on('end', () => {
            t.ok(true, 'pass')
          })
      })

      client.request({
        path: '/',
        method: 'GET',
        idempotent: false
      }, (err, data) => {
        t.ifError(err)
        t.strictEqual(ended, true)
        data.body.resume()
      })
    })

    await t.completed
  })
}

pipeliningNonIdempotentWithBody(consts.STREAM)
pipeliningNonIdempotentWithBody(consts.ASYNC_ITERATOR)

function pipeliningHeadBusy (bodyType) {
  test(`pipelining HEAD busy ${bodyType}`, async (t) => {
    t = tspl(t, { plan: 7 })

    const server = createServer()
    server.on('request', (req, res) => {
      res.end('asd')
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        pipelining: 10
      })
      after(() => client.close())

      client[kConnect](() => {
        let ended = false
        client.once('disconnect', () => {
          t.strictEqual(ended, true)
        })

        {
          const body = new Readable({
            read () { }
          })
          client.request({
            path: '/',
            method: 'GET',
            body: maybeWrapStream(body, bodyType)
          }, (err, data) => {
            t.ifError(err)
            data.body
              .resume()
              .on('end', () => {
                t.ok(true, 'pass')
              })
          })
          body.push(null)
          t.strictEqual(client[kBusy], true)
        }

        {
          const body = new Readable({
            read () { }
          })
          client.request({
            path: '/',
            method: 'HEAD',
            body: maybeWrapStream(body, bodyType)
          }, (err, data) => {
            t.ifError(err)
            data.body
              .resume()
              .on('end', () => {
                ended = true
                t.ok(true, 'pass')
              })
          })
          body.push(null)
          t.strictEqual(client[kBusy], true)
        }
      })
    })

    await t.completed
  })
}

pipeliningHeadBusy(consts.STREAM)
pipeliningHeadBusy(consts.ASYNC_ITERATOR)

test('pipelining empty pipeline before reset', async (t) => {
  t = tspl(t, { plan: 8 })

  let c = 0
  const server = createServer()
  server.on('request', (req, res) => {
    if (c++ === 0) {
      res.end('asd')
    } else {
      setTimeout(() => {
        res.end('asd')
      }, 100)
    }
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    after(() => client.close())

    client[kConnect](() => {
      let ended = false
      client.once('disconnect', () => {
        t.strictEqual(ended, true)
      })

      client.request({
        path: '/',
        method: 'GET',
        blocking: false
      }, (err, data) => {
        t.ifError(err)
        data.body
          .resume()
          .on('end', () => {
            t.ok(true, 'pass')
          })
      })
      t.strictEqual(client[kBusy], false)

      client.request({
        path: '/',
        method: 'HEAD',
        body: 'asd'
      }, (err, data) => {
        t.ifError(err)
        data.body
          .resume()
          .on('end', () => {
            ended = true
            t.ok(true, 'pass')
          })
      })
      t.strictEqual(client[kBusy], true)
      t.strictEqual(client[kRunning], 2)
    })
  })

  await t.completed
})

function pipeliningIdempotentBusy (bodyType) {
  test(`pipelining idempotent busy ${bodyType}`, async (t) => {
    t = tspl(t, { plan: 12 })

    const server = createServer()
    server.on('request', (req, res) => {
      res.end('asd')
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        pipelining: 10
      })
      after(() => client.close())

      {
        const body = new Readable({
          read () { }
        })
        client.request({
          path: '/',
          method: 'GET',
          body: maybeWrapStream(body, bodyType)
        }, (err, data) => {
          t.ifError(err)
          data.body
            .resume()
            .on('end', () => {
              t.ok(true, 'pass')
            })
        })
        body.push(null)
        t.strictEqual(client[kBusy], true)
      }

      client[kConnect](() => {
        {
          const body = new Readable({
            read () { }
          })
          client.request({
            path: '/',
            method: 'GET',
            body: maybeWrapStream(body, bodyType)
          }, (err, data) => {
            t.ifError(err)
            data.body
              .resume()
              .on('end', () => {
                t.ok(true, 'pass')
              })
          })
          body.push(null)
          t.strictEqual(client[kBusy], true)
        }

        {
          const signal = new EE()
          const body = new Readable({
            read () { }
          })
          client.request({
            path: '/',
            method: 'GET',
            body: maybeWrapStream(body, bodyType),
            signal
          }, (err, data) => {
            t.ok(err)
          })
          t.strictEqual(client[kBusy], true)
          signal.emit('abort')
          t.strictEqual(client[kBusy], true)
        }

        {
          const body = new Readable({
            read () { }
          })
          client.request({
            path: '/',
            method: 'GET',
            idempotent: false,
            body: maybeWrapStream(body, bodyType)
          }, (err, data) => {
            t.ifError(err)
            data.body
              .resume()
              .on('end', () => {
                t.ok(true, 'pass')
              })
          })
          body.push(null)
          t.strictEqual(client[kBusy], true)
        }
      })
    })

    await t.completed
  })
}

pipeliningIdempotentBusy(consts.STREAM)
pipeliningIdempotentBusy(consts.ASYNC_ITERATOR)

test('pipelining blocked', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer()

  let blocking = true
  let count = 0

  server.on('request', (req, res) => {
    t.ok(!count || !blocking)
    count++
    setImmediate(() => {
      res.end('asd')
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    after(() => client.close())
    client.request({
      path: '/',
      method: 'GET',
      blocking: true
    }, (err, data) => {
      t.ifError(err)
      blocking = false
      data.body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.ifError(err)
      data.body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })
  })

  await t.completed
})
