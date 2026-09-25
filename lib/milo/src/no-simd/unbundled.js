const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const wasmModule = new WebAssembly.Module(readFileSync(join(__dirname, '../../binary/no-simd.wasm')))

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function log (logger, raw) {
  const len = Number(BigInt.asUintN(32, raw))
  const ptr = Number(raw >> 32n)

  logger(textDecoder.decode(new Uint8Array(this.memory.buffer, ptr, len)))
}

function alloc (len) {
  return this.alloc(len) >>> 0
}

function dealloc (ptr) {
  return this.dealloc(ptr)
}

function create () {
  return this.create() >>> 0
}

function destroy (parser) {
  this.destroy(parser)
}

function parse (parser, data, limit) {
  return this.parse(parser, data, limit) >>> 0
}

function fail (parser, code, description) {
  const len = description.length
  const ptr = this.alloc(len)
  const buffer = new Uint8Array(this.memory.buffer, ptr, len)
  textEncoder.encodeInto(description, buffer)

  this.fail(parser, code, ptr, len)
  this.dealloc(ptr, len)
}

function hasDebug () {
  return this.milo_has_debug() !== 0
}

const Errors = Object.freeze({
  NONE: 0,
  USER: 1,
  CALLBACK_ERROR: 2,
  UNEXPECTED_STATE: 3,
  UNEXPECTED_DATA: 4,
  UNEXPECTED_EOF: 5,
  UNEXPECTED_CHARACTER: 6,
  UNEXPECTED_CONTENT_LENGTH: 7,
  UNEXPECTED_TRANSFER_ENCODING: 8,
  UNEXPECTED_CONTENT: 9,
  UNEXPECTED_TRAILERS: 10,
  INVALID_VERSION: 11,
  INVALID_STATUS: 12,
  INVALID_CONTENT_LENGTH: 13,
  INVALID_TRANSFER_ENCODING: 14,
  INVALID_CHUNK_SIZE: 15,
  MISSING_CONNECTION_UPGRADE: 16,
  UNSUPPORTED_HTTP_VERSION: 17,
  0: 'NONE',
  1: 'USER',
  2: 'CALLBACK_ERROR',
  3: 'UNEXPECTED_STATE',
  4: 'UNEXPECTED_DATA',
  5: 'UNEXPECTED_EOF',
  6: 'UNEXPECTED_CHARACTER',
  7: 'UNEXPECTED_CONTENT_LENGTH',
  8: 'UNEXPECTED_TRANSFER_ENCODING',
  9: 'UNEXPECTED_CONTENT',
  10: 'UNEXPECTED_TRAILERS',
  11: 'INVALID_VERSION',
  12: 'INVALID_STATUS',
  13: 'INVALID_CONTENT_LENGTH',
  14: 'INVALID_TRANSFER_ENCODING',
  15: 'INVALID_CHUNK_SIZE',
  16: 'MISSING_CONNECTION_UPGRADE',
  17: 'UNSUPPORTED_HTTP_VERSION'
})

const Methods = Object.freeze({
  OTHER: 0,
  GET: 1,
  HEAD: 2,
  POST: 3,
  PUT: 4,
  DELETE: 5,
  CONNECT: 6,
  OPTIONS: 7,
  TRACE: 8,
  PATCH: 9,
  PRI: 10,
  0: 'OTHER',
  1: 'GET',
  2: 'HEAD',
  3: 'POST',
  4: 'PUT',
  5: 'DELETE',
  6: 'CONNECT',
  7: 'OPTIONS',
  8: 'TRACE',
  9: 'PATCH',
  10: 'PRI'
})

const Callbacks = Object.freeze({
  ON_ERROR: 0,
  ON_FINISH: 1,
  ON_MESSAGE_START: 2,
  ON_MESSAGE_COMPLETE: 3,
  ON_REQUEST: 4,
  ON_RESPONSE: 5,
  ON_RESET: 6,
  ON_METHOD: 7,
  ON_URL: 8,
  ON_PROTOCOL: 9,
  ON_VERSION: 10,
  ON_STATUS: 11,
  ON_REASON: 12,
  ON_HEADER_NAME: 13,
  ON_HEADER_VALUE: 14,
  ON_HEADERS: 15,
  ON_CONNECT: 16,
  ON_UPGRADE: 17,
  ON_CHUNK_LENGTH: 18,
  ON_CHUNK_EXTENSION_NAME: 19,
  ON_CHUNK_EXTENSION_VALUE: 20,
  ON_CHUNK: 21,
  ON_BODY: 22,
  ON_DATA: 23,
  ON_TRAILER_NAME: 24,
  ON_TRAILER_VALUE: 25,
  ON_TRAILERS: 26,
  ON_STATE_CHANGE: 27,
  0: 'ON_ERROR',
  1: 'ON_FINISH',
  2: 'ON_MESSAGE_START',
  3: 'ON_MESSAGE_COMPLETE',
  4: 'ON_REQUEST',
  5: 'ON_RESPONSE',
  6: 'ON_RESET',
  7: 'ON_METHOD',
  8: 'ON_URL',
  9: 'ON_PROTOCOL',
  10: 'ON_VERSION',
  11: 'ON_STATUS',
  12: 'ON_REASON',
  13: 'ON_HEADER_NAME',
  14: 'ON_HEADER_VALUE',
  15: 'ON_HEADERS',
  16: 'ON_CONNECT',
  17: 'ON_UPGRADE',
  18: 'ON_CHUNK_LENGTH',
  19: 'ON_CHUNK_EXTENSION_NAME',
  20: 'ON_CHUNK_EXTENSION_VALUE',
  21: 'ON_CHUNK',
  22: 'ON_BODY',
  23: 'ON_DATA',
  24: 'ON_TRAILER_NAME',
  25: 'ON_TRAILER_VALUE',
  26: 'ON_TRAILERS',
  27: 'ON_STATE_CHANGE'
})

