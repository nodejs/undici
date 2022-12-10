'use strict'

// TODO: crypto isn't available in all environments
const { randomBytes, createHash } = require('crypto')
const { Blob } = require('buffer')
const diagnosticsChannel = require('diagnostics_channel')
const { uid, states, opcodes } = require('./constants')
const {
  kReadyState,
  kResponse,
  kExtensions,
  kProtocol,
  kBinaryType,
  kWebSocketURL,
  kController,
  kClosingFrame,
  kSentClose
} = require('./symbols')
const { fireEvent, isEstablished, isClosed, isClosing } = require('./util')
const { MessageEvent, CloseEvent } = require('./events')
const { WebsocketFrame, WebsocketFrameSend } = require('./frame')
const { WebsocketHooks } = require('./hooks')
const { makeRequest } = require('../fetch/request')
const { fetching } = require('../fetch/index')
const { getGlobalDispatcher } = require('../..')

const channels = {}
channels.ping = diagnosticsChannel.channel('undici:websocket:ping')
channels.pong = diagnosticsChannel.channel('undici:websocket:pong')
channels.open = diagnosticsChannel.channel('undici:websocket:open')
channels.close = diagnosticsChannel.channel('undici:websocket:close')

/**
 * @see https://websockets.spec.whatwg.org/#concept-websocket-establish
 * @param {URL} url
 * @param {string|string[]} protocols
 * @param {import('./websocket').WebSocket} ws
 */
