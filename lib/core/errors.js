'use strict'

class UndiciError extends Error {
  name = /** @type {string} */ 'UndiciError'
  code = /** @type {string} */ 'UND_ERR'
}

/**
 * Connect timeout error.
 */
class ConnectTimeoutError extends UndiciError {
  name = /** @type {const} */ ('ConnectTimeoutError')
  code = /** @type {const} */ ('UND_ERR_CONNECT_TIMEOUT')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Connect Timeout Error'
  }
}
/**
 * A header exceeds the `headersTimeout` option.
 */
class HeadersTimeoutError extends UndiciError {
  name = /** @type {const} */ ('HeadersTimeoutError')
  code = /** @type {const} */ ('UND_ERR_HEADERS_TIMEOUT')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Headers Timeout Error'
  }
}

/**
 * Headers overflow error.
 */
class HeadersOverflowError extends UndiciError {
  name = /** @type {const} */ ('HeadersOverflowError')
  code = /** @type {const} */ ('UND_ERR_HEADERS_OVERFLOW')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Headers Overflow Error'
  }
}

/**
 * A body exceeds the `bodyTimeout` option.
 */
class BodyTimeoutError extends UndiciError {
  name = /** @type {const} */ ('BodyTimeoutError')
  code = /** @type {const} */ ('UND_ERR_BODY_TIMEOUT')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Body Timeout Error'
  }
}

class ResponseStatusCodeError extends UndiciError {
  name = /** @type {const} */ ('ResponseStatusCodeError')
  code = /** @type {const} */ ('UND_ERR_RESPONSE_STATUS_CODE')
  constructor (
    /** @type {string} */ message,
    /** @type {number} */ statusCode,
    /** @type {Record<string, string|string[]>|string[]|null} */ headers,
    /** @type {*} */ body
  ) {
    super(message)
    this.message = message || 'Response Status Code Error'
    this.statusCode = statusCode
    this.status = statusCode
    this.body = body
    this.headers = headers
  }
}

/**
 * Passed an invalid argument.
 */
class InvalidArgumentError extends UndiciError {
  name = /** @type {const} */ ('InvalidArgumentError')
  code = /** @type {const} */ ('UND_ERR_INVALID_ARG')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Invalid Argument Error'
  }
}

/**
 * Returned an invalid value.
 */
class InvalidReturnValueError extends UndiciError {
  name = /** @type {const} */ ('InvalidReturnValueError')
  code = /** @type {const} */ ('UND_ERR_INVALID_RETURN_VALUE')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Invalid Return Value Error'
  }
}

class AbortError extends UndiciError {
  name = /** @type {const} */ ('AbortError')
  code = /** @type {string} */ ('UND_ERR_ABORT')
  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'The operation was aborted'
  }
}

/**
 * The request has been aborted by the user.
 */
class RequestAbortedError extends AbortError {
  name = /** @type {const} */ ('AbortError')
  code = /** @type {const} */ ('UND_ERR_ABORTED')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Request aborted'
  }
}

/**
 * Expected error with reason.
 */
class InformationalError extends UndiciError {
  name = /** @type {const} */ ('InformationalError')
  code = /** @type {const} */ ('UND_ERR_INFO')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Request information'
  }
}

/**
 * Request body length does not match content-length header.
 */
class RequestContentLengthMismatchError extends UndiciError {
  name = /** @type {const} */ ('RequestContentLengthMismatchError')
  code = /** @type {const} */ ('UND_ERR_REQ_CONTENT_LENGTH_MISMATCH')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Request body length does not match content-length header'
  }
}

/**
 * Response body length does not match content-length header.
 */
class ResponseContentLengthMismatchError extends UndiciError {
  name = /** @type {const} */ ('ResponseContentLengthMismatchError')
  code = /** @type {const} */ ('UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Response body length does not match content-length header'
  }
}

/**
 * Trying to use a destroyed client.
 */
class ClientDestroyedError extends UndiciError {
  name = /** @type {const} */ ('ClientDestroyedError')
  code = /** @type {const} */ ('UND_ERR_DESTROYED')
  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'The client is destroyed'
  }
}

class ClientClosedError extends UndiciError {
  name = /** @type {const} */ ('ClientClosedError')
  code = /** @type {const} */ ('UND_ERR_CLOSED')
  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'The client is closed'
  }
}