const CallbackActives = Object.freeze({
  NONE: 0n,
  ON_ERROR: 1n,
  ON_FINISH: 2n,
  ON_MESSAGE_START: 4n,
  ON_MESSAGE_COMPLETE: 8n,
  ON_REQUEST: 16n,
  ON_RESPONSE: 32n,
  ON_RESET: 64n,
  ON_METHOD: 128n,
  ON_URL: 256n,
  ON_PROTOCOL: 512n,
  ON_VERSION: 1024n,
  ON_STATUS: 2048n,
  ON_REASON: 4096n,
  ON_HEADER_NAME: 8192n,
  ON_HEADER_VALUE: 16384n,
  ON_HEADERS: 32768n,
  ON_CONNECT: 65536n,
  ON_UPGRADE: 131072n,
  ON_CHUNK_LENGTH: 262144n,
  ON_CHUNK_EXTENSION_NAME: 524288n,
  ON_CHUNK_EXTENSION_VALUE: 1048576n,
  ON_CHUNK: 2097152n,
  ON_BODY: 4194304n,
  ON_DATA: 8388608n,
  ON_TRAILER_NAME: 16777216n,
  ON_TRAILER_VALUE: 33554432n,
  ON_TRAILERS: 67108864n,
  ON_STATE_CHANGE: 134217728n,
  ALL: 268435455n,
  0n: 'NONE',
  1n: 'ON_ERROR',
  2n: 'ON_FINISH',
  4n: 'ON_MESSAGE_START',
  8n: 'ON_MESSAGE_COMPLETE',
  16n: 'ON_REQUEST',
  32n: 'ON_RESPONSE',
  64n: 'ON_RESET',
  128n: 'ON_METHOD',
  256n: 'ON_URL',
  512n: 'ON_PROTOCOL',
  1024n: 'ON_VERSION',
  2048n: 'ON_STATUS',
  4096n: 'ON_REASON',
  8192n: 'ON_HEADER_NAME',
  16384n: 'ON_HEADER_VALUE',
  32768n: 'ON_HEADERS',
  65536n: 'ON_CONNECT',
  131072n: 'ON_UPGRADE',
  262144n: 'ON_CHUNK_LENGTH',
  524288n: 'ON_CHUNK_EXTENSION_NAME',
  1048576n: 'ON_CHUNK_EXTENSION_VALUE',
  2097152n: 'ON_CHUNK',
  4194304n: 'ON_BODY',
  8388608n: 'ON_DATA',
  16777216n: 'ON_TRAILER_NAME',
  33554432n: 'ON_TRAILER_VALUE',
  67108864n: 'ON_TRAILERS',
  134217728n: 'ON_STATE_CHANGE',
  268435455n: 'ALL'
})

const Events = Object.freeze({
  END: 0,
  ERROR: 1,
  FINISH: 2,
  MESSAGE_START: 3,
  MESSAGE_COMPLETE: 4,
  REQUEST: 5,
  RESPONSE: 6,
  RESET: 7,
  METHOD: 8,
  URL: 9,
  PROTOCOL: 10,
  VERSION: 11,
  STATUS: 12,
  REASON: 13,
  HEADER_NAME: 14,
  HEADER_VALUE: 15,
  HEADERS: 16,
  CONNECT: 17,
  UPGRADE: 18,
  CHUNK_LENGTH: 19,
  CHUNK_EXTENSION_NAME: 20,
  CHUNK_EXTENSION_VALUE: 21,
  CHUNK: 22,
  BODY: 23,
  DATA: 24,
  TRAILER_NAME: 25,
  TRAILER_VALUE: 26,
  TRAILERS: 27,
  STATE_CHANGE: 28,
  0: 'END',
  1: 'ERROR',
  2: 'FINISH',
  3: 'MESSAGE_START',
  4: 'MESSAGE_COMPLETE',
  5: 'REQUEST',
  6: 'RESPONSE',
  7: 'RESET',
  8: 'METHOD',
  9: 'URL',
  10: 'PROTOCOL',
  11: 'VERSION',
  12: 'STATUS',
  13: 'REASON',
  14: 'HEADER_NAME',
  15: 'HEADER_VALUE',
  16: 'HEADERS',
  17: 'CONNECT',
  18: 'UPGRADE',
  19: 'CHUNK_LENGTH',
  20: 'CHUNK_EXTENSION_NAME',
  21: 'CHUNK_EXTENSION_VALUE',
  22: 'CHUNK',
  23: 'BODY',
  24: 'DATA',
  25: 'TRAILER_NAME',
  26: 'TRAILER_VALUE',
  27: 'TRAILERS',
  28: 'STATE_CHANGE'
})

