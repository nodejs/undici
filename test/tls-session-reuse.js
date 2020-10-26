'use strict'

const { readFileSync } = require('fs')
const { join } = require('path')
const https = require('https')
const crypto = require('crypto')
const { test } = require('tap')
const { Client } = require('..')
const { kSocket, kTLSOpts } = require('../lib/core/symbols')

const nodeMajor = Number(process.versions.node.split('.')[0])

const options = {
  key: readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8'),
  cert: readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
}
const ca = readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')

test('TLS should reuse sessions', { skip: nodeMajor < 11 }, t => {
  const clientSessions = {}
  let serverRequests = 0

  t.test('Prepare request', t => {
    t.plan(7)
    const server = https.createServer(options, (req, res) => {
      if (req.url === '/drop-key') {
        server.setTicketKeys(crypto.randomBytes(48))
      }
      serverRequests++
      res.end()
    })

    server.listen(0, function () {
      const client = new Client(`https://localhost:${server.address().port}`, {
        pipelining: 0,
        tls: {
          ca,
          rejectUnauthorized: false,
          maxCachedSessions: 1,
          servername: 'agent1'
        }
      })

      t.teardown(() => {
        client.close()
        server.close()
      })

      const queue = [{
        name: 'first',
        method: 'GET',
        path: '/'
      }, {
        name: 'first-reuse',
        method: 'GET',
        path: '/'
      }, {
        name: 'cipher-change',
        method: 'GET',
        path: '/',
        // Choose different cipher to use different cache entry
        ciphers: 'AES256-SHA'
      }, {
        // Change the ticket key to ensure session is updated in cache
        name: 'before-drop',
        method: 'GET',
        path: '/drop-key'
      }, {
        // Ticket will be updated starting from this
        name: 'after-drop',
        method: 'GET',
        path: '/'
      }, {
        name: 'after-drop-reuse',
        method: 'GET',
        path: '/'
      }]

      function request () {
        const options = queue.shift()
        if (options.ciphers) {
          // Choose different cipher to use different cache entry
          client[kTLSOpts].ciphers = options.ciphers
        } else {
          delete client[kTLSOpts].ciphers
        }
        client.request(options, (err, data) => {
          t.error(err)
          clientSessions[options.name] = client[kSocket].getSession()
          data.body.resume().on('end', () => {
            if (queue.length !== 0) {
              return request()
            }
            t.pass()
          })
        })
      }
      request()
    })
  })

  t.test('Verify cached sessions', t => {
    t.plan(7)
    t.strictEqual(serverRequests, 6)
    t.strictEqual(
      clientSessions.first.toString('hex'),
      clientSessions['first-reuse'].toString('hex')
    )
    t.notStrictEqual(
      clientSessions.first.toString('hex'),
      clientSessions['cipher-change'].toString('hex')
    )
    t.notStrictEqual(
      clientSessions.first.toString('hex'),
      clientSessions['before-drop'].toString('hex')
    )
    t.notStrictEqual(
      clientSessions['cipher-change'].toString('hex'),
      clientSessions['before-drop'].toString('hex')
    )
    t.notStrictEqual(
      clientSessions['before-drop'].toString('hex'),
      clientSessions['after-drop'].toString('hex')
    )
    t.strictEqual(
      clientSessions['after-drop'].toString('hex'),
      clientSessions['after-drop-reuse'].toString('hex')
    )
  })

  t.end()
})
