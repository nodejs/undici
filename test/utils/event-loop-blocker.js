'use strict'

function eventLoopBlocker (ms) {
  const nil = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(nil, 0, 0, ms)
}

module.exports = {
  eventLoopBlocker
}
