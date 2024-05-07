'use strict'

const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { request } = require('..')

test('pre abort signal w/ reason', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const ac = new AbortController()
    const _err = new Error()
    ac.abort(_err)
    try {
      await request(`http://0.0.0.0:${server.address().port}`, { signal: ac.signal })
    } catch (err) {
      t.equal(err, _err)
    }
  })
  await t.completed
})

test('post abort signal', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const ac = new AbortController()
    const ures = await request(`http://0.0.0.0:${server.address().port}`, { signal: ac.signal })
    ac.abort()
    try {
      /* eslint-disable-next-line no-unused-vars */
      for await (const chunk of ures.body) {
        // Do nothing...
      }
    } catch (err) {
      t.equal(err.name, 'AbortError')
    }
  })
  await t.completed
})

test('post abort signal w/ reason', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const ac = new AbortController()
    const _err = new Error()
    const ures = await request(`http://0.0.0.0:${server.address().port}`, { signal: ac.signal })
    ac.abort(_err)
    try {
      /* eslint-disable-next-line no-unused-vars */
      for await (const chunk of ures.body) {
        // Do nothing...
      }
    } catch (err) {
      t.equal(err, _err)
    }
  })
  await t.completed
})
