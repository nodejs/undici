'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { request } = require('..')
const {
  startRedirectingWithRelativePath
} = require('./utils/redirecting-servers')

test('should redirect to relative URL according to RFC 7231', async t => {
  t = tspl(t, { plan: 2 })

  const server = await startRedirectingWithRelativePath()

  const { statusCode, body } = await request(`http://${server}`, {
    maxRedirections: 3
  })

  const finalPath = await body.text()

  t.strictEqual(statusCode, 200)
  t.strictEqual(finalPath, '/absolute/b')
})
