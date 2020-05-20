'use strict'

class UndiciError extends Error {
  constructor (message) {
    super(message)
    this.name = 'UndiciError'
    this.code = 'UND_ERR'
  }
}

class TimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, TimeoutError)
    this.name = 'TimeoutError'
    this.message = message || /* istanbul ignore next */ 'Timeout Error'
    this.code = 'UND_ERR_TIMEOUT'
  }
}

class InvalidArgumentError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, InvalidArgumentError)
    this.name = 'InvalidArgumentError'
    this.message = message || /* istanbul ignore next */ 'Invalid Argument Error'
    this.code = 'UND_ERR_INVALID_ARG'
  }
}

class InvalidReturnValueError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, InvalidReturnValueError)
    this.name = 'InvalidReturnValueError'
    this.message = message || /* istanbul ignore next */ 'Invalid Return Value Error'
    this.code = 'UND_ERR_INVALID_RETURN_VALUE'
  }
}

class RequestAbortedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, RequestAbortedError)
    this.name = 'RequestAbortedError'
    this.message = message || /* istanbul ignore next */ 'Request aborted'
    this.code = 'UND_ERR_ABORTED'
  }
}

class ClientDestroyedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, ClientDestroyedError)
    this.name = 'ClientDestroyedError'
    this.message = message || /* istanbul ignore next */ 'The client is destroyed'
    this.code = 'UND_ERR_DESTROYED'
  }
}

class ClientClosedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, ClientClosedError)
    this.name = 'ClientClosedError'
    this.message = message || /* istanbul ignore next */ 'The client is closed'
    this.code = 'UND_ERR_CLOSED'
  }
}

class SocketError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, SocketError)
    this.name = 'SocketError'
    this.message = message || /* istanbul ignore next */ 'Socket error'
    this.code = 'UND_ERR_SOCKET'
  }
}

module.exports = {
  UndiciError,
  TimeoutError,
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError,
  ClientDestroyedError,
  ClientClosedError,
  SocketError
}
