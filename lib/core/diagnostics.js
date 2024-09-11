'use strict'
const diagnosticsChannel = require('node:diagnostics_channel')
const util = require('node:util')

const undiciDebugLog = util.debuglog('undici')
const fetchDebuglog = util.debuglog('fetch')
const websocketDebuglog = util.debuglog('websocket')

const channels = {
  // Client
  beforeConnect: diagnosticsChannel.channel('undici:client:beforeConnect'),
  connected: diagnosticsChannel.channel('undici:client:connected'),
  connectError: diagnosticsChannel.channel('undici:client:connectError'),
  sendHeaders: diagnosticsChannel.channel('undici:client:sendHeaders'),
  // Request
  create: diagnosticsChannel.channel('undici:request:create'),
  bodySent: diagnosticsChannel.channel('undici:request:bodySent'),
  headers: diagnosticsChannel.channel('undici:request:headers'),
  trailers: diagnosticsChannel.channel('undici:request:trailers'),
  error: diagnosticsChannel.channel('undici:request:error'),
  // WebSocket
  open: diagnosticsChannel.channel('undici:websocket:open'),
  close: diagnosticsChannel.channel('undici:websocket:close'),
  socketError: diagnosticsChannel.channel('undici:websocket:socket_error'),
  ping: diagnosticsChannel.channel('undici:websocket:ping'),
  pong: diagnosticsChannel.channel('undici:websocket:pong')
}

let isTrackingClientEvents = false

function trackClientEvents (debugLog = undiciDebugLog) {
  if (isTrackingClientEvents) {
    return
  }

  isTrackingClientEvents = true

  diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(evt => {
    const {
      connectParams: { version, protocol, port, host }
    } = evt
    debugLog(
      'connecting to %s%s using %s%s',
      host,
      port ? `:${port}` : '',
      protocol,
      version
    )
  })

  diagnosticsChannel.channel('undici:client:connected').subscribe(evt => {
    const {
      connectParams: { version, protocol, port, host }
    } = evt
    debugLog(
      'connected to %s%s using %s%s',
      host,
      port ? `:${port}` : '',
      protocol,
      version
    )
  })

  diagnosticsChannel.channel('undici:client:connectError').subscribe(evt => {
    const {
      connectParams: { version, protocol, port, host },
      error
    } = evt
    debugLog(
      'connection to %s%s using %s%s errored - %s',
      host,
      port ? `:${port}` : '',
      protocol,
      version,
      error.message
    )
  })

  diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(evt => {
    const {
      request: { method, path, origin }
    } = evt
    debugLog('sending request to %s %s/%s', method, origin, path)
  })
}

let isTrackingRequestEvents = false

function trackRequestEvents (debugLog = undiciDebugLog) {
  if (isTrackingRequestEvents) {
    return
  }

  isTrackingRequestEvents = true

  diagnosticsChannel.channel('undici:request:headers').subscribe(evt => {
    const {
      request: { method, path, origin },
      response: { statusCode }
    } = evt
    debugLog(
      'received response to %s %s/%s - HTTP %d',
      method,
      origin,
      path,
      statusCode
    )
  })

  diagnosticsChannel.channel('undici:request:trailers').subscribe(evt => {
    const {
      request: { method, path, origin }
    } = evt
    debugLog('trailers received from %s %s/%s', method, origin, path)
  })

  diagnosticsChannel.channel('undici:request:error').subscribe(evt => {
    const {
      request: { method, path, origin },
      error
    } = evt
    debugLog(
      'request to %s %s/%s errored - %s',
      method,
      origin,
      path,
      error.message
    )
  })
}

let isTrackingWebSocketEvents = false

function trackWebSocketEvents (debugLog = websocketDebuglog) {
  if (isTrackingWebSocketEvents) {
    return
  }

  isTrackingWebSocketEvents = true

  diagnosticsChannel.channel('undici:websocket:open').subscribe(evt => {
    const {
      address: { address, port }
    } = evt
    debugLog('connection opened %s%s', address, port ? `:${port}` : '')
  })

  diagnosticsChannel.channel('undici:websocket:close').subscribe(evt => {
    const { websocket, code, reason } = evt
    debugLog(
      'closed connection to %s - %s %s',
      websocket.url,
      code,
      reason
    )
  })

  diagnosticsChannel.channel('undici:websocket:socket_error').subscribe(err => {
    debugLog('connection errored - %s', err.message)
  })

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(evt => {
    debugLog('ping received')
  })

  diagnosticsChannel.channel('undici:websocket:pong').subscribe(evt => {
    debugLog('pong received')
  })
}

if (undiciDebugLog.enabled || fetchDebuglog.enabled) {
  trackClientEvents(fetchDebuglog.enabled ? fetchDebuglog : undiciDebugLog)
  trackRequestEvents(fetchDebuglog.enabled ? fetchDebuglog : undiciDebugLog)
}

if (websocketDebuglog.enabled) {
  trackClientEvents(undiciDebugLog.enabled ? undiciDebugLog : websocketDebuglog)
  trackWebSocketEvents(websocketDebuglog)
}

module.exports = {
  channels
}
