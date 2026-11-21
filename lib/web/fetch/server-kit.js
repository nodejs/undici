'use strict'

const { kConstruct } = require('../../core/symbols')
const {
  HeadersList,
  fill,
  getHeadersList,
  setHeadersList,
  getHeadersGuard,
  setHeadersGuard
} = require('./headers')
const {
  getRequestState,
  setRequestState,
  setRequestHeaders,
  setRequestSignal
} = require('./request')
const {
  getResponseState,
  setResponseState,
  setResponseHeaders
} = require('./response')

/**
 * The single surface through which server runtimes embedding undici
 * (e.g. Node.js core's http.serve()) may reach fetch internals to build
 * Request/Response subclasses without going through the public
 * constructors: pass kConstruct to the constructor to obtain an
 * uninitialized, brand-carrying instance, then install inner state and a
 * Headers wrapper through the accessors below.
 *
 * Invariants callers must uphold:
 * - an instance created with kConstruct must have its state installed
 *   before it escapes
 * - header names appended to a HeadersList with isLowerCase=true must be
 *   valid, already lowercased HTTP tokens, and values must be free of
 *   CR/LF/NUL (e.g. already validated by an HTTP parser)
 * - installed request/response state must be shape-compatible with the
 *   records produced by makeRequest/makeResponse
 */
module.exports = Object.freeze({
  kConstruct,
  HeadersList,
  fillHeaders: fill,
  getHeadersList,
  setHeadersList,
  getHeadersGuard,
  setHeadersGuard,
  getRequestState,
  setRequestState,
  setRequestHeaders,
  setRequestSignal,
  getResponseState,
  setResponseState,
  setResponseHeaders
})