const EventActives = Object.freeze({
  NONE: 0n,
  ON_ERROR: 1n,
  ON_FINISH: 2n,
  ON_MESSAGE_START: 4n,
  ON_MESSAGE_COMPLETE: 8n,
  ON_REQUEST: 16n,
  ON_RESPONSE: 32n,
  ON_RESET: 64n,
  ON_METHOD: 128n,
  ON_URL: 256n,
  ON_PROTOCOL: 512n,
  ON_VERSION: 1024n,
  ON_STATUS: 2048n,
  ON_REASON: 4096n,
  ON_HEADER_NAME: 8192n,
  ON_HEADER_VALUE: 16384n,
  ON_HEADERS: 32768n,
  ON_CONNECT: 65536n,
  ON_UPGRADE: 131072n,
  ON_CHUNK_LENGTH: 262144n,
  ON_CHUNK_EXTENSION_NAME: 524288n,
  ON_CHUNK_EXTENSION_VALUE: 1048576n,
  ON_CHUNK: 2097152n,
  ON_BODY: 4194304n,
  ON_DATA: 8388608n,
  ON_TRAILER_NAME: 16777216n,
  ON_TRAILER_VALUE: 33554432n,
  ON_TRAILERS: 67108864n,
  ON_STATE_CHANGE: 134217728n,
  ALL: 268435455n,
  0n: 'NONE',
  1n: 'ON_ERROR',
  2n: 'ON_FINISH',
  4n: 'ON_MESSAGE_START',
  8n: 'ON_MESSAGE_COMPLETE',
  16n: 'ON_REQUEST',
  32n: 'ON_RESPONSE',
  64n: 'ON_RESET',
  128n: 'ON_METHOD',
  256n: 'ON_URL',
  512n: 'ON_PROTOCOL',
  1024n: 'ON_VERSION',
  2048n: 'ON_STATUS',
  4096n: 'ON_REASON',
  8192n: 'ON_HEADER_NAME',
  16384n: 'ON_HEADER_VALUE',
  32768n: 'ON_HEADERS',
  65536n: 'ON_CONNECT',
  131072n: 'ON_UPGRADE',
  262144n: 'ON_CHUNK_LENGTH',
  524288n: 'ON_CHUNK_EXTENSION_NAME',
  1048576n: 'ON_CHUNK_EXTENSION_VALUE',
  2097152n: 'ON_CHUNK',
  4194304n: 'ON_BODY',
  8388608n: 'ON_DATA',
  16777216n: 'ON_TRAILER_NAME',
  33554432n: 'ON_TRAILER_VALUE',
  67108864n: 'ON_TRAILERS',
  134217728n: 'ON_STATE_CHANGE',
  268435455n: 'ALL'
})

const States = Object.freeze({
  START: 0,
  FINISH: 1,
  ERROR: 2,
  REQUEST_LINE: 3,
  STATUS_LINE: 4,
  HTTP2_PREFACE: 5,
  HEADER: 6,
  BODY_DECISION: 7,
  BODY_VIA_CONTENT_LENGTH: 8,
  BODY_WITH_NO_LENGTH: 9,
  CHUNK_HEADER: 10,
  CHUNK_EXTENSIONS: 11,
  CHUNK_DATA: 12,
  TRAILER: 13,
  TUNNEL: 14,
  0: 'START',
  1: 'FINISH',
  2: 'ERROR',
  3: 'REQUEST_LINE',
  4: 'STATUS_LINE',
  5: 'HTTP2_PREFACE',
  6: 'HEADER',
  7: 'BODY_DECISION',
  8: 'BODY_VIA_CONTENT_LENGTH',
  9: 'BODY_WITH_NO_LENGTH',
  10: 'CHUNK_HEADER',
  11: 'CHUNK_EXTENSIONS',
  12: 'CHUNK_DATA',
  13: 'TRAILER',
  14: 'TUNNEL'
})

