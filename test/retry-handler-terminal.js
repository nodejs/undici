'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { RetryHandler } = require('..')

function noop () {}

for (const statusCode of [300, 404, 416]) {
  test(`RetryHandler settles an exposed response on terminal status ${statusCode}`, () => {
    const errors = []
    let aborts = 0
    const handler = new RetryHandler({ method: 'GET', path: '/' }, {
      dispatch () {
        assert.fail('a terminal status must not dispatch another attempt')
      },
      handler: {
        onConnect: noop,
        onHeaders () {
          assert.fail('an exposed response must not be replaced')
        },
        onError (err) {
          errors.push(err)
        }
      }
    })

    // Model an attempt whose response is already owned by the caller.
    handler.headersSent = true
    handler.resume = noop
    handler.start = 1
    handler.end = 3
    handler.onConnect(err => {
      aborts++
      handler.onError(err)
    })

    const rawHeaders = ['content-length', '0']
    assert.equal(handler.onHeaders(statusCode, rawHeaders, noop, 'Terminal'), false)
    assert.equal(aborts, 1)
    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'UND_ERR_REQ_RETRY')
    assert.equal(errors[0].statusCode, statusCode)
    assert.deepEqual(errors[0].headers, { 'content-length': '0' })
    assert.equal(handler.start, 1)
    assert.equal(handler.end, 3)
  })

  test(`RetryHandler preserves an initial non-retryable response with status ${statusCode}`, () => {
    const rawHeaders = ['content-length', '0']
    let responses = 0
    let completions = 0
    const resume = noop
    const handler = new RetryHandler({ method: 'GET', path: '/' }, {
      dispatch () {
        assert.fail('an initial non-retryable response must not be retried')
      },
      handler: {
        onConnect: noop,
        onHeaders (status, headers, receivedResume, statusMessage) {
          responses++
          assert.equal(status, statusCode)
          assert.equal(headers, rawHeaders)
          assert.equal(receivedResume, resume)
          assert.equal(statusMessage, 'Terminal')
          return true
        },
        onComplete () {
          completions++
        },
        onError (err) {
          assert.fail(err)
        }
      }
    })
    handler.onConnect(() => assert.fail('the initial response must not be aborted'))

    assert.equal(handler.onHeaders(statusCode, rawHeaders, resume, 'Terminal'), true)
    handler.onComplete([])
    assert.equal(responses, 1)
    assert.equal(completions, 1)
    assert.equal(handler.headersSent, true)
    assert.equal(handler.end, -1)
  })
}
