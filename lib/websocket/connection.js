'use strict'

// TODO: crypto isn't available in all environments
const { randomBytes, createHash } = require('crypto')
const { Blob } = require('buffer')
const { uid, states, opcodes } = require('./constants')
const {
  kReadyState,
  kResponse,
  kExtensions,
  kProtocol,
  kBinaryType,
  kWebSocketURL,
  kController
} = require('./symbols')
const { fireEvent } = require('./util')
const { MessageEvent } = require('./events')
const { makeRequest } = require('../fetch/request')
const { fetching } = require('../fetch/index')
const { getGlobalDispatcher } = require('../..')

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
  // TODO: what if the headersList already has this header?
  // in the browser, this header is filtered, but here it isn't.
  request.headersList.append('upgrade', 'websocket')

  // 4. Append (`Connection`, `Upgrade`) to request’s header list.
  // TODO: same todo as above
  request.headersList.append('connection', 'upgrade')

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
  const permessageDeflate = 'permessage-deflate; 15'

  // 10. Append (`Sec-WebSocket-Extensions`, permessageDeflate) to
  //     request’s header list.
  request.headersList.append('sec-websocket-extensions', permessageDeflate)

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
        failWebsocketConnection(controller)
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
        failWebsocketConnection(controller)
        return
      }

      // 6. If the response includes a |Sec-WebSocket-Protocol| header field
      //    and this header field indicates the use of a subprotocol that was
      //    not present in the client's handshake (the server has indicated a
      //    subprotocol not requested by the client), the client MUST _Fail
      //    the WebSocket Connection_.
      const secProtocol = response.headersList.get('Sec-WebSocket-Protocol')

      if (secProtocol !== null && secProtocol !== request.headersList.get('Sec-WebSocketProtocol')) {
        failWebsocketConnection(controller)
        return
      }

      // processResponse is called when the "response’s header list has been received and initialized."
      // once this happens, the connection is open
      ws[kResponse] = response

      whenConnectionEstablished(ws)

      receiveData(ws)
    }
  })

  return controller
}

/**
 * @param {import('../fetch/index').Fetch} controller
 */
function failWebsocketConnection (controller) {
  controller.abort()
  // TODO: do we need to manually destroy the socket too?
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
}

class WebsocketFrame {
  /*
  https://www.rfc-editor.org/rfc/rfc6455#section-5.2
  0                   1                   2                   3
  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 +-+-+-+-+-------+-+-------------+-------------------------------+
 |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 | |1|2|3|       |K|             |                               |
 +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 |     Extended payload length continued, if payload len == 127  |
 + - - - - - - - - - - - - - - - +-------------------------------+
 |                               |Masking-key, if MASK set to 1  |
 +-------------------------------+-------------------------------+
 | Masking-key (continued)       |          Payload Data         |
 +-------------------------------- - - - - - - - - - - - - - - - +
 :                     Payload Data continued ...                :
 + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
 |                     Payload Data continued ...                |
 +---------------------------------------------------------------+
 */
  constructor () {
    this.FIN = false
    this.RSV1 = false
    this.RSV2 = false
    this.RSV3 = false
    this.isMasked = false
    this.maskKey = Buffer.alloc(4)
    this.payloadLength = 0
  }

  toBuffer () {
    // TODO: revisit the buffer size calculaton
    const buffer = Buffer.alloc(4 + 2 + this.payloadData.length)

    // set FIN flag
    if (this.FIN) {
      buffer[0] |= 0x80
    }

    // 2. set opcode
    buffer[0] = (buffer[0] & 0xF0) + this.opcode

    // 3. set masking flag and masking key
    if (this.isMasked) {
      buffer[1] |= 0x80
      buffer[2] = this.maskKey[0]
      buffer[3] = this.maskKey[1]
      buffer[4] = this.maskKey[2]
      buffer[5] = this.maskKey[3]
    }

    // 4. set payload length
    // TODO: support payload lengths larger than 125
    buffer[1] += this.payloadData.length

    if (this.isMasked) {
    // 6. mask payload data
      const maskKey = buffer.slice(2, 6)
      /*
     j                   = i MOD 4
     transformed-octet-i = original-octet-i XOR masking-key-octet-j
    */
      for (let i = 0; i < this.payloadData.length; i++) {
        buffer[6 + i] = this.payloadData[i] ^ maskKey[i % 4]
      }
    }

    return buffer
  }