const ParserFields = Object.freeze({
  MAX_START_LINE_LENGTH: 0,
  MAX_HEADER_LENGTH: 4,
  MAX_BODY_PAYLOAD: 8,
  AUTODETECT: 16,
  IS_REQUEST: 17,
  SUSPEND_AFTER_HEADERS: 18,
  MANAGE_UNCONSUMED: 19,
  CONTINUE_WITHOUT_DATA: 20,
  IS_CONNECT: 21,
  SKIP_BODY: 22,
  DEBUG: 23,
  PARSED: 24,
  POSITION: 32,
  STATE: 36,
  PAUSED: 37,
  ERROR_CODE: 38,
  CONTENT_LENGTH: 40,
  CHUNK_SIZE: 48,
  REMAINING_CONTENT_LENGTH: 56,
  REMAINING_CHUNK_SIZE: 64,
  STATUS: 72,
  METHOD: 76,
  HAS_CONTENT_LENGTH: 77,
  HAS_TRANSFER_ENCODING: 78,
  HAS_CHUNKED_TRANSFER_ENCODING: 79,
  HAS_CONNECTION_CLOSE: 80,
  HAS_CONNECTION_UPGRADE: 81,
  HAS_UPGRADE: 82,
  HAS_TRAILERS: 83,
  ACTIVE_CALLBACKS: 88,
  ACTIVE_EVENTS: 96,
  PTR: 104,
  ERROR_DESCRIPTION: 108,
  UNCONSUMED: 364,
  UNCONSUMED_LEN: 368,
  ERROR_DESCRIPTION_LEN: 372,
  EVENTS: 376,
  0: 'MAX_START_LINE_LENGTH',
  4: 'MAX_HEADER_LENGTH',
  8: 'MAX_BODY_PAYLOAD',
  16: 'AUTODETECT',
  17: 'IS_REQUEST',
  18: 'SUSPEND_AFTER_HEADERS',
  19: 'MANAGE_UNCONSUMED',
  20: 'CONTINUE_WITHOUT_DATA',
  21: 'IS_CONNECT',
  22: 'SKIP_BODY',
  23: 'DEBUG',
  24: 'PARSED',
  32: 'POSITION',
  36: 'STATE',
  37: 'PAUSED',
  38: 'ERROR_CODE',
  40: 'CONTENT_LENGTH',
  48: 'CHUNK_SIZE',
  56: 'REMAINING_CONTENT_LENGTH',
  64: 'REMAINING_CHUNK_SIZE',
  72: 'STATUS',
  76: 'METHOD',
  77: 'HAS_CONTENT_LENGTH',
  78: 'HAS_TRANSFER_ENCODING',
  79: 'HAS_CHUNKED_TRANSFER_ENCODING',
  80: 'HAS_CONNECTION_CLOSE',
  81: 'HAS_CONNECTION_UPGRADE',
  82: 'HAS_UPGRADE',
  83: 'HAS_TRAILERS',
  88: 'ACTIVE_CALLBACKS',
  96: 'ACTIVE_EVENTS',
  104: 'PTR',
  108: 'ERROR_DESCRIPTION',
  364: 'UNCONSUMED',
  368: 'UNCONSUMED_LEN',
  372: 'ERROR_DESCRIPTION_LEN',
  376: 'EVENTS'
})

function isAutodetect (parser) {
  return this.is_autodetect(parser) !== 0
}

function isRequest (parser) {
  return this.is_request(parser) !== 0
}

function isPaused (parser) {
  return this.is_paused(parser) !== 0
}

function shouldManageUnconsumed (parser) {
  return this.should_manage_unconsumed(parser) !== 0
}

function shouldSuspendAfterHeaders (parser) {
  return this.should_suspend_after_headers(parser) !== 0
}

function getMaxStartLineLength (parser) {
  return this.get_max_start_line_length(parser) >>> 0
}

function getMaxHeaderLength (parser) {
  return this.get_max_header_length(parser) >>> 0
}

function getMaxBodyPayload (parser) {
  return BigInt.asUintN(64, this.get_max_body_payload(parser))
}

function shouldContinueWithoutData (parser) {
  return this.should_continue_without_data(parser) !== 0
}

function isConnect (parser) {
  return this.is_connect(parser) !== 0
}

function isDebug (parser) {
  return this.is_debug(parser) !== 0
}

function shouldSkipBody (parser) {
  return this.should_skip_body(parser) !== 0
}

function getState (parser) {
  return this.get_state(parser) >>> 0
}

function getPosition (parser) {
  return this.get_position(parser) >>> 0
}

function getParsed (parser) {
  return BigInt.asUintN(64, this.get_parsed(parser))
}

function getErrorCode (parser) {
  return this.get_error_code(parser) >>> 0
}

function getMethod (parser) {
  return this.get_method(parser) >>> 0
}

function getStatus (parser) {
  return this.get_status(parser) >>> 0
}

function hasConnectionClose (parser) {
  return this.has_connection_close(parser) !== 0
}

function hasConnectionUpgrade (parser) {
  return this.has_connection_upgrade(parser) !== 0
}

function getContentLength (parser) {
  return BigInt.asUintN(64, this.get_content_length(parser))
}

function getChunkSize (parser) {
  return BigInt.asUintN(64, this.get_chunk_size(parser))
}

function getRemainingContentLength (parser) {
  return BigInt.asUintN(64, this.get_remaining_content_length(parser))
}

function getRemainingChunkSize (parser) {
  return BigInt.asUintN(64, this.get_remaining_chunk_size(parser))
}

function hasContentLength (parser) {
  return this.has_content_length(parser) !== 0
}

function hasTransferEncoding (parser) {
  return this.has_transfer_encoding(parser) !== 0
}

function hasChunkedTransferEncoding (parser) {
  return this.has_chunked_transfer_encoding(parser) !== 0
}

function hasUpgrade (parser) {
  return this.has_upgrade(parser) !== 0
}

function hasTrailers (parser) {
  return this.has_trailers(parser) !== 0
}

function getErrorDescription (parser) {
  const raw = this.get_error_description_raw(parser)
  const len = Number(BigInt.asUintN(32, raw))
  const ptr = Number(raw >> 32n)
  return textDecoder.decode(new Uint8Array(this.memory.buffer, ptr, len))
}

function setShouldAutodetect (parser, value) {
  this.set_should_autodetect(parser, value)
}

function setShouldContinueWithoutData (parser, value) {
  this.set_should_continue_without_data(parser, value)
}

function setIsRequest (parser, value) {
  this.set_is_request(parser, value)
}

function setIsConnect (parser, value) {
  this.set_is_connect(parser, value)
}

