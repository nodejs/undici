'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Pool, Client } = require('..')
const { createServer } = require('node:http')

// Client passes okay
test('client respects keep-alive', async (t) => {
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
  const expectedConnections = 1
  const keepAliveTimeout = 20 * 1000 // 20 seconds
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { keepAliveTimeout, keepAliveMaxTimeout: keepAliveTimeout * 2 })
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, res) => {
      if (err) {
        t.fail(err)
        return
      }
      res.body.on('end', () => {
        client.request({ path: '/', method: 'GET' }, (err, res) => {
          if (err) {
            t.fail(err)
            return
          }
          setTimeout(() => {
            res.body.on('end', () => {
              t.strictEqual(connections, expectedConnections, 'Client connections should have been reused')
            }).resume()
          }, keepAliveTimeout / 2)
        })
      }).resume()
    })
  })
  await t.completed
})

test.only('Pool respects keep-alive', async t => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true, keepAlive: true }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'keep-alive', 'Keep-Alive': 'timeout=2' })
    res.end('foo')
  })
  let connections = 0
  server.on('connection', () => {
    connections++
  })
  after(() => server.close())
  const expectedConnections = 1
  const keepAliveTimeout = 2 * 1000 // 2 seconds
  server.listen(0, () => {
    const pool = new Pool(`http://localhost:${server.address().port}`, { connections: expectedConnections, keepAliveTimeout, keepAliveMaxTimeout: keepAliveTimeout * 2 })
    pool.on('connectionError', (err) => {
      console.error('Connection error')
      console.error(err)
    })
    after(() => pool.close())
    pool.request({ path: '/', method: 'GET' }, (err, res) => {
      if (err) {
        t.fail(err)
        return
      }
      res.body.on('end', () => {
        setTimeout(() => {
          pool.request({ path: '/', method: 'GET' }, (err, res) => {
            if (err) {
              t.fail(err)
              return
            }
            res.body.on('end', () => {
              t.strictEqual(connections, expectedConnections, 'Pool connections should have been reused between batches')
            }).resume()
          })
        }, keepAliveTimeout / 2)
      }).resume()
    })
  })
  await t.completed
})

// Pool fails
test('pool respects keep-alive batched requests', async t => {
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
    pool.on('connectionError', (err) => {
      console.error('Connection error')
      console.error(err)
    })
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
