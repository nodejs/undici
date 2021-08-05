let ReadableStream
let CountQueuingStrategy

const { destroy, isDestroyed } = require('../../../lib/core/util')

const { finished } = require('stream')
const { AbortError } = require('../../../lib/core/errors')

module.exports = function toWeb (streamReadable) {
  if (!ReadableStream) {
    ReadableStream = require('stream/web').ReadableStream
  }
  if (!CountQueuingStrategy) {
    CountQueuingStrategy = require('stream/web').CountQueuingStrategy
  }

  if (isDestroyed(streamReadable)) {
    const readable = new ReadableStream()
    readable.cancel()
    return readable
  }

  const objectMode = streamReadable.readableObjectMode
  const highWaterMark = streamReadable.readableHighWaterMark
  const strategy = objectMode
    ? new CountQueuingStrategy({ highWaterMark })
    : { highWaterMark }

  let controller

  function onData (chunk) {
    // Copy the Buffer to detach it from the pool.
    if (Buffer.isBuffer(chunk) && !objectMode) {
      chunk = new Uint8Array(chunk)
    }
    controller.enqueue(chunk)
    if (controller.desiredSize <= 0) {
      streamReadable.pause()
    }
  }

  streamReadable.pause()

  finished(streamReadable, (err) => {
    if (err && err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      const er = new AbortError()
      er.cause = er
      err = er
    }

    if (err) {
      controller.error(err)
    } else {
      controller.close()
    }
  })

  streamReadable.on('data', onData)

  return new ReadableStream({
    start (c) {
      controller = c
    },

    pull () {
      streamReadable.resume()
    },

    cancel (reason) {
      destroy(streamReadable, reason)
    }
  }, strategy)
}
