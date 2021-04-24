'use strict'

class UndiciError extends Error {
  constructor (message) {
    super(message)
    this.name = 'UndiciError'
    this.code = 'UND_ERR'
  }
}

class ConnectTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, ConnectTimeoutError)
    this.name = 'ConnectTimeoutError'
    this.message = message || 'Connect Timeout Error'
    this.code = 'UND_ERR_CONNECT_TIMEOUT'
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

class HeadersOverflowError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, HeadersOverflowError)
    this.name = 'HeadersOverflowError'
    this.message = message || 'Headers Overflow Error'
    this.code = 'UND_ERR_HEADERS_OVERFLOW'
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
    this.message = message || 'Invalid Argument Error'
    this.code = 'UND_ERR_INVALID_ARG'
  }
}

class InvalidReturnValueError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, InvalidReturnValueError)
    this.name = 'InvalidReturnValueError'
    this.message = message || 'Invalid Return Value Error'
    this.code = 'UND_ERR_INVALID_RETURN_VALUE'
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

class InformationalError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, InformationalError)
    this.name = 'InformationalError'
    this.message = message || 'Request information'
    this.code = 'UND_ERR_INFO'
  }
}

class RequestContentLengthError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, RequestContentLengthError)
    this.name = 'RequestContentLengthError'
    this.message = message || 'Request body length does not match content-length header'
    this.code = 'UND_ERR_REQUEST_CONTENT_LENGTH_MISMATCH'
  }
}

class ResponseContentLengthError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, ResponseContentLengthError)
    this.name = 'ResponseContentLengthError'
    this.message = message || 'Response body length does not match content-length header'
    this.code = 'UND_ERR_RESPONSE_CONTENT_LENGTH_MISMATCH'
  }
}

class TrailerMismatchError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, TrailerMismatchError)
    this.name = 'TrailerMismatchError'
    this.message = message || 'Trailers does not match trailer header'
    this.code = 'UND_ERR_TRAILER_MISMATCH'
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

class NotSupportedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, NotSupportedError)
    this.name = 'NotSupportedError'
    this.message = message || 'Not supported error'
    this.code = 'UND_ERR_NOT_SUPPORTED'
  }
}

module.exports = {
  UndiciError,
  HeadersTimeoutError,
  HeadersOverflowError,
  BodyTimeoutError,
  RequestContentLengthError,
  ResponseContentLengthError,
  ConnectTimeoutError,
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
