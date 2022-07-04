'use strict'

const t = require('tap')
const { request } = require('..')
const {
  startRedirectingWithRelativePath
} = require('./utils/redirecting-servers')

t.test('should redirect to relative URL according to RFC 7231', async t => {
  t.plan(2)

  const server = await startRedirectingWithRelativePath(t)

  const { statusCode, body } = await request(`http://${server}`, {
    maxRedirections: 3
  })

  const finalPath = await body.text()

  t.equal(statusCode, 200)
  t.equal(finalPath, '/absolute/b')
})
