'use strict'

const assert = require('assert')
const { test } = require('node:test')
const createResponseErrorInterceptor = require('../../lib/interceptor/response-error')

test('should not error if request is not meant to be retried', async (t) => {
  const response = { statusCode: 400 }
  const handler = {
    onError: () => {},
    onData: () => {},
    onComplete: () => {}
  }

  const interceptor = createResponseErrorInterceptor((opts, handler) => handler.onComplete())

  assert.doesNotThrow(() => interceptor({ response, throwOnError: false }, handler))
})