  static from (buffer) {
    let nextByte = 0
    const frame = new WebsocketFrame()

    frame.FIN = (buffer[0] & 0x80) !== 0
    frame.RSV1 = (buffer[0] & 0x40) !== 0
    frame.RSV2 = (buffer[0] & 0x20) !== 0
    frame.RSV3 = (buffer[0] & 0x10) !== 0
    frame.opcode = buffer[0] & 0x0F
    frame.isMasked = (buffer[1] & 0x80) !== 0

    let payloadLength = 0x7F & buffer[1]

    nextByte = 2

    if (payloadLength === 126) {
      // If 126 the following 2 bytes interpreted as a 16-bit unsigned integer
      payloadLength = buffer.slice(2, 4).readUInt16LE()

      nextByte = 4
    } else if (payloadLength === 127) {
      // if 127 the following 8 bytes interpreted as a 64-bit unsigned integer
      payloadLength = buffer.slice(2, 10)
      nextByte = 10
    }

    frame.payloadLength = payloadLength
    if (frame.isMasked) {
      frame.maskKey = buffer.slice(nextByte, nextByte + 4)

      const maskedPayloadData = buffer.slice(nextByte + 4)
      frame.payloadData = Buffer.alloc(frame.payloadLength)

      for (let i = 0; i < frame.payloadLength; i++) {
        frame.payloadData[i] = maskedPayloadData[i] ^ frame.maskKey[i % 4]
      }
    } else {
      // we can't parse the payload inside the frame as the payload could be fragmented across multiple frames..
      frame.payloadData = buffer.slice(nextByte)
    }

    return frame
  }
}

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @param {import('./websocket').WebSocket} ws
 */
function receiveData (ws) {
  const { [kResponse]: response } = ws

  response.socket.on('data', (chunk) => {
    const frame = WebsocketFrame.from(chunk)
    // rsv bits are reserved for future use; if any aren't 0,
    // we currently can't handle them.
    if (frame.RSV1 || frame.RSV2 || frame.RSV3) {
      failWebsocketConnection(ws[kController])
      return
    }

    // const masked = (chunk[1] & 0x80) !== 0
    // const payloadLength = 0x7F & chunk[1]

    // If the frame comprises an unfragmented
    // message (Section 5.4), it is said that _A WebSocket Message Has Been
    // Received_

    // An unfragmented message consists of a single frame with the FIN
    // bit set (Section 5.2) and an opcode other than 0.
    if (frame.FIN && frame.opcode !== 0) {
      // 1. If ready state is not OPEN (1), then return.
      if (ws[kReadyState] !== states.OPEN) {
        return
      }

      // 2. Let dataForEvent be determined by switching on type and binary type:
      let dataForEvent
      if (frame.opcode === opcodes.TEXT) {
        // - type indicates that the data is Text
        //      a new DOMString containing data

        dataForEvent = new TextDecoder().decode(frame.payloadData)
      } else if (frame.opcode === opcodes.BINARY && ws[kBinaryType] === 'blob') {
        // - type indicates that the data is Binary and binary type is "blob"
        //      a new Blob object, created in the relevant Realm of the
        //      WebSocket object, that represents data as its raw data
        dataForEvent = new Blob([frame.payloadData])
      } else if (frame.opcode === opcodes.BINARY && ws[kBinaryType] === 'arraybuffer') {
        // - type indicates that the data is Binary and binary type is
        //   "arraybuffer"
        //      a new ArrayBuffer object, created in the relevant Realm of the
        //      WebSocket object, whose contents are data
        return new Uint8Array(frame.payloadData).buffer
      }

      // 3. Fire an event named message at the WebSocket object, using
      //    MessageEvent, with the origin attribute initialized to the
      //    serialization of the WebSocket object’s url's origin, and the data
      //    attribute initialized to dataForEvent.

      fireEvent('message', ws, MessageEvent, {
        origin: ws[kWebSocketURL].origin,
        data: dataForEvent
      })
    }
  })
}

module.exports = {
  establishWebSocketConnection,
  failWebsocketConnection,
  WebsocketFrame
}