function establishWebSocketConnection (url, protocols, ws) {
  // 1. Let requestURL be a copy of url, with its scheme set to "http", if url’s
  //    scheme is "ws", and to "https" otherwise.
  const requestURL = url

  requestURL.protocol = url.protocol === 'ws:' ? 'http:' : 'https:'

  // 2. Let request be a new request, whose URL is requestURL, client is client,
  //    service-workers mode is "none", referrer is "no-referrer", mode is
  //    "websocket", credentials mode is "include", cache mode is "no-store" ,
  //    and redirect mode is "error".
  const request = makeRequest({
    urlList: [requestURL],
    serviceWorkers: 'none',
    referrer: 'no-referrer',
    mode: 'websocket',
    credentials: 'include',
    cache: 'no-store',
    redirect: 'error'
  })

  // 3. Append (`Upgrade`, `websocket`) to request’s header list.
  // 4. Append (`Connection`, `Upgrade`) to request’s header list.
  // Note: both of these are handled by undici currently.
  // https://github.com/nodejs/undici/blob/68c269c4144c446f3f1220951338daef4a6b5ec4/lib/client.js#L1397

  // 5. Let keyValue be a nonce consisting of a randomly selected
  //    16-byte value that has been forgiving-base64-encoded and
  //    isomorphic encoded.
  const keyValue = randomBytes(16).toString('base64')

  // 6. Append (`Sec-WebSocket-Key`, keyValue) to request’s
  //    header list.
  request.headersList.append('sec-websocket-key', keyValue)

  // 7. Append (`Sec-WebSocket-Version`, `13`) to request’s
  //    header list.
  request.headersList.append('sec-websocket-version', '13')

  // 8. For each protocol in protocols, combine
  //    (`Sec-WebSocket-Protocol`, protocol) in request’s header
  //    list.
  for (const protocol of protocols) {
    request.headersList.append('sec-websocket-protocol', protocol)
  }

  // 9. Let permessageDeflate be a user-agent defined
  //    "permessage-deflate" extension header value.
  // https://github.com/mozilla/gecko-dev/blob/ce78234f5e653a5d3916813ff990f053510227bc/netwerk/protocol/websocket/WebSocketChannel.cpp#L2673
  // TODO: enable once permessage-deflate is supported
  const permessageDeflate = '' // 'permessage-deflate; 15'

  // 10. Append (`Sec-WebSocket-Extensions`, permessageDeflate) to
  //     request’s header list.
  // request.headersList.append('sec-websocket-extensions', permessageDeflate)

  // 11. Fetch request with useParallelQueue set to true, and
  //     processResponse given response being these steps:
  const controller = fetching({
    request,
    useParallelQueue: true,
    dispatcher: getGlobalDispatcher(),
    processResponse (response) {
      // 1. If response is a network error or its status is not 101,
      //    fail the WebSocket connection.
      if (response.type === 'error' || response.status !== 101) {
        failWebsocketConnection(controller)
        return
      }

      // 2. If protocols is not the empty list and extracting header
      //    list values given `Sec-WebSocket-Protocol` and response’s
      //    header list results in null, failure, or the empty byte
      //    sequence, then fail the WebSocket connection.
      if (protocols.length !== 0 && !response.headersList.get('Sec-WebSocket-Protocol')) {
        failWebsocketConnection(controller)
        return
      }

      // 3. Follow the requirements stated step 2 to step 6, inclusive,
      //    of the last set of steps in section 4.1 of The WebSocket
      //    Protocol to validate response. This either results in fail
      //    the WebSocket connection or the WebSocket connection is
      //    established.

      // 2. If the response lacks an |Upgrade| header field or the |Upgrade|
      //    header field contains a value that is not an ASCII case-
      //    insensitive match for the value "websocket", the client MUST
      //    _Fail the WebSocket Connection_.
      if (response.headersList.get('Upgrade')?.toLowerCase() !== 'websocket') {
        failWebsocketConnection(controller)
        return
      }

      // 3. If the response lacks a |Connection| header field or the
      //    |Connection| header field doesn't contain a token that is an
      //    ASCII case-insensitive match for the value "Upgrade", the client
      //    MUST _Fail the WebSocket Connection_.
      if (response.headersList.get('Connection')?.toLowerCase() !== 'upgrade') {
        failWebsocketConnection(controller)
        return
      }

      // 4. If the response lacks a |Sec-WebSocket-Accept| header field or
      //    the |Sec-WebSocket-Accept| contains a value other than the
      //    base64-encoded SHA-1 of the concatenation of the |Sec-WebSocket-
      //    Key| (as a string, not base64-decoded) with the string "258EAFA5-
      //    E914-47DA-95CA-C5AB0DC85B11" but ignoring any leading and
      //    trailing whitespace, the client MUST _Fail the WebSocket
      //    Connection_.
      const secWSAccept = response.headersList.get('Sec-WebSocket-Accept')
      const digest = createHash('sha1').update(keyValue + uid).digest('base64')
      if (secWSAccept !== digest) {
        failWebsocketConnection(controller, response.socket)
        return
      }

      // 5. If the response includes a |Sec-WebSocket-Extensions| header
      //    field and this header field indicates the use of an extension
      //    that was not present in the client's handshake (the server has
      //    indicated an extension not requested by the client), the client
      //    MUST _Fail the WebSocket Connection_.  (The parsing of this
      //    header field to determine which extensions are requested is
      //    discussed in Section 9.1.)
      const secExtension = response.headersList.get('Sec-WebSocket-Extensions')

      if (secExtension !== null && secExtension !== permessageDeflate) {
        failWebsocketConnection(controller, response.socket)
        return
      }

      // 6. If the response includes a |Sec-WebSocket-Protocol| header field
      //    and this header field indicates the use of a subprotocol that was
      //    not present in the client's handshake (the server has indicated a
      //    subprotocol not requested by the client), the client MUST _Fail
      //    the WebSocket Connection_.
      const secProtocol = response.headersList.get('Sec-WebSocket-Protocol')

      if (secProtocol !== null && secProtocol !== request.headersList.get('Sec-WebSocket-Protocol')) {
        failWebsocketConnection(controller, response.socket)
        return
      }

      // processResponse is called when the "response’s header list has been received and initialized."
      // once this happens, the connection is open
      ws[kResponse] = response

      whenConnectionEstablished(ws)

      receiveData(ws)

      socketClosed(ws)
    }
  })

  return controller
}

/**
 * @param {import('../fetch/index').Fetch} controller
 * @param {import('net').Socket|import('tls').TLSSocket|undefined} socket
 */
function failWebsocketConnection (controller, socket) {
  controller.abort()

  if (socket && !socket.destroyed) {
    socket.destroy()
  }
}

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @param {import('./websocket').WebSocket} ws
 */
