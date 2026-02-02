'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { gzipSync } = require('node:zlib')
const { fetch, setGlobalDispatcher, getGlobalDispatcher, Agent } = require('../..')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

const previousDispatcher = getGlobalDispatcher()
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1
}))

after(() => {
  setGlobalDispatcher(previousDispatcher)
})

const skip = runtimeFeatures.has('crypto') === false

test('request with correct integrity checksum', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  t.after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${hash}`
  })
  t.assert.strictEqual(body, await response.text())
})

test('request with wrong integrity checksum', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash = 'c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51b'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const expectedError = new TypeError('fetch failed', {
    cause: new Error('integrity mismatch')
  })

  await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${hash}`
  }), expectedError)
})

test('request with integrity checksum on encoded body', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-encoding', 'gzip')
    res.end(gzipSync(body))
  })

  t.after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  const response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${hash}`
  })
  t.assert.strictEqual(body, await response.text())
})

test('request with a totally incorrect integrity', { skip }, async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await t.assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'what-integrityisthis'
  }))
})

test('request with mixed in/valid integrities', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await t.assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: `invalid-integrity sha256-${hash}`
  }))
})

test('request with sha384 hash', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY/JV615lypu7hkHMz+'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  // request should succeed
  await t.assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${hash}`
  }))

  // request should fail
  await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha384-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
  }))
})

test('request with sha512 hash', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash = '9s3ioPgZMUzd5V/CJ9jX2uPSjMVWIioKitZtkcytSq1glPUXohgjYMmqz2o9wyMWLLb9jN/+2w/gOPVehf+1tg=='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  // request should succeed
  await t.assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha512-${hash}`
  }))

  // request should fail
  await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha512-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
  }))
})

test('request with sha512 hash', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash384 = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY/JV615lypu7hkHMz+'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  // request should fail
  await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha512-${hash384} sha384-${hash384}`
  }))
})

test('request with correct integrity checksum (base64url)', { skip }, async (t) => {
  t.plan(1)
  const body = 'Hello world!'
  const hash = 'wFNeS-K3n_2TKRMFQ2v4iTFOSj-uwF7P_Lt98xrZ5Ro'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  const response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${hash}`
  })
  t.assert.strictEqual(body, await response.text())
})

test('request with incorrect integrity checksum (base64url)', { skip }, async (t) => {
  t.plan(1)

  const body = 'Hello world!'
  // base64url for 'invalid' sha256
  const hash = '8SNNdReNiSoTOkEDVaWpkM910vM-uiXVdZQ9TfYy86Q'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${hash}`
  }))
})

test('request with incorrect integrity checksum (only dash)', { skip }, async (t) => {
  t.plan(1)

  const body = 'Hello world!'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha256--'
  }))
})

test('request with incorrect integrity checksum (non-ascii character)', { skip }, async (t) => {
  t.plan(1)

  const body = 'Hello world!'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  await t.assert.rejects(() => fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha256-ä'
  }))
})

test('request with incorrect stronger integrity checksum (non-ascii character)', { skip }, async (t) => {
  t.plan(2)

  const body = 'Hello world!'
  const sha256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
  const sha384 = 'ä'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  await t.assert.rejects(() => fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${sha256} sha384-${sha384}`
  }))
  await t.assert.rejects(() => fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${sha384} sha256-${sha256}`
  }))
})

test('request with correct integrity checksum (base64). mixed', { skip }, async (t) => {
  t.plan(6)
  const body = 'Hello world!'
  const sha256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
  const sha384 = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY/JV615lypu7hkHMz+'
  const sha512 = '9s3ioPgZMUzd5V/CJ9jX2uPSjMVWIioKitZtkcytSq1glPUXohgjYMmqz2o9wyMWLLb9jN/+2w/gOPVehf+1tg=='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  let response
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${sha256} sha512-${sha512}`
  })
  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha512-${sha512} sha256-${sha256}`
  })

  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${sha384} sha512-${sha512}`
  })
  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${sha384} sha512-${sha512}`
  })
  t.assert.strictEqual(body, await response.text())

  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${sha256} sha384-${sha384}`
  })
  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${sha384} sha256-${sha256}`
  })
  t.assert.strictEqual(body, await response.text())
})

test('request with correct integrity checksum (base64url). mixed', { skip }, async (t) => {
  t.plan(6)
  const body = 'Hello world!'
  const sha256 = 'wFNeS-K3n_2TKRMFQ2v4iTFOSj-uwF7P_Lt98xrZ5Ro'
  const sha384 = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY_JV615lypu7hkHMz-'
  const sha512 = '9s3ioPgZMUzd5V_CJ9jX2uPSjMVWIioKitZtkcytSq1glPUXohgjYMmqz2o9wyMWLLb9jN_-2w_gOPVehf-1tg'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  let response
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${sha256} sha512-${sha512}`
  })
  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha512-${sha512} sha256-${sha256}`
  })

  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${sha384} sha512-${sha512}`
  })
  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${sha384} sha512-${sha512}`
  })
  t.assert.strictEqual(body, await response.text())

  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha256-${sha256} sha384-${sha384}`
  })
  t.assert.strictEqual(body, await response.text())
  response = await fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${sha384} sha256-${sha256}`
  })
  t.assert.strictEqual(body, await response.text())
})
