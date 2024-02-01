'use strict'

const t = require('tap')
const { pipeline: undiciPipeline } = require('..')
const { pipeline: streamPipelineCb } = require('node:stream')
const { promisify } = require('node:util')
const { createReadable, createWritable } = require('./utils/stream')
const { startRedirectingServer } = require('./utils/redirecting-servers')

const streamPipeline = promisify(streamPipelineCb)

t.test('should not follow redirection by default if not using RedirectAgent', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startRedirectingServer(t)

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline(`http://${serverRoot}/`, {}, ({ statusCode, headers, body }) => {
      t.equal(statusCode, 302)
      t.equal(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.equal(body.length, 0)
})

t.test('should not follow redirects when using RedirectAgent within pipeline', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startRedirectingServer(t)

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline(`http://${serverRoot}/`, { maxRedirections: 1 }, ({ statusCode, headers, body }) => {
      t.equal(statusCode, 302)
      t.equal(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.equal(body.length, 0)
})
