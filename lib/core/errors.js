'use strict'

class UndiciError extends Error {
  constructor (message) {
    super(message)
    this.name = 'UndiciError'
    this.code = 'UND_ERR'
  }
}

class HeadersTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, HeadersTimeoutError)
    this.name = 'HeadersTimeoutError'
    this.message = message || 'Headers Timeout Error'
    this.code = 'UND_ERR_HEADERS_TIMEOUT'
  }
}

class BodyTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, BodyTimeoutError)
    this.name = 'BodyTimeoutError'
    this.message = message || 'Body Timeout Error'
    this.code = 'UND_ERR_BODY_TIMEOUT'
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

class InformationalError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, InformationalError)
    this.name = 'InformationalError'
    this.message = message || /* istanbul ignore next */ 'Request information'
    this.code = 'UND_ERR_INFO'
  }
}

class ContentLengthMismatchError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, ContentLengthMismatchError)
    this.name = 'ContentLengthMismatchError'
    this.message = message || /* istanbul ignore next */ 'Request body length does not match content-length header'
    this.code = 'UND_ERR_CONTENT_LENGTH_MISMATCH'
  }
}

class TrailerMismatchError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, TrailerMismatchError)
    this.name = 'TrailerMismatchError'
    this.message = message || /* istanbul ignore next */ 'Trailers does not match trailer header'
    this.code = 'UND_ERR_TRAILER_MISMATCH'
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

class NotSupportedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, NotSupportedError)
    this.name = 'NotSupportedError'
    this.message = message || /* istanbul ignore next */ 'Not supported error'
    this.code = 'UND_ERR_NOT_SUPPORTED'
  }
}

module.exports = {
  UndiciError,
  HeadersTimeoutError,
  BodyTimeoutError,
  ContentLengthMismatchError,
  TrailerMismatchError,
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError,
  ClientDestroyedError,
  ClientClosedError,
  InformationalError,
  SocketError,
  NotSupportedError
}
