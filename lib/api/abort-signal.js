const { addAbortListener } = require('../core/util')
const { RequestAbortedError } = require('../core/errors')

const kSignal = Symbol('kSignal')
const kListenerList = Symbol('kListenersList')
const kHandler = Symbol('kHandler')

function abort (self) {
  if (self.abort) {
    self.abort(self[kSignal]?.reason)
  } else {
    self.reason = self[kSignal]?.reason ?? new RequestAbortedError()
  }
  removeSignal(self)
}

function clearListeners (signal) {
  const listenerList = signal[kListenerList]
  if (!listenerList) {
    return
  }
  if ('removeEventListener' in signal) {
    signal.removeEventListener('abort', signal[kHandler])
  } else {
    signal.removeListener('abort', signal[kHandler])
  }
  if (listenerList.size !== 0) {
    listenerList.clear()
  }
  signal[kListenerList] = null
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

  if (!signal[kListenerList]) {
    signal[kListenerList] = new Set()
    signal[kHandler] = () => {
      for (const listener of signal[kListenerList]) {
        abort(listener)
      }
      clearListeners(signal)
    }
    addAbortListener(signal, signal[kHandler])
  }

  signal[kListenerList].add(self)
}

function removeSignal (self) {
  const signal = self[kSignal]

  if (!signal) {
    return
  }

  signal[kListenerList].delete(self)

  if (signal[kListenerList].size === 0) {
    clearListeners(signal)
  }

  self[kSignal] = null
}

module.exports = {
  addSignal,
  removeSignal
}
