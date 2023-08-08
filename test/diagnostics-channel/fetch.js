'use strict'

const t = require('tap')
const fetch = require('../..').fetch

let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  t.skip('missing diagnostics_channel')
  process.exit(0)
}

const { createServer } = require('http')

t.plan(37)

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('trailer', 'foo')
  res.write('hello')
  res.addTrailers({
    foo: 'oof'
  })
  res.end()
})
t.teardown(server.close.bind(server))

let startCalled = 0
diagnosticsChannel.channel('undici:fetch:start').subscribe(({ input, init }) => {
  startCalled += 1
  if (init.redirect) {
    t.equal(input, 'badrequest')
    t.same(init, { redirect: 'error' })
  } else {
    t.equal(input, `http://localhost:${server.address().port}`)
    t.same(init, {})
  }
})

let endCalled = 0
diagnosticsChannel.channel('undici:fetch:end').subscribe(({ input, init, result, error }) => {
  endCalled += 1
  if (init.redirect) {
    t.equal(input, 'badrequest')
    t.same(init, { redirect: 'error' })
  } else {
    t.equal(input, `http://localhost:${server.address().port}`)
    t.same(init, {})
  }
  t.notOk(result)
  t.notOk(error)
})

let asyncStartCalled = 0
diagnosticsChannel.channel('undici:fetch:asyncStart').subscribe(({ input, init, result }) => {
  asyncStartCalled += 1
  if (init.redirect) {
    t.equal(input, 'badrequest')
    t.same(init, { redirect: 'error' })
    t.notOk(result)
  } else {
    t.equal(input, `http://localhost:${server.address().port}`)
    t.same(init, {})
    t.ok(result)
  }
})

let asyncEndCalled = 0
diagnosticsChannel.channel('undici:fetch:asyncEnd').subscribe(async ({ input, init, result, error }) => {
  asyncEndCalled += 1
  if (init.redirect) {
    t.equal(input, 'badrequest')
    t.same(init, { redirect: 'error' })
    t.notOk(result)
    t.ok(error)
    t.equal(error.cause.code, 'ERR_INVALID_URL')
  } else {
    t.equal(input, `http://localhost:${server.address().port}`)
    t.same(init, {})
    t.ok(result)
    t.equal(result.status, 200)
    t.notOk(error)
  }
})

let errorCalled = 0
diagnosticsChannel.channel('undici:fetch:error').subscribe(async ({ input, init, error }) => {
  errorCalled += 1
  if (init.redirect) {
    t.equal(input, 'badrequest')
    t.same(init, { redirect: 'error' })
    t.ok(error)
    t.equal(error.cause.code, 'ERR_INVALID_URL')
  } else {
    t.equal(input, `http://localhost:${server.address().port}`)
    t.same(init, {})
    t.notOk(error)
  }
})

server.listen(0, async () => {
  await fetch(`http://localhost:${server.address().port}`)
  try {
    await fetch('badrequest', { redirect: 'error' })
  } catch (e) {}
  server.close()
  t.equal(startCalled, 2)
  t.equal(endCalled, 2)
  t.equal(asyncStartCalled, 2)
  t.equal(asyncEndCalled, 2)
  t.equal(errorCalled, 1)
})
