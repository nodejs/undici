'use strict'

async function * wrapWithAsyncIterable (asyncIterable, indefinite = false) {
  for await (const chunk of asyncIterable) {
    yield chunk
  }
  if (indefinite) {
    await new Promise(() => {})
  }
}

module.exports = { wrapWithAsyncIterable }
