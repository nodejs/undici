const { addAbortListener } = require('../core/util')
const { RequestAbortedError } = require('../core/errors')
const { sign } = require('crypto')

const kListenersList = Symbol('kListenersList')
const kSignal = Symbol('kSignal')
const kHandle = Symbol('kHandle')

function abort (self) {
  if (self.abort) {
    self.abort(self[kSignal]?.reason)
  } else {
    self.reason = self[kSignal]?.reason ?? new RequestAbortedError()
  }
  removeSignal(self)
}

function clearListeners (signal) {
  if (!signal[kListenersList]) {
    return
  }
  if ('removeEventListener' in signal) {
    signal.removeEventListener('abort', signal[kHandle])
  } else {
    signal.removeListener('abort', signal[kHandle])
  }
  if (signal[kListenersList].size !== 0) {
    signal[kListenersList].clear()
  }
  signal[kListenersList] = null
}

function addSignal (self, signal) {
  self.reason = null

  self[kSignal] = null

  if (!signal) {
    return
  }

  if (signal.aborted) {
    abort(self)
    return
  }

  self[kSignal] = signal

  if (!signal[kListenersList]) {
    signal[kListenersList] = new Set()
    signal[kHandle] = () => {
      for (const listener of signal[kListenersList]) {
        abort(listener)
      }
      clearListeners(signal)
    }
    addAbortListener(signal, signal[kHandle])
  }

  signal[kListenersList].add(self)
}

function removeSignal (self) {
  if (!self[kSignal]) {
    return
  }

  self[kSignal][kListenersList].delete(self)

  if (self[kSignal][kListenersList].size === 0) {
    clearListeners(self[kSignal])
  }

  self[kSignal] = null
}

module.exports = {
  addSignal,
  removeSignal
}
