'use strict'

const t = require('tap')
const { pipeline: undiciPipeline, RedirectAgent } = require('..')
const { pipeline: streamPipelineCb } = require('stream')
const { promisify } = require('util')
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
      t.strictEqual(statusCode, 302)
      t.strictEqual(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.strictEqual(body.length, 0)
})

t.test('should not follow redirects when using RedirectAgent within pipeline', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startRedirectingServer(t)

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline(`http://${serverRoot}/`, { agent: new RedirectAgent() }, ({ statusCode, headers, body }) => {
      t.strictEqual(statusCode, 302)
      t.strictEqual(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.strictEqual(body.length, 0)
})