/**
 * There is an error with the socket.
 */
class SocketError extends UndiciError {
  name = /** @type {const} */ ('SocketError')
  code = /** @type {const} */ ('UND_ERR_SOCKET')

  constructor (
    /** @type {string} **/ message,
    /** @type {import('net').Socket|null} */ socket
  ) {
    super(message)
    this.message = message || 'Socket error'
    this.socket = socket
  }
}

/**
 * Encountered unsupported functionality.
 */
class NotSupportedError extends UndiciError {
  name = /** @type {const} */ ('NotSupportedError')
  code = /** @type {const} */ ('UND_ERR_NOT_SUPPORTED')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'Not supported error'
  }
}

/**
 * No upstream has been added to the BalancedPool.
 */
class BalancedPoolMissingUpstreamError extends UndiciError {
  name = /** @type {const} */ ('MissingUpstreamError')
  code = /** @type {const} */ ('UND_ERR_BPL_MISSING_UPSTREAM')

  constructor (/** @type {string} **/ message) {
    super(message)
    this.message = message || 'No upstream has been added to the BalancedPool'
  }
}

class HTTPParserError extends UndiciError {
  name = /** {const} */ 'HTTPParserError'
  code = /** {const} */ 'UND_ERR_HTTP_PARSER'

  constructor (
    /** @type {string} */ message,
    /** @type {string} */ code,
    /** @type {*} */ data
  ) {
    super(message)

    code = (/** @type {`HPE_${string}|undefined`} */ (code ? `HPE_${code}` : undefined))
    this.data = data ? data.toString() : undefined
  }
}

/**
 * The response exceed the length allowed.
 */
class ResponseExceededMaxSizeError extends UndiciError {
  name = /** @type {const} */ 'ResponseExceededMaxSizeError'
  code = /** @type {const} */ 'UND_ERR_RES_EXCEEDED_MAX_SIZE'

  constructor (/** @type {string} */ message) {
    super(message)
    this.message = message || 'Response content exceeded max size'
  }
}

/**
 * @typedef RequestRetryErrorOptions
 * @type {object}
 * @property {object} data
 * @property {number} count
 * @property {Record<string, string|string[]>|string[]|null} headers
 */;

class RequestRetryError extends UndiciError {
  name = /** @type {const} */ 'RequestRetryError'
  code = /** @type {const} */ 'UND_ERR_REQ_RETRY'

  constructor (
    /** @type {string} */ message,
    /** @type {number} */ statusCode,
    /** @type {RequestRetryErrorOptions} */ { headers, data }) {
    super(message)
    this.message = message || 'Request retry error'
    this.statusCode = statusCode
    this.data = data
    this.headers = headers
  }
}

/**
 * @typedef ResponseErrorOptions
 * @type {object}
 * @property {object} data
 * @property {Record<string, string|string[]>|string[]|null} headers
 */;

class ResponseError extends UndiciError {
  name = /** @type {const} */ 'ResponseError'
  code = /** @type {const} */ ('UND_ERR_RESPONSE')

  constructor (
    /** @type {string} */ message,
    /** @type {number} */ statusCode,
    /** @type {ResponseErrorOptions} */ { data, headers }
  ) {
    super(message)
    this.message = message || 'Response error'
    this.statusCode = statusCode
    this.data = data
    this.headers = headers
  }
}

class SecureProxyConnectionError extends UndiciError {
  name = /** @type {const} */ 'SecureProxyConnectionError'
  code = /** @type {const} */ ('UND_ERR_PRX_TLS')

  constructor (/** @type {Error} */ cause, /** @type {string} */ message) {
    super(message, { cause })
    this.message = message || 'Secure Proxy Connection failed'
    this.cause = cause
  }
}

module.exports = {
  AbortError,
  HTTPParserError,
  UndiciError,
  HeadersTimeoutError,
  HeadersOverflowError,
  BodyTimeoutError,
  RequestContentLengthMismatchError,
  ConnectTimeoutError,
  ResponseStatusCodeError,
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError,
  ClientDestroyedError,
  ClientClosedError,
  InformationalError,
  SocketError,
  NotSupportedError,
  ResponseContentLengthMismatchError,
  BalancedPoolMissingUpstreamError,
  ResponseExceededMaxSizeError,
  RequestRetryError,
  ResponseError,
  SecureProxyConnectionError
}
