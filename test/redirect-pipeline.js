'use strict'

const { test } = require('node:test')
const { pipeline: undiciPipeline, Client, interceptors } = require('..')
const { pipeline: streamPipelineCb } = require('node:stream')
const { promisify } = require('node:util')
const { createReadable, createWritable } = require('./utils/stream')
const { startRedirectingServer } = require('./utils/redirecting-servers')

const streamPipeline = promisify(streamPipelineCb)
const redirect = interceptors.redirect

test('should not follow redirection by default if not using RedirectAgent', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startRedirectingServer()

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline(`http://${serverRoot}/`, {
      dispatcher: new Client(`http://${serverRoot}/`).compose(redirect({ maxRedirections: null }))
    }, ({ statusCode, headers, body }) => {
      t.assert.strictEqual(statusCode, 302)
      t.assert.strictEqual(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.assert.strictEqual(body.length, 0)
})

test('should not follow redirects when using RedirectAgent within pipeline', async t => {
  t.plan(3)

  const body = []
  const serverRoot = await startRedirectingServer()

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline(`http://${serverRoot}/`, { dispatcher: new Client(`http://${serverRoot}/`).compose(redirect({ maxRedirections: 1 })) }, ({ statusCode, headers, body }) => {
      t.assert.strictEqual(statusCode, 302)
      t.assert.strictEqual(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.assert.strictEqual(body.length, 0)
})
