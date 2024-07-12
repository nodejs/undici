'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { pipeline: undiciPipeline, Client, interceptors } = require('..')
const { pipeline: streamPipelineCb } = require('node:stream')
const { promisify } = require('node:util')
const { createReadable, createWritable } = require('./utils/stream')
const { startRedirectingServer } = require('./utils/redirecting-servers')

const streamPipeline = promisify(streamPipelineCb)
const redirect = interceptors.redirect

test('should not follow redirection by default if not using RedirectAgent', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const serverRoot = await startRedirectingServer()

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline(`http://${serverRoot}/`, {
      dispatcher: new Client(`http://${serverRoot}/`).compose(redirect({ maxRedirections: null }))
    }, ({ statusCode, headers, body }) => {
      t.strictEqual(statusCode, 302)
      t.strictEqual(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.strictEqual(body.length, 0)
})

test('should not follow redirects when using RedirectAgent within pipeline', async t => {
  t = tspl(t, { plan: 3 })

  const body = []
  const serverRoot = await startRedirectingServer()

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline(`http://${serverRoot}/`, { dispatcher: new Client(`http://${serverRoot}/`).compose(redirect({ maxRedirections: 1 })) }, ({ statusCode, headers, body }) => {
      t.strictEqual(statusCode, 302)
      t.strictEqual(headers.location, `http://${serverRoot}/302/1`)

      return body
    }),
    createWritable(body)
  )

  t.strictEqual(body.length, 0)
})
