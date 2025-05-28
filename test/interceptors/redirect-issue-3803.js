'use strict'

const { FormData, request, Agent, interceptors } = require('../..')
const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')

test('redirecting works with a FormData body', async (t) => {
  const plan = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    if (req.url === '/1') {
      res.writeHead(302, undefined, { location: '/2' })
      res.end()
    } else {
      res.end('OK')
    }
  }).listen(0)

  t.after(() => server.close())
  await once(server, 'listening')

  const agent = new Agent().compose(interceptors.redirect({ maxRedirections: 1 }))

  const body = new FormData()
  body.append('hello', 'world')

  const { context } = await request(`http://localhost:${server.address().port}/1`, {
    body,
    method: 'POST',
    dispatcher: agent,
    maxRedirections: 1
  })

  plan.deepStrictEqual(context.history, [
    new URL(`http://localhost:${server.address().port}/1`),
    new URL(`http://localhost:${server.address().port}/2`)
  ])
})