function whenConnectionEstablished (ws) {
  const { [kResponse]: response } = ws

  // 1. Change the ready state to OPEN (1).
  ws[kReadyState] = states.OPEN

  // 2. Change the extensions attribute’s value to the extensions in use, if
  //    it is not the null value.
  // https://datatracker.ietf.org/doc/html/rfc6455#section-9.1
  const extensions = response.headersList.get('sec-websocket-extensions')

  if (extensions !== null) {
    ws[kExtensions] = extensions
  }

  // 3. Change the protocol attribute’s value to the subprotocol in use, if
  //    it is not the null value.
  // https://datatracker.ietf.org/doc/html/rfc6455#section-1.9
  const protocol = response.headersList.get('sec-websocket-protocol')

  if (protocol !== null) {
    ws[kProtocol] = protocol
  }

  // 4. Fire an event named open at the WebSocket object.
  fireEvent('open', ws)

  if (channels.open.hasSubscribers) {
    channels.open.publish({
      address: response.socket.address(),
      protocol,
      extensions
    })
  }
}

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @param {import('./websocket').WebSocket} ws
 */
function receiveData (ws) {
  const { [kResponse]: response } = ws

  /** @type {WebsocketFrame|undefined} */
  let frame

  response.socket.on('data', (chunk) => {
    const receivedFrame = WebsocketFrame.from(chunk)
    const opcode = receivedFrame.opcode

    if (
      (opcode === opcodes.CONTINUATION && !receivedFrame.fragmented) ||
      ((opcode === opcodes.TEXT || opcode === opcodes.BINARY) && receivedFrame.fragmented) ||
      (opcode >= opcodes.CLOSE && opcode <= opcodes.PONG && !receivedFrame.fin) ||
      (opcode >= opcodes.CLOSE && opcode <= opcodes.PONG && receivedFrame.payloadLength > 127) ||
      (opcode === opcodes.CLOSE && receivedFrame.payloadLength === 1) ||
      (opcode >= 0x3 && opcode <= 0x7) || // reserved
      (opcode >= 0xB) // reserved
    ) {
      failWebsocketConnection(ws[kController], response.socket)
      return
    }

    if (!frame) {
      frame = receivedFrame
      frame.terminated = frame.dataOffset === frame.payloadLength // message complete
    } else {
      // A fragmented message consists of a single frame with the FIN bit
      // clear and an opcode other than 0, followed by zero or more frames
      // with the FIN bit clear and the opcode set to 0, and terminated by
      // a single frame with the FIN bit set and an opcode of 0.

      if (opcode === opcodes.CONTINUATION) {
        if (opcode === opcodes.CONTINUATION) {
          frame.terminated = true
        }

        frame.addFrame(receivedFrame.data)
      } else if (opcode === opcodes.PING) {
        return handlePing(response.socket, ws, receivedFrame)
      } else if (opcode === opcodes.PONG) {
        return handlePong(receivedFrame)
      }
    }

    // If a control frame (Section 5.5) is
    // received, the frame MUST be handled as defined by Section 5.5.
    if (frame.opcode === opcodes.PING) {
      return handlePing(response.socket, ws, frame)
    } else if (frame.opcode === opcodes.PONG) {
      return handlePong(frame)
    } else if (frame.opcode === opcodes.CLOSE) {
      // Upon either sending or receiving a Close control frame, it is said
      // that _The WebSocket Closing Handshake is Started_ and that the
      // WebSocket connection is in the CLOSING state.
      ws[kReadyState] = states.CLOSING
      ws[kClosingFrame] = frame

      if (!ws[kSentClose]) {
        const result = frame.parseCloseBody(true)

        // If this Close control frame contains no status code, _The WebSocket
        // Connection Close Code_ is considered to be 1005.
        const code = result?.code ?? 1005

        const closeFrame = new WebsocketFrameSend(Buffer.allocUnsafe(2))
        // When
        // sending a Close frame in response, the endpoint typically echos the
        // status code it received.
        closeFrame.frameData.writeUInt16BE(code, 0)

        response.socket.write(
          closeFrame.createFrame(opcodes.CLOSE),
          () => response.socket.end()
        )
        ws[kSentClose] = true
      }

      frame = undefined

      return
    }

    // rsv bits are reserved for future use; if any aren't 0,
    // we currently can't handle them.
    if (frame.rsv1 || frame.rsv2 || frame.rsv3) {
      failWebsocketConnection(ws[kController])
      return
    }

    // If the frame comprises an unfragmented
    // message (Section 5.4), it is said that _A WebSocket Message Has Been
    // Received_

    if (frame.terminated) {
      // 1. If ready state is not OPEN (1), then return.
      if (ws[kReadyState] !== states.OPEN) {
        return
      }

      // 2. Let dataForEvent be determined by switching on type and binary type:
      let dataForEvent

      if (frame.opcode === opcodes.TEXT) {
        const { data } = frame

        if (!WebsocketHooks.get('utf-8')(data)) {
          failWebsocketConnection(ws[kController], response.socket)
          return
        }

        // - type indicates that the data is Text
        //      a new DOMString containing data
        dataForEvent = new TextDecoder().decode(data)
      } else if (frame.opcode === opcodes.BINARY) {
        if (ws[kBinaryType] === 'blob') {
          // - type indicates that the data is Binary and binary type is "blob"
          //      a new Blob object, created in the relevant Realm of the
          //      WebSocket object, that represents data as its raw data
          dataForEvent = new Blob([frame.data])
        } else {
          // - type indicates that the data is Binary and binary type is
          //   "arraybuffer"
          //      a new ArrayBuffer object, created in the relevant Realm of the
          //      WebSocket object, whose contents are data
          dataForEvent = new Uint8Array(frame.data).buffer
        }
      }

      // 3. Fire an event named message at the WebSocket object, using
      //    MessageEvent, with the origin attribute initialized to the
      //    serialization of the WebSocket object’s url's origin, and the data
      //    attribute initialized to dataForEvent.
      fireEvent('message', ws, MessageEvent, {
        origin: ws[kWebSocketURL].origin,
        data: dataForEvent
      })

      frame = undefined
    }
  })
}

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.4
 * @param {import('./websocket').WebSocket} ws
 */
