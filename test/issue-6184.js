'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Agent, interceptors } = require('..')

// https://github.com/nodejs/undici/issues/6184

async function listen (ctx, handler) {
  const server = createServer(handler)
  ctx.after(() => server.close())
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `127.0.0.1:${server.address().port}`
}

function redirectAgent (ctx) {
  const agent = new Agent().compose(interceptors.redirect({ maxRedirections: 3 }))
  ctx.after(() => agent.close())
  return agent
}

for (const [location, expected] of [
  ['/login', '/login'],
  ['next', '//users/next'],
  ['?page=2', '//users/start?page=2'],
  ['../up', '//up']
]) {
  test(`a relative Location of ${location} after a path starting with // stays on the origin`, async (ctx) => {
    const t = tspl(ctx, { plan: 2 })
    const seen = []
    const host = await listen(ctx, (req, res) => {
      seen.push(req.url)
      if (req.url === '//users/start') {
        res.writeHead(302, { location })
        return res.end()
      }
      res.end('done')
    })

    const { statusCode, body } = await redirectAgent(ctx).request({
      origin: `http://${host}`,
      path: '//users/start',
      method: 'GET'
    })
    await body.dump()

    t.strictEqual(statusCode, 200)
    t.deepStrictEqual(seen, ['//users/start', expected])
  })
}

test('a relative Location after a path starting with a slash and a backslash stays on the origin', async (ctx) => {
  const t = tspl(ctx, { plan: 2 })
  const seen = []
  const host = await listen(ctx, (req, res) => {
    seen.push(req.url)
    if (req.url === '/\\users/start') {
      res.writeHead(302, { location: '/login' })
      return res.end()
    }
    res.end('done')
  })

  const { statusCode, body } = await redirectAgent(ctx).request({
    origin: `http://${host}`,
    path: '/\\users/start',
    method: 'GET'
  })
  await body.dump()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(seen, ['/\\users/start', '/login'])
})

test('a Location naming another host with two slashes still goes to that host', async (ctx) => {
  const t = tspl(ctx, { plan: 2 })
  const other = await listen(ctx, (req, res) => res.end('other'))
  const host = await listen(ctx, (req, res) => {
    res.writeHead(302, { location: `//${other}/final` })
    res.end()
  })

  const { statusCode, body } = await redirectAgent(ctx).request({
    origin: `http://${host}`,
    path: '//users/start',
    method: 'GET'
  })

  t.strictEqual(statusCode, 200)
  t.strictEqual(await body.text(), 'other')
})

test('a path starting with // is not recorded as a visit to the host it looks like', async (ctx) => {
  const t = tspl(ctx, { plan: 2 })
  const other = await listen(ctx, (req, res) => res.end('other'))
  const host = await listen(ctx, (req, res) => {
    res.writeHead(302, { location: `http://${other}/final` })
    res.end()
  })

  const { statusCode, body } = await redirectAgent(ctx).request({
    origin: `http://${host}`,
    path: `//${other}/final`,
    method: 'GET'
  })

  t.strictEqual(statusCode, 200)
  t.strictEqual(await body.text(), 'other')
})
