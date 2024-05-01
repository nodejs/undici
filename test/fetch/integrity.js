'use strict'

const { test, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { createHash, getHashes } = require('node:crypto')
const { gzipSync } = require('node:zlib')
const { fetch, setGlobalDispatcher, Agent } = require('../..')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

const supportedHashes = getHashes()

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1
}))

test('request with correct integrity checksum', (t, done) => {
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${hash}`
    })
    assert.strictEqual(body, await response.text())
    done()
  })
})

test('request with wrong integrity checksum', async (t) => {
  const body = 'Hello world!'
  const hash = 'c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51b'

  const server = createServer((req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const expectedError = new TypeError('fetch failed', {
    cause: new Error('integrity mismatch')
  })

  await assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${hash}`
  }), expectedError)
})

test('request with integrity checksum on encoded body', (t, done) => {
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.setHeader('content-encoding', 'gzip')
    res.end(gzipSync(body))
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${hash}`
    })
    assert.strictEqual(body, await response.text())
    done()
  })
})

test('request with a totally incorrect integrity', async (t) => {
  const server = createServer((req, res) => {
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'what-integrityisthis'
  }))
})

test('request with mixed in/valid integrities', async (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: `invalid-integrity sha256-${hash}`
  }))
})

test('request with sha384 hash', { skip: !supportedHashes.includes('sha384') }, async (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha384').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  // request should succeed
  await assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${hash}`
  }))

  // request should fail
  await assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha384-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
  }))
})

test('request with sha512 hash', { skip: !supportedHashes.includes('sha512') }, async (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha512').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  // request should succeed
  await assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha512-${hash}`
  }))

  // request should fail
  await assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha512-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
  }))
})

test('request with correct integrity checksum (base64url)', async (t) => {
  t = tspl(t, { plan: 1 })
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('base64url')

  const server = createServer((req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${hash}`
    })
    t.strictEqual(body, await response.text())
  })

  await t.completed
})

test('request with incorrect integrity checksum (base64url)', async (t) => {
  t = tspl(t, { plan: 1 })

  const body = 'Hello world!'
  const hash = createHash('sha256').update('invalid').digest('base64url')

  const server = createServer((req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  server.listen(0, async () => {
    await t.rejects(fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${hash}`
    }))
  })

  await t.completed
})

test('request with incorrect integrity checksum (only dash)', async (t) => {
  t = tspl(t, { plan: 1 })

  const body = 'Hello world!'

  const server = createServer((req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  server.listen(0, async () => {
    await t.rejects(fetch(`http://localhost:${server.address().port}`, {
      integrity: 'sha256--'
    }))
  })

  await t.completed
})

test('request with incorrect integrity checksum (non-ascii character)', async (t) => {
  t = tspl(t, { plan: 1 })

  const body = 'Hello world!'

  const server = createServer((req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  server.listen(0, async () => {
    await t.rejects(() => fetch(`http://localhost:${server.address().port}`, {
      integrity: 'sha256-ä'
    }))
  })

  await t.completed
})

test('request with incorrect stronger integrity checksum (non-ascii character)', async (t) => {
  t = tspl(t, { plan: 2 })

  const body = 'Hello world!'
  const sha256 = createHash('sha256').update(body).digest('base64')
  const sha384 = 'ä'

  const server = createServer((req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  server.listen(0, async () => {
    await t.rejects(() => fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${sha256} sha384-${sha384}`
    }))
    await t.rejects(() => fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha384-${sha384} sha256-${sha256}`
    }))
  })

  await t.completed
})

test('request with correct integrity checksum (base64). mixed', async (t) => {
  t = tspl(t, { plan: 6 })
  const body = 'Hello world!'
  const sha256 = createHash('sha256').update(body).digest('base64')
  const sha384 = createHash('sha384').update(body).digest('base64')
  const sha512 = createHash('sha512').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  server.listen(0, async () => {
    let response
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${sha256} sha512-${sha512}`
    })
    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha512-${sha512} sha256-${sha256}`
    })

    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha384-${sha384} sha512-${sha512}`
    })
    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha384-${sha384} sha512-${sha512}`
    })
    t.strictEqual(body, await response.text())

    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${sha256} sha384-${sha384}`
    })
    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha384-${sha384} sha256-${sha256}`
    })
    t.strictEqual(body, await response.text())
  })

  await t.completed
})

test('request with correct integrity checksum (base64url). mixed', async (t) => {
  t = tspl(t, { plan: 6 })
  const body = 'Hello world!'
  const sha256 = createHash('sha256').update(body).digest('base64url')
  const sha384 = createHash('sha384').update(body).digest('base64url')
  const sha512 = createHash('sha512').update(body).digest('base64url')

  const server = createServer((req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  server.listen(0, async () => {
    let response
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${sha256} sha512-${sha512}`
    })
    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha512-${sha512} sha256-${sha256}`
    })

    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha384-${sha384} sha512-${sha512}`
    })
    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha384-${sha384} sha512-${sha512}`
    })
    t.strictEqual(body, await response.text())

    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${sha256} sha384-${sha384}`
    })
    t.strictEqual(body, await response.text())
    response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha384-${sha384} sha256-${sha256}`
    })
    t.strictEqual(body, await response.text())
  })

  await t.completed
})
