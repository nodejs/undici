'use strict'

const assert = require('node:assert/strict')
const { constants } = require('node:crypto')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { createServer } = require('node:tls')
const { test } = require('node:test')

const { Client } = require('..')

const fixtures = join(__dirname, 'fixtures', 'tls-renegotiation')
const matching = {
  key: readFileSync(join(fixtures, 'matching-key.pem')),
  cert: readFileSync(join(fixtures, 'matching-cert.pem'))
}
const wrongHost = {
  key: readFileSync(join(fixtures, 'wrong-key.pem')),
  cert: readFileSync(join(fixtures, 'wrong-cert.pem'))
}
const ca = readFileSync(join(fixtures, 'ca.pem'))

// @see https://github.com/nodejs/undici/security/advisories/GHSA-qrxm-fqhp-jwvm
for (const protocol of ['http/1.1', 'h2']) {
  test(`TLS certificate errors after ${protocol} connection establishment reject the request`, async (t) => {
    let startRenegotiation
    const renegotiationStarted = new Promise((resolve) => {
      startRenegotiation = resolve
    })
    const sockets = new Set()
    const server = createServer({
      ...matching,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      secureOptions: constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION,
      ALPNProtocols: [protocol]
    }, (socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      socket.on('error', () => {})
      socket.once('data', () => {
        setTimeout(() => {
          socket.setKeyCert(wrongHost)
          startRenegotiation(socket.renegotiate({
            requestCert: false,
            rejectUnauthorized: false
          }, () => {}))
        }, 50)
      })
    })

    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      allowH2: protocol === 'h2',
      connect: {
        ca,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        lookup (hostname, options, callback) {
          if (options.all === true) {
            callback(null, [{ address: '127.0.0.1', family: 4 }])
          } else {
            callback(null, '127.0.0.1', 4)
          }
        }
      }
    })

    t.after(async () => {
      await client.destroy()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise((resolve) => server.close(resolve))
    })

    const rejected = assert.rejects(
      client.request({ path: '/', method: 'GET' }),
      { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }
    )

    assert.equal(await renegotiationStarted, true)
    await rejected

    // The errored connection must not be reused to serve a later request.
    await assert.rejects(
      client.request({ path: '/', method: 'GET' }),
      { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }
    )
  })
}