function setDebug (parser, value) {
  this.set_debug(parser, value)
}

function setShouldManageUnconsumed (parser, value) {
  this.set_should_manage_unconsumed(parser, value)
}

function setShouldSuspendAfterHeaders (parser, value) {
  this.set_should_suspend_after_headers(parser, value)
}

function setMaxStartLineLength (parser, value) {
  this.set_max_start_line_length(parser, value)
}

function setMaxHeaderLength (parser, value) {
  this.set_max_header_length(parser, value)
}

function setMaxBodyPayload (parser, value) {
  this.set_max_body_payload(parser, value)
}

function setShouldSkipBody (parser, value) {
  this.set_should_skip_body(parser, value)
}

function setActiveCallbacks (parser, value) {
  this.set_active_callbacks(parser, value)
}

function setActiveEvents (parser, value) {
  this.set_active_events(parser, value)
}

function simpleCreate (spans, create) {
  const parser = create()
  spans[parser] = []
  this.setActiveCallbacks(parser, this.CALLBACK_ACTIVE_ALL)
  return parser
}

function simpleDestroy (spans, destroy, parser) {
  spans[parser] = undefined
  destroy(parser)
}

function noop () {}

function setup (env = {}) {
  let { logger: logOption, ...instanceEnvironment } = env
  let logger = noop
  const context = {}

  if (logOption) {
    if (typeof logOption !== 'function') {
      logOption = console.log
    }

    logger = log.bind(context, logOption)
  }

  // Create the WASM instance
  /* eslint-disable-next-line no-undef */
  const instance = new WebAssembly.Instance(wasmModule, {
    env: {
      logger,
      on_error: noop,
      on_finish: noop,
      on_message_start: noop,
      on_message_complete: noop,
      on_request: noop,
      on_response: noop,
      on_reset: noop,
      on_method: noop,
      on_url: noop,
      on_protocol: noop,
      on_version: noop,
      on_status: noop,
      on_reason: noop,
      on_header_name: noop,
      on_header_value: noop,
      on_headers: noop,
      on_connect: noop,
      on_upgrade: noop,
      on_chunk_length: noop,
      on_chunk_extension_name: noop,
      on_chunk_extension_value: noop,
      on_chunk: noop,
      on_body: noop,
      on_data: noop,
      on_trailer_name: noop,
      on_trailer_value: noop,
      on_trailers: noop,
      on_state_change: noop,
      ...instanceEnvironment
    }
  })

  const wasm = instance.exports
  context.memory = wasm.memory

  const milo = {
    version: {
      raw: '0.8.0',
      major: 0,
      minor: 8,
      patch: 0,
      prerelease: ''
    },
    METHOD_OTHER: 0,
    METHOD_GET: 1,
    METHOD_HEAD: 2,
    METHOD_POST: 3,
    METHOD_PUT: 4,
    METHOD_DELETE: 5,
    METHOD_CONNECT: 6,
    METHOD_OPTIONS: 7,
    METHOD_TRACE: 8,
    METHOD_PATCH: 9,
    METHOD_PRI: 10,
    CALLBACK_ON_ERROR: 0,
    CALLBACK_ON_FINISH: 1,
    CALLBACK_ON_MESSAGE_START: 2,
    CALLBACK_ON_MESSAGE_COMPLETE: 3,
    CALLBACK_ON_REQUEST: 4,
    CALLBACK_ON_RESPONSE: 5,
    CALLBACK_ON_RESET: 6,
    CALLBACK_ON_METHOD: 7,
    CALLBACK_ON_URL: 8,
    CALLBACK_ON_PROTOCOL: 9,
    CALLBACK_ON_VERSION: 10,
    CALLBACK_ON_STATUS: 11,
    CALLBACK_ON_REASON: 12,
    CALLBACK_ON_HEADER_NAME: 13,
    CALLBACK_ON_HEADER_VALUE: 14,
    CALLBACK_ON_HEADERS: 15,
    CALLBACK_ON_CONNECT: 16,
    CALLBACK_ON_UPGRADE: 17,
    CALLBACK_ON_CHUNK_LENGTH: 18,
    CALLBACK_ON_CHUNK_EXTENSION_NAME: 19,
    CALLBACK_ON_CHUNK_EXTENSION_VALUE: 20,
    CALLBACK_ON_CHUNK: 21,
    CALLBACK_ON_BODY: 22,
    CALLBACK_ON_DATA: 23,
    CALLBACK_ON_TRAILER_NAME: 24,
    CALLBACK_ON_TRAILER_VALUE: 25,
    CALLBACK_ON_TRAILERS: 26,
    CALLBACK_ON_STATE_CHANGE: 27,
    EVENT_END: 0,
    EVENT_ERROR: 1,
    EVENT_FINISH: 2,
    EVENT_MESSAGE_START: 3,
    EVENT_MESSAGE_COMPLETE: 4,
    EVENT_REQUEST: 5,
    EVENT_RESPONSE: 6,
    EVENT_RESET: 7,
    EVENT_METHOD: 8,
    EVENT_URL: 9,
    EVENT_PROTOCOL: 10,
    EVENT_VERSION: 11,
    EVENT_STATUS: 12,
    EVENT_REASON: 13,
    EVENT_HEADER_NAME: 14,
    EVENT_HEADER_VALUE: 15,
    EVENT_HEADERS: 16,
    EVENT_CONNECT: 17,
    EVENT_UPGRADE: 18,
    EVENT_CHUNK_LENGTH: 19,
    EVENT_CHUNK_EXTENSION_NAME: 20,
    EVENT_CHUNK_EXTENSION_VALUE: 21,
    EVENT_CHUNK: 22,
    EVENT_BODY: 23,
    EVENT_DATA: 24,
    EVENT_TRAILER_NAME: 25,
    EVENT_TRAILER_VALUE: 26,
    EVENT_TRAILERS: 27,
    EVENT_STATE_CHANGE: 28,
    CALLBACK_ACTIVE_NONE: 0n,
    EVENT_ACTIVE_NONE: 0n,
    CALLBACK_ACTIVE_ON_ERROR: 1n,
    EVENT_ACTIVE_ON_ERROR: 1n,
    CALLBACK_ACTIVE_ON_FINISH: 2n,
    EVENT_ACTIVE_ON_FINISH: 2n,
    CALLBACK_ACTIVE_ON_MESSAGE_START: 4n,
    EVENT_ACTIVE_ON_MESSAGE_START: 4n,
    CALLBACK_ACTIVE_ON_MESSAGE_COMPLETE: 8n,
    EVENT_ACTIVE_ON_MESSAGE_COMPLETE: 8n,
    CALLBACK_ACTIVE_ON_REQUEST: 16n,
    EVENT_ACTIVE_ON_REQUEST: 16n,
    CALLBACK_ACTIVE_ON_RESPONSE: 32n,
    EVENT_ACTIVE_ON_RESPONSE: 32n,
    CALLBACK_ACTIVE_ON_RESET: 64n,
    EVENT_ACTIVE_ON_RESET: 64n,
    CALLBACK_ACTIVE_ON_METHOD: 128n,
    EVENT_ACTIVE_ON_METHOD: 128n,
    CALLBACK_ACTIVE_ON_URL: 256n,
    EVENT_ACTIVE_ON_URL: 256n,
    CALLBACK_ACTIVE_ON_PROTOCOL: 512n,
    EVENT_ACTIVE_ON_PROTOCOL: 512n,
    CALLBACK_ACTIVE_ON_VERSION: 1024n,
    EVENT_ACTIVE_ON_VERSION: 1024n,
    CALLBACK_ACTIVE_ON_STATUS: 2048n,
    EVENT_ACTIVE_ON_STATUS: 2048n,
    CALLBACK_ACTIVE_ON_REASON: 4096n,
    EVENT_ACTIVE_ON_REASON: 4096n,
    CALLBACK_ACTIVE_ON_HEADER_NAME: 8192n,
    EVENT_ACTIVE_ON_HEADER_NAME: 8192n,
    CALLBACK_ACTIVE_ON_HEADER_VALUE: 16384n,
    EVENT_ACTIVE_ON_HEADER_VALUE: 16384n,
    CALLBACK_ACTIVE_ON_HEADERS: 32768n,
    EVENT_ACTIVE_ON_HEADERS: 32768n,
    CALLBACK_ACTIVE_ON_CONNECT: 65536n,
    EVENT_ACTIVE_ON_CONNECT: 65536n,
    CALLBACK_ACTIVE_ON_UPGRADE: 131072n,
    EVENT_ACTIVE_ON_UPGRADE: 131072n,
    CALLBACK_ACTIVE_ON_CHUNK_LENGTH: 262144n,
    EVENT_ACTIVE_ON_CHUNK_LENGTH: 262144n,
    CALLBACK_ACTIVE_ON_CHUNK_EXTENSION_NAME: 524288n,
    EVENT_ACTIVE_ON_CHUNK_EXTENSION_NAME: 524288n,
    CALLBACK_ACTIVE_ON_CHUNK_EXTENSION_VALUE: 1048576n,
    EVENT_ACTIVE_ON_CHUNK_EXTENSION_VALUE: 1048576n,
    CALLBACK_ACTIVE_ON_CHUNK: 2097152n,
    EVENT_ACTIVE_ON_CHUNK: 2097152n,
    CALLBACK_ACTIVE_ON_BODY: 4194304n,
    EVENT_ACTIVE_ON_BODY: 4194304n,
    CALLBACK_ACTIVE_ON_DATA: 8388608n,
    EVENT_ACTIVE_ON_DATA: 8388608n,
    CALLBACK_ACTIVE_ON_TRAILER_NAME: 16777216n,
    EVENT_ACTIVE_ON_TRAILER_NAME: 16777216n,
    CALLBACK_ACTIVE_ON_TRAILER_VALUE: 33554432n,
    EVENT_ACTIVE_ON_TRAILER_VALUE: 33554432n,
    CALLBACK_ACTIVE_ON_TRAILERS: 67108864n,
    EVENT_ACTIVE_ON_TRAILERS: 67108864n,
    CALLBACK_ACTIVE_ON_STATE_CHANGE: 134217728n,
    EVENT_ACTIVE_ON_STATE_CHANGE: 134217728n,
    CALLBACK_ACTIVE_ALL: 268435455n,
    EVENT_ACTIVE_ALL: 268435455n,
    ERROR_NONE: 0,
    ERROR_USER: 1,
    ERROR_CALLBACK_ERROR: 2,
    ERROR_UNEXPECTED_STATE: 3,
    ERROR_UNEXPECTED_DATA: 4,
    ERROR_UNEXPECTED_EOF: 5,
    ERROR_UNEXPECTED_CHARACTER: 6,
    ERROR_UNEXPECTED_CONTENT_LENGTH: 7,
    ERROR_UNEXPECTED_TRANSFER_ENCODING: 8,
    ERROR_UNEXPECTED_CONTENT: 9,
    ERROR_UNEXPECTED_TRAILERS: 10,
    ERROR_INVALID_VERSION: 11,
    ERROR_INVALID_STATUS: 12,
    ERROR_INVALID_CONTENT_LENGTH: 13,
    ERROR_INVALID_TRANSFER_ENCODING: 14,
    ERROR_INVALID_CHUNK_SIZE: 15,
    ERROR_MISSING_CONNECTION_UPGRADE: 16,
    ERROR_UNSUPPORTED_HTTP_VERSION: 17,
    STATE_START: 0,
    STATE_FINISH: 1,
    STATE_ERROR: 2,
    STATE_REQUEST_LINE: 3,
    STATE_STATUS_LINE: 4,
    STATE_HTTP2_PREFACE: 5,
    STATE_HEADER: 6,
    STATE_BODY_DECISION: 7,
    STATE_BODY_VIA_CONTENT_LENGTH: 8,
    STATE_BODY_WITH_NO_LENGTH: 9,
    STATE_CHUNK_HEADER: 10,
    STATE_CHUNK_EXTENSIONS: 11,
    STATE_CHUNK_DATA: 12,
    STATE_TRAILER: 13,
    STATE_TUNNEL: 14,
    PARSER_FIELD_MAX_START_LINE_LENGTH: 0,
    PARSER_FIELD_MAX_HEADER_LENGTH: 4,
    PARSER_FIELD_MAX_BODY_PAYLOAD: 8,
    PARSER_FIELD_AUTODETECT: 16,
    PARSER_FIELD_IS_REQUEST: 17,
    PARSER_FIELD_SUSPEND_AFTER_HEADERS: 18,
    PARSER_FIELD_MANAGE_UNCONSUMED: 19,
    PARSER_FIELD_CONTINUE_WITHOUT_DATA: 20,
    PARSER_FIELD_IS_CONNECT: 21,
    PARSER_FIELD_SKIP_BODY: 22,
    PARSER_FIELD_DEBUG: 23,
    PARSER_FIELD_PARSED: 24,
    PARSER_FIELD_POSITION: 32,
    PARSER_FIELD_STATE: 36,
    PARSER_FIELD_PAUSED: 37,
    PARSER_FIELD_ERROR_CODE: 38,
    PARSER_FIELD_CONTENT_LENGTH: 40,
    PARSER_FIELD_CHUNK_SIZE: 48,
    PARSER_FIELD_REMAINING_CONTENT_LENGTH: 56,
    PARSER_FIELD_REMAINING_CHUNK_SIZE: 64,
    PARSER_FIELD_STATUS: 72,
    PARSER_FIELD_METHOD: 76,
    PARSER_FIELD_HAS_CONTENT_LENGTH: 77,
    PARSER_FIELD_HAS_TRANSFER_ENCODING: 78,
    PARSER_FIELD_HAS_CHUNKED_TRANSFER_ENCODING: 79,
    PARSER_FIELD_HAS_CONNECTION_CLOSE: 80,
    PARSER_FIELD_HAS_CONNECTION_UPGRADE: 81,
    PARSER_FIELD_HAS_UPGRADE: 82,
    PARSER_FIELD_HAS_TRAILERS: 83,
    PARSER_FIELD_ACTIVE_CALLBACKS: 88,
    PARSER_FIELD_ACTIVE_EVENTS: 96,
    PARSER_FIELD_PTR: 104,
    PARSER_FIELD_ERROR_DESCRIPTION: 108,
    PARSER_FIELD_UNCONSUMED: 364,
    PARSER_FIELD_UNCONSUMED_LEN: 368,
    PARSER_FIELD_ERROR_DESCRIPTION_LEN: 372,
    PARSER_FIELD_EVENTS: 376,
    Errors,
    Methods,
    Callbacks,
    CallbackActives,
    Events,
    EventActives,
    States,
    ParserFields,
    isAutodetect: isAutodetect.bind(wasm),
    isRequest: isRequest.bind(wasm),
    isPaused: isPaused.bind(wasm),
    shouldManageUnconsumed: shouldManageUnconsumed.bind(wasm),
    shouldSuspendAfterHeaders: shouldSuspendAfterHeaders.bind(wasm),
    getMaxStartLineLength: getMaxStartLineLength.bind(wasm),
    getMaxHeaderLength: getMaxHeaderLength.bind(wasm),
    getMaxBodyPayload: getMaxBodyPayload.bind(wasm),
    shouldContinueWithoutData: shouldContinueWithoutData.bind(wasm),
    isConnect: isConnect.bind(wasm),
    isDebug: isDebug.bind(wasm),
    shouldSkipBody: shouldSkipBody.bind(wasm),
    getState: getState.bind(wasm),
    getPosition: getPosition.bind(wasm),
    getParsed: getParsed.bind(wasm),
    getErrorCode: getErrorCode.bind(wasm),
    getMethod: getMethod.bind(wasm),
    getStatus: getStatus.bind(wasm),
    hasConnectionClose: hasConnectionClose.bind(wasm),
    hasConnectionUpgrade: hasConnectionUpgrade.bind(wasm),
    getContentLength: getContentLength.bind(wasm),
    getChunkSize: getChunkSize.bind(wasm),
    getRemainingContentLength: getRemainingContentLength.bind(wasm),
    getRemainingChunkSize: getRemainingChunkSize.bind(wasm),
    hasContentLength: hasContentLength.bind(wasm),
    hasTransferEncoding: hasTransferEncoding.bind(wasm),
    hasChunkedTransferEncoding: hasChunkedTransferEncoding.bind(wasm),
    hasUpgrade: hasUpgrade.bind(wasm),
    hasTrailers: hasTrailers.bind(wasm),
    getErrorDescription: getErrorDescription.bind(wasm),
    setShouldAutodetect: setShouldAutodetect.bind(wasm),
    setShouldContinueWithoutData: setShouldContinueWithoutData.bind(wasm),
    setIsRequest: setIsRequest.bind(wasm),
    setIsConnect: setIsConnect.bind(wasm),
    setDebug: setDebug.bind(wasm),
    setShouldManageUnconsumed: setShouldManageUnconsumed.bind(wasm),
    setShouldSuspendAfterHeaders: setShouldSuspendAfterHeaders.bind(wasm),
    setMaxStartLineLength: setMaxStartLineLength.bind(wasm),
    setMaxHeaderLength: setMaxHeaderLength.bind(wasm),
    setMaxBodyPayload: setMaxBodyPayload.bind(wasm),
    setShouldSkipBody: setShouldSkipBody.bind(wasm),
    setActiveCallbacks: setActiveCallbacks.bind(wasm),
    setActiveEvents: setActiveEvents.bind(wasm),
    memory: wasm.memory,
    alloc: alloc.bind(wasm),
    dealloc: dealloc.bind(wasm),
    create: create.bind(wasm),
    destroy: destroy.bind(wasm),
    parse: parse.bind(wasm),
    fail: fail.bind(wasm),
    hasDebug: hasDebug.bind(wasm),
    clear: wasm.clear,
    complete: wasm.complete,
    finish: wasm.finish,
    pause: wasm.pause,
    reset: wasm.reset,
    resume: wasm.resume
  }

  return milo
}

