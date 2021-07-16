'use strict'

const { readFileSync } = require('fs')
const { join } = require('path')
const https = require('https')
const crypto = require('crypto')
const { test } = require('tap')
const { Client, Pool } = require('..')
const { kSocket } = require('../lib/core/symbols')

const nodeMajor = Number(process.versions.node.split('.')[0])

const options = {
  key: readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8'),
  cert: readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
}
const ca = readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')

test('A client should disable session caching', {
  skip: nodeMajor < 11 // tls socket session event has been added in Node 11. Cf. https://nodejs.org/api/tls.html#tls_event_session
}, t => {
  const clientSessions = {}
  let serverRequests = 0

  t.test('Prepare request', t => {
    t.plan(3)
    const server = https.createServer(options, (req, res) => {
      if (req.url === '/drop-key') {
        server.setTicketKeys(crypto.randomBytes(48))
      }
      serverRequests++
      res.end()
    })

    server.listen(0, function () {
      const tls = {
        ca,
        rejectUnauthorized: false,
        servername: 'agent1'
      }
      const client = new Client(`https://localhost:${server.address().port}`, {
        pipelining: 0,
        tls,
        maxCachedSessions: 0
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
        name: 'second',
        method: 'GET',
        path: '/'
      }]

      function request () {
        const options = queue.shift()
        if (options.ciphers) {
          // Choose different cipher to use different cache entry
          tls.ciphers = options.ciphers
        } else {
          delete tls.ciphers
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
    t.plan(2)
    t.equal(serverRequests, 2)
    t.not(
      clientSessions.first.toString('hex'),
      clientSessions.second.toString('hex')
    )
  })

  t.end()
})

test('A pool should be able to reuse TLS sessions between clients', {
  skip: nodeMajor < 11 // tls socket session event has been added in Node 11. Cf. https://nodejs.org/api/tls.html#tls_event_session
}, t => {
  let serverRequests = 0

  const REQ_COUNT = 10
  const ASSERT_PERFORMANCE_GAIN = false

  t.test('Prepare request', t => {
    t.plan(2 + 1 + (ASSERT_PERFORMANCE_GAIN ? 1 : 0))
    const server = https.createServer(options, (req, res) => {
      serverRequests++
      res.end()
    })

    let numSessions = 0
    const sessions = []

    server.listen(0, async () => {
      const poolWithSessionReuse = new Pool(`https://localhost:${server.address().port}`, {
        pipelining: 0,
        connections: 100,
        maxCachedSessions: 1,
        tls: {
          ca,
          rejectUnauthorized: false,
          servername: 'agent1'
        }
      })
      const poolWithoutSessionReuse = new Pool(`https://localhost:${server.address().port}`, {
        pipelining: 0,
        connections: 100,
        maxCachedSessions: 0,
        tls: {
          ca,
          rejectUnauthorized: false,
          servername: 'agent1'
        }
      })

      poolWithSessionReuse.on('connect', (url, targets) => {
        const y = targets[1][kSocket].getSession()
        if (sessions.some(x => x.equals(y))) {
          return
        }
        sessions.push(y)
        numSessions++
      })

      t.teardown(() => {
        poolWithSessionReuse.close()
        poolWithoutSessionReuse.close()
        server.close()
      })

      function request (pool, expectTLSSessionCache) {
        return new Promise((resolve, reject) => {
          pool.request({
            method: 'GET',
            path: '/'
          }, (err, data) => {
            if (err) return reject(err)
            data.body.resume().on('end', resolve)
          })
        })
      }

      async function runRequests (pool, numIterations, expectTLSSessionCache) {
        const requests = []
        // For the session reuse, we first need one client to connect to receive a valid tls session to reuse
        await request(pool, false)
        while (numIterations--) {
          requests.push(request(pool, expectTLSSessionCache))
        }
        return await Promise.all(requests)
      }

      await runRequests(poolWithoutSessionReuse, REQ_COUNT, false)
      await runRequests(poolWithSessionReuse, REQ_COUNT, true)

      t.equal(numSessions, 2)
      t.equal(serverRequests, 2 + REQ_COUNT * 2)
      t.pass()
    })
  })

  t.end()
})
