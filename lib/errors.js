'use strict'

class UndiciError extends Error {
  constructor (message) {
    super(message)
    this.name = 'UndiciError'
    this.code = 'UND_ERR'
  }
}

class SocketTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, SocketTimeoutError)
    this.name = 'SocketTimeoutError'
    this.message = message || 'Socket Timeout Error'
    this.code = 'UND_ERR_SOCKET_TIMEOUT'
  }
}

class RequestTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, RequestTimeoutError)
    this.name = 'RequestTimeoutError'
    this.message = message || 'Request Timeout Error'
    this.code = 'UND_ERR_REQUEST_TIMEOUT'
  }
}

class InvalidArgumentError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, InvalidArgumentError)
    this.name = 'InvalidArgumentError'
    this.message = message || 'Invalid Argument Error'
    this.code = 'UND_ERR_INVALID_ARG'
  }
}

class RequestAbortedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, RequestAbortedError)
    this.name = 'RequestAbortedError'
    this.message = message || 'Request aborted'
    this.code = 'UND_ERR_ABORTED'
  }
}

class ClientDestroyedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, ClientDestroyedError)
    this.name = 'ClientDestroyedError'
    this.message = message || 'The client is destroyed'
    this.code = 'UND_ERR_DESTROYED'
  }
}

class ClientClosedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, ClientClosedError)
    this.name = 'ClientClosedError'
    this.message = message || 'The client is closed'
    this.code = 'UND_ERR_CLOSED'
  }
}

class SocketError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, SocketError)
    this.name = 'SocketError'
    this.message = message || 'Socket error'
    this.code = 'UND_ERR_SOCKET'
  }
}

module.exports = {
  UndiciError,
  SocketTimeoutError,
  RequestTimeoutError,
  InvalidArgumentError,
  RequestAbortedError,
  ClientDestroyedError,
  ClientClosedError,
  SocketError
}