function simple () {
  const spans = {}

  const milo = setup({
    on_error (parser, at, len) {
      spans[parser].push([0, at, len])
    },
    on_finish (parser, at, len) {
      spans[parser].push([1, at, len])
    },
    on_message_start (parser, at, len) {
      spans[parser].push([2, at, len])
    },
    on_message_complete (parser, at, len) {
      spans[parser].push([3, at, len])
    },
    on_request (parser, at, len) {
      spans[parser].push([4, at, len])
    },
    on_response (parser, at, len) {
      spans[parser].push([5, at, len])
    },
    on_reset (parser, at, len) {
      spans[parser].push([6, at, len])
    },
    on_method (parser, at, len) {
      spans[parser].push([7, at, len])
    },
    on_url (parser, at, len) {
      spans[parser].push([8, at, len])
    },
    on_protocol (parser, at, len) {
      spans[parser].push([9, at, len])
    },
    on_version (parser, at, len) {
      spans[parser].push([10, at, len])
    },
    on_status (parser, at, len) {
      spans[parser].push([11, at, len])
    },
    on_reason (parser, at, len) {
      spans[parser].push([12, at, len])
    },
    on_header_name (parser, at, len) {
      spans[parser].push([13, at, len])
    },
    on_header_value (parser, at, len) {
      spans[parser].push([14, at, len])
    },
    on_headers (parser, at, len) {
      spans[parser].push([15, at, len])
    },
    on_connect (parser, at, len) {
      spans[parser].push([16, at, len])
    },
    on_upgrade (parser, at, len) {
      spans[parser].push([17, at, len])
    },
    on_chunk_length (parser, at, len) {
      spans[parser].push([18, at, len])
    },
    on_chunk_extension_name (parser, at, len) {
      spans[parser].push([19, at, len])
    },
    on_chunk_extension_value (parser, at, len) {
      spans[parser].push([20, at, len])
    },
    on_chunk (parser, at, len) {
      spans[parser].push([21, at, len])
    },
    on_body (parser, at, len) {
      spans[parser].push([22, at, len])
    },
    on_data (parser, at, len) {
      spans[parser].push([23, at, len])
    },
    on_trailer_name (parser, at, len) {
      spans[parser].push([24, at, len])
    },
    on_trailer_value (parser, at, len) {
      spans[parser].push([25, at, len])
    },
    on_trailers (parser, at, len) {
      spans[parser].push([26, at, len])
    },
    on_state_change (parser, at, len) {
      spans[parser].push([27, at, len])
    }
  })

  milo.spans = spans
  milo.create = simpleCreate.bind(milo, spans, milo.create)
  milo.destroy = simpleDestroy.bind(milo, spans, milo.destroy)

  return milo
}

module.exports = { wasmModule, noop, setup, simple }