function socketClosed (ws) {
  const { [kResponse]: response } = ws

  response.socket.on('close', () => {
    const wasClean = ws[kReadyState] === states.CLOSING || isEstablished(ws)

    let code = 1005
    let reason = ''

    if (ws[kClosingFrame]) {
      /** @type {ReturnType<WebsocketFrame['parseCloseBody']} */
      const result = ws[kClosingFrame].parseCloseBody()

      if (result === null) {
        return
      }

      code = result.code ?? 1005
      reason = result.reason
    } else if (!ws[kSentClose]) {
      // If _The WebSocket
      // Connection is Closed_ and no Close control frame was received by the
      // endpoint (such as could occur if the underlying transport connection
      // is lost), _The WebSocket Connection Close Code_ is considered to be
      // 1006.
      code = 1006
    }

    // 1. Change the ready state to CLOSED (3).
    ws[kReadyState] = states.CLOSED

    // 2. If the user agent was required to fail the WebSocket
    //    connection, or if the WebSocket connection was closed
    //    after being flagged as full, fire an event named error
    //    at the WebSocket object.
    // TODO

    // 3. Fire an event named close at the WebSocket object,
    //    using CloseEvent, with the wasClean attribute
    //    initialized to true if the connection closed cleanly
    //    and false otherwise, the code attribute initialized to
    //    the WebSocket connection close code, and the reason
    //    attribute initialized to the result of applying UTF-8
    //    decode without BOM to the WebSocket connection close
    //    reason.
    fireEvent('close', ws, CloseEvent, {
      wasClean, code, reason
    })

    if (channels.close.hasSubscribers) {
      channels.close.publish({
        websocket: ws,
        code,
        reason
      })
    }
  })
}

/**
 * @param {WebsocketFrame} frame
 * @param {import('net').Socket} socket
 * @param {import('./websocket').WebSocket} ws
 */
function handlePing (socket, ws, frame) {
  //  Upon receipt of a Ping frame, an endpoint MUST send a Pong frame in
  // response, unless it already received a Close frame.  It SHOULD
  // respond with Pong frame as soon as is practical.

  if (isClosing(ws) || isClosed(ws)) {
    return
  }

  if (channels.ping.hasSubscribers) {
    channels.ping.publish({ frame })
  }

  // A Pong frame sent in response to a Ping frame must have identical
  // "Application data" as found in the message body of the Ping frame
  // being replied to.
  const sendFrame = new WebsocketFrameSend(frame.data)
  const buffer = sendFrame.createFrame(opcodes.PONG)

  socket.write(buffer)
}

/**
 * @param {WebsocketFrame} frame
 */
function handlePong (frame) {
  // A Pong frame sent in response to a Ping frame must have identical
  // "Application data" as found in the message body of the Ping frame
  // being replied to.

  if (channels.pong.hasSubscribers) {
    channels.pong.publish({ frame })
  }

  // TODO
}

module.exports = {
  establishWebSocketConnection,
  failWebsocketConnection
}
