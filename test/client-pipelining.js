'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { finished, Readable } = require('stream')

test('20 times GET with pipelining 10', (t) => {
  const num = 20
  t.plan(3 * num + 1)

  let count = 0
  let countGreaterThanOne = false
  const server = createServer((req, res) => {
    count++
    setTimeout(function () {
      countGreaterThanOne = countGreaterThanOne || count > 1
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  // needed to check for a warning on the maxListeners on the socket
  process.on('warning', t.fail)
  t.tearDown(() => {
    process.removeListener('warning', t.fail)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    t.tearDown(client.close.bind(client))

    for (var i = 0; i < num; i++) {
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
})

function makeRequestAndExpectUrl (client, i, t, cb) {
  return client.request({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
    cb()
    t.error(err)
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

test('20 times HEAD with pipelining 10', (t) => {
  const num = 20
  t.plan(3 * num + 1)

  let count = 0
  let countGreaterThanOne = false
  const server = createServer((req, res) => {
    count++
    setTimeout(function () {
      countGreaterThanOne = countGreaterThanOne || count > 1
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  // needed to check for a warning on the maxListeners on the socket
  process.on('warning', t.fail)
  t.tearDown(() => {
    process.removeListener('warning', t.fail)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10
    })
    t.tearDown(client.close.bind(client))

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      makeHeadRequestAndExpectUrl(client, i, t, () => {
        count--

        if (i === num - 1) {
          t.ok(countGreaterThanOne, 'seen more than one parallel request')
        }
      })
      return !client.full
    }
  })
})

function makeHeadRequestAndExpectUrl (client, i, t, cb) {
  return client.request({ path: '/' + i, method: 'HEAD' }, (err, { statusCode, headers, body }) => {
    cb()
    t.error(err)
    t.strictEqual(statusCode, 200)
    body
      .resume()
      .on('end', () => {
        t.pass()
      })
  })
}

test('A client should enqueue as much as twice its pipelining factor', (t) => {
  const num = 10
  let sent = 0
  // x * 6 + 1 t.ok + 5 drain
  t.plan(num * 6 + 1 + 5)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.close.bind(client))

    for (; sent < 2;) {
      t.notOk(client.full, 'client is not full')
      makeRequest()
      t.ok(!client.full, 'we can send more requests')
    }

    t.notOk(client.full, 'client is full')
    makeRequest()
    t.ok(client.full, 'we must stop now')
    t.ok(client.full, 'client is full')

    function makeRequest () {
      makeRequestAndExpectUrl(client, sent++, t, () => {
        count--
        process.nextTick(() => {
          if (client.size === 0) {
            t.ok(countGreaterThanOne, 'seen more than one parallel request')
            const start = sent
            for (; sent < start + 2 && sent < num;) {
              t.notOk(client.full, 'client is not full')
              t.ok(makeRequest())
            }
          }
        })
      })
      return !client.full
    }
  })
})

test('pipeline 1 is 1 active request', (t) => {
  t.plan(8)

  let res2
  const server = createServer((req, res) => {
    res.write('asd')
    res2 = res
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.tearDown(client.destroy.bind(client))
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.strictEqual(client.size, 1)
      t.error(err)
      t.notOk(client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        finished(data.body, (err) => {
          t.ok(err)
          client.close((err) => {
            t.error(err)
          })
        })
        data.body.destroy()
        res2.end()
      }))
      data.body.resume()
      res2.end()
    })
    t.ok(!client.full)
    t.strictEqual(client.size, 1)
  })
})

test('pipelined chunked POST ', (t) => {
  t.plan(4 + 8 + 8)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.error(err)
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
      t.error(err)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      body.resume()
      t.error(err)
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
      t.error(err)
    })
  })
})

test('errored POST body lets inflight complete', (t) => {
  t.plan(6)

  let serverRes
  const server = createServer()
  server.on('request', (req, res) => {
    res.write('asd')
    serverRes = res
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body
        .resume()
        .once('data', () => {
          client.request({
            path: '/',
            method: 'POST',
            body: new Readable({
              read () {
                this.destroy(new Error('kaboom'))
              }
            }).once('error', (err) => {
              t.ok(err)
            }).on('error', () => {
              // Readable emits error twice...
            })
          }, (err, data) => {
            t.ok(err)
            t.strictEqual(data, null)
          })
          client.close((err) => {
            t.error(err)
          })
          serverRes.end()
        })
        .on('end', () => {
          t.pass()
        })
    })
  })
})

test('pipelining non-idempotent', (t) => {
  t.plan(4)

  const server = createServer()
  server.on('request', (req, res) => {
    setTimeout(() => {
      res.end('asd')
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.close.bind(client))

    let ended = false
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body
        .resume()
        .on('end', () => {
          t.pass()
          ended = true
        })
    })

    client.request({
      path: '/',
      method: 'GET',
      idempotent: false
    }, (err, data) => {
      t.error(err)
      t.strictEqual(ended, true)
      data.body.resume()
    })
  })
})

test('pipelining non-idempotent w body', (t) => {
  t.plan(4)

  const server = createServer()
  server.on('request', (req, res) => {
    setImmediate(() => {
      res.end('asd')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.close.bind(client))

    let ended = false
    let reading = false
    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
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
      })
    }, (err, data) => {
      t.error(err)
      data.body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })

    client.request({
      path: '/',
      method: 'GET',
      idempotent: false
    }, (err, data) => {
      t.error(err)
      t.strictEqual(ended, true)
      data.body.resume()
    })
  })
})
