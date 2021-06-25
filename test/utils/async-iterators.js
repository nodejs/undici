'use strict'

async function * wrapWithAsyncIterable (asyncIterable, indefinite = false) {
  for await (const chunk of asyncIterable) {
    yield chunk
  }
  if (indefinite) {
    await new Promise(() => {})
  }
}

const STREAM = 'stream'
const ASYNC_ITERATOR = 'async-iterator'
function maybeWrapStream (stream, type) {
  if (type === STREAM) {
    return stream
  }
  if (type === ASYNC_ITERATOR) {
    return wrapWithAsyncIterable(stream)
  }

  throw new Error(`bad input ${type} should be ${STREAM} or ${ASYNC_ITERATOR}`)
}

module.exports = { wrapWithAsyncIterable, maybeWrapStream, consts: { STREAM, ASYNC_ITERATOR } }
