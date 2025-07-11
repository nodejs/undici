'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Pool } = require('..')
const { createServer } = require('node:http')

test('pool respects keep-alive', async t => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true, keepAlive: true }, (req, res) => {
    // Server always responds with a 20s keep-alive header
    res.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'keep-alive', 'Keep-Alive': 'timeout=20' })
    res.end('foo')
  })
  let connections = 0
  server.on('connection', () => {
    connections++
  })
  after(() => server.close())
  // Can also use `10`
  const expectedConnections = 1
  const keepAliveTimeout = 20 * 1000 // 20 seconds
  server.listen(0, () => {
    // Pool is set to keep connections alive for 20 seconds too
    const pool = new Pool(`http://localhost:${server.address().port}`, { connections: expectedConnections, keepAliveTimeout, keepAliveMaxTimeout: keepAliveTimeout * 2 })
    after(() => pool.close())

    // Can also use `20`
    const batchSize = 2
    let batch1Completed = 0
    for (let i = 0; i < batchSize; i++) {
      pool.request({ path: '/', method: 'GET' }, (err, res) => {
        if (err) {
          t.fail(err)
          return
        }
        res.body.on('end', () => {
          batch1Completed++
          if (batch1Completed === batchSize) {
            // Once the first batch is done, wait half of the keep-alive timeout
            setTimeout(() => {
              // And execute another batch of requests
              let batch2Completed = 0
              for (let j = 0; j < batchSize; j++) {
                pool.request({ path: '/', method: 'GET' }, (err, res) => {
                  if (err) {
                    t.fail(err)
                    return
                  }
                  res.body.on('end', () => {
                    batch2Completed++
                    if (batch2Completed === batchSize) {
                      t.strictEqual(connections, expectedConnections, 'Pool connections should have been reused between batches')
                    }
                  }).resume()
                })
              }
            }, keepAliveTimeout / 2)
          }
        }).resume()
      })
    }
  })

  await t.completed
})
