'use strict'

const assert = require('assert')
const { test } = require('node:test')
const createResponseErrorInterceptor = require('../../lib/interceptor/response-error')

test('should not error if request is not meant to throw error', async (t) => {
  const opts = { throwOnError: false }
  const handler = {
    onError: () => {},
    onData: () => {},
    onComplete: () => {}
  }

  const interceptor = createResponseErrorInterceptor((opts, handler) => handler.onComplete())

  assert.doesNotThrow(() => interceptor(opts, handler))
})

test('should error if request status code is in the specified error codes', async (t) => {
  const opts = { throwOnError: true, statusCodes: [500] }
  const response = { statusCode: 500 }
  let capturedError
  const handler = {
    onError: (err) => {
      capturedError = err
    },
    onData: () => {},
    onComplete: () => {}
  }

  const interceptor = createResponseErrorInterceptor((opts, handler) => handler.onComplete())

  // opts ve response parametrelerini interceptor'a doğru şekilde geçin
  interceptor({ ...opts, response }, handler)

  // `setImmediate` kullanarak `capturedError`'ın set edilmesini bekleyin
  await new Promise(resolve => setImmediate(resolve))

  assert(capturedError, 'Expected error to be captured but it was not.')
  assert.strictEqual(capturedError.message, 'Response Error')
  assert.strictEqual(capturedError.statusCode, 500)
})

test('should not error if request status code is not in the specified error codes', async (t) => {
  const opts = { throwOnError: true, statusCodes: [500] }
  const response = { statusCode: 404 }
  const handler = {
    onError: () => {},
    onData: () => {},
    onComplete: () => {}
  }

  const interceptor = createResponseErrorInterceptor((opts, handler) => handler.onComplete())

  assert.doesNotThrow(() => interceptor({ ...opts, response }, handler))
})
