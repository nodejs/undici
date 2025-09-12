'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, describe } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')

const FakeTimers = require('@sinonjs/fake-timers')

const { RetryAgent, Client } = require('..')

describe('RetryAgent', () => {
  const timer = setTimeout(() => {
    clock?.tick(100)
    timer.refresh()
  }, 0).unref()

  const clock = FakeTimers.install()
  after(() => clock.uninstall())

  test('Should retry status code', async t => {
    t = tspl(t, { plan: 2 })

    let counter = 0
    const server = createServer({ joinDuplicateHeaders: true })
    const opts = {
      maxRetries: 5,
      timeout: 1,
      timeoutFactor: 1
    }

    server.on('request', (req, res) => {
      switch (counter++) {
        case 0:
          req.destroy()
          return
        case 1:
          res.writeHead(500)
          res.end('failed')
          return
        case 2:
          res.writeHead(200)
          res.end('hello world!')
          return
        default:
          t.fail()
      }
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const agent = new RetryAgent(client, opts)

      after(async () => {
        await agent.close()
        server.close()

        await once(server, 'close')
      })

      agent.request({
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      }).then((res) => {
        t.equal(res.statusCode, 200)
        res.body.setEncoding('utf8')
        let chunks = ''
        res.body.on('data', chunk => { chunks += chunk })
        res.body.on('end', () => {
          t.equal(chunks, 'hello world!')
        })
      })
    })

    await t.completed
  })
})
