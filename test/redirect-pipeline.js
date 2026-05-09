'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { pipeline: undiciPipeline, Client, Dispatcher, interceptors } = require('..')
const { pipeline: streamPipelineCb } = require('node:stream')
const { promisify } = require('node:util')
const { createReadable, createWritable } = require('./utils/stream')
const { startRedirectingServer } = require('./utils/redirecting-servers')

const streamPipeline = promisify(streamPipelineCb)
const redirect = interceptors.redirect

class RedirectingDispatcher extends Dispatcher {
  dispatch (opts, handler) {
    const redirectCount = Number(new URL(opts.path, opts.origin).pathname.split('/').pop()) + 1
    const controller = {
      resume () {},
      pause () {},
      abort () {}
    }

    handler.onRequestStart?.(controller, opts)
    handler.onResponseStart?.(controller, 302, {
      location: `http://localhost/302/${redirectCount}`
    }, '')
    handler.onResponseEnd?.(controller, null)

    return true
  }

  close (callback) {
    callback?.()
  }

  destroy (_err, callback) {
    callback?.()
  }
}

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
  await t.completed
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
  await t.completed
})

test('should not replay pipeline request bodies before they are consumed', async t => {
  t = tspl(t, { plan: 3 })

  const body = []

  await streamPipeline(
    createReadable('REQUEST'),
    undiciPipeline('http://localhost/302/1', {
      dispatcher: new RedirectingDispatcher().compose(redirect({ maxRedirections: 1 }))
    }, ({ statusCode, headers, body }) => {
      t.strictEqual(statusCode, 302)
      t.strictEqual(headers.location, 'http://localhost/302/2')

      return body
    }),
    createWritable(body)
  )

  t.strictEqual(body.length, 0)
  await t.completed
})
