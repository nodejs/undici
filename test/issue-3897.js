'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { request } = require('..')
const { ProxyConnectionError } = require('../lib/core/errors')
const ProxyAgent = require('../lib/dispatcher/proxy-agent')

// Regression test for https://github.com/nodejs/undici/issues/3897
//
// When the proxy tears down the socket while the CONNECT tunnel is being
// established, the inner client rejects with UND_ERR_SOCKET. client.js#onError
// treats UND_ERR_SOCKET as a recoverable error on an established connection and
// leaves the request queued, so connect() is retried forever - the proxy gets
// hammered with CONNECT attempts and the request never settles. The fix surfaces
// a tunnel-establishment socket failure as a non-recoverable ProxyConnectionError
// so the request fails after a single attempt.
test('a proxy that drops the CONNECT tunnel fails the request instead of looping', { timeout: 5000 }, async (t) => {
  t = tspl(t, { plan: 3 })

  let connectAttempts = 0
  const proxy = createServer()
  proxy.on('connect', (req, socket) => {
    connectAttempts++
    // Tear the tunnel down before it is established, like a proxy that does not
    // implement CONNECT or rejects the upstream.
    socket.destroy()
  })

  proxy.listen(0)
  await once(proxy, 'listening')

  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)

  after(async () => {
    await proxyAgent.close()
    proxy.close()
  })

  await t.rejects(
    request('http://localhost/', { dispatcher: proxyAgent }),
    (err) => {
      t.ok(err instanceof ProxyConnectionError)
      t.strictEqual(connectAttempts, 1)
      return true
    }
  )

  await t.completed
})
