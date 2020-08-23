'use strict'

const {
  InvalidArgumentError,
  RequestTimeoutError
} = require('./core/errors')

const kAbort = Symbol('abort')
const kAborted = Symbol('aborted')
const kListener = Symbol('listener')
const kTimeout = Symbol('timeout')
const kSignal = Symbol('signal')
const kRequestTimeout = Symbol('request timeout')
const { AsyncResource } = require('async_hooks')

class BaseHandler extends AsyncResource {
  constructor (name, opts) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, requestTimeout } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    super(name)

    this[kRequestTimeout] = requestTimeout != null ? requestTimeout : 30e3
    this[kTimeout] = null
    this[kSignal] = null
    this[kAbort] = null
    this[kAborted] = false
    this[kListener] = null

    if (signal) {
      this[kSignal] = signal
      this[kListener] = () => {
        if (this[kAbort]) {
          this[kAbort]()
        } else {
          this[kAborted] = true
        }
      }
      if ('addEventListener' in signal) {
        signal.addEventListener('abort', this[kListener])
      } else {
        signal.addListener('abort', this[kListener])
      }
    }
  }

  onConnect (abort) {
    if (this[kSignal]) {
      if (this[kAborted]) {
        abort()
      } else {
        this[kAbort] = abort
      }
    }

    if (this[kRequestTimeout]) {
      if (this[kTimeout]) {
        clearTimeout(this[kTimeout])
      }

      this[kTimeout] = setTimeout((abort) => {
        abort(new RequestTimeoutError())
      }, this[kRequestTimeout], abort)
    }
  }

  onHeaders () {
    if (this[kTimeout]) {
      clearTimeout(this[kTimeout])
      this[kTimeout] = null
    }
  }

  onUpgrade () {
    destroy(this)
  }

  onComplete () {
    destroy(this)
  }

  onError () {
    destroy(this)
  }
}

function destroy (self) {
  if (self[kTimeout]) {
    clearTimeout(self[kTimeout])
    self[kTimeout] = null
  }

  if (self[kSignal]) {
    if ('removeEventListener' in self[kSignal]) {
      self[kSignal].removeEventListener('abort', self[kListener])
    } else {
      self[kSignal].removeListener('abort', self[kListener])
    }
    self[kSignal] = null
  }
}

module.exports = BaseHandler
