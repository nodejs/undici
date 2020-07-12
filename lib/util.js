'use strict'

function isStream (body) {
  return body && typeof body.on === 'function'
}

function bodyLength (body, doRead) {
  if (body && typeof body.on === 'function') {
    if (doRead && typeof body.read === 'function') {
      body.read(0)
    }
    const state = body._readableState
    return state && state.ended ? state.length : undefined
  }

  return body ? body.byteLength : 0
}

function destroy (stream, err) {
  if (stream && typeof stream.destroy === 'function' && !stream.destroyed) {
    stream.destroy(err)
  }
  return stream
}

module.exports = {
  isStream,
  destroy,
  bodyLength
}
