'use strict'

// TODO: crypto isn't available in all environments
const { randomBytes, createHash } = require('crypto')
const { Blob, constants } = require('buffer')
const { uid, states, opcodes } = require('./constants')
const {
  kReadyState,
  kResponse,
  kExtensions,
  kProtocol,
  kBinaryType,
  kWebSocketURL,
  kController,
  kClosingFrame
} = require('./symbols')
const { fireEvent, isEstablished } = require('./util')
const { MessageEvent, CloseEvent } = require('./events')
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

      socketClosed(ws)
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
  constructor ({ data = Buffer.alloc(0), opcode = constants.TEXT, fin = false, rsv1 = false, rsv2 = false, rsv3 = false, mask = false, maskKey } = {}) {
    this.fin = fin
    this.rsv1 = rsv1
    this.rsv2 = rsv2
    this.rsv3 = rsv3
    this.opcode = opcode

    // if mask key is set then this means that the mask flag will be set to true
    this.maskKey = maskKey
    this.data = data

    // generate a random mask key if mask is set to true and maskKey is not defined
    if (mask && !maskKey) {
      this.mask()
    }
  }

  toBuffer () {
    const buffer = Buffer.alloc(this.byteLength())
    // set FIN flag
    if (this.fin) {
      buffer[0] |= 0x80
    }

    // 2. set opcode
    buffer[0] = (buffer[0] & 0xF0) + this.opcode

    // 3. set masking flag and masking key
    if (this.maskKey) {
      // set masked flag to true
      buffer[1] |= 0x80
      // set mask key (4 bytes)
      buffer[2] = this.maskKey[0]
      buffer[3] = this.maskKey[1]
      buffer[4] = this.maskKey[2]
      buffer[5] = this.maskKey[3]
    }

    // 4. set payload length
    // TODO: support payload lengths larger than 125
    buffer[1] += this.data.length

    if (this.maskKey) {
    // 6. mask payload data
      /*
     j                   = i MOD 4
     transformed-octet-i = original-octet-i XOR masking-key-octet-j
    */
      for (let i = 0; i < this.data.length; i++) {
        buffer[6 + i] = this.data[i] ^ this.maskKey[i % 4]
      }
    }

    return buffer
  }

  mask () {
    this.maskKey = Buffer.allocUnsafe(4)

    for (let i = 0; i < 4; i++) {
      this.maskKey[i] = Math.floor(Math.random() * 256)
    }
  }

  byteLength () {
    // FIN (1), RSV1 (1), RSV2 (1), RSV3 (1), opcode (4) = 1 byte
    let size = 1
    // payload length (7) + mask flag (1) = 1 byte
    size += 1

    if (this.data.length > 2 ** 16 - 1) {
      // unsigned 64 bit number = 8 bytes
      size += 8
    } else if (this.data.length > 2 ** 8 - 1) {
      // unsigned 16 bit number = 2 bytes
      size += 2
    }

    if (this.maskKey) {
      // masking key = 4 bytes
      size += 4
    }

    // payload data size
    size += this.data.length

    return size
  }

  static from (buffer) {
    const fin = (buffer[0] & 0x80) !== 0
    const rsv1 = (buffer[0] & 0x40) !== 0
    const rsv2 = (buffer[0] & 0x20) !== 0
    const rsv3 = (buffer[0] & 0x10) !== 0
    const opcode = buffer[0] & 0x0F
    const masked = (buffer[1] & 0x80) !== 0
    const frame = new WebsocketFrame({ fin, rsv1, rsv2, rsv3, opcode })

    let payloadLength = 0x7F & buffer[1]
    let lastExaminedByte = 1
    if (payloadLength === 126) {
      // If 126 the following 2 bytes interpreted as a 16-bit unsigned integer
      lastExaminedByte = 4
      payloadLength = Number(buffer.slice(2, 4).readUInt16BE())
    } else if (payloadLength === 127) {
      // if 127 the following 8 bytes interpreted as a 64-bit unsigned integer
      lastExaminedByte = 10
      payloadLength = Number(buffer.slice(2, lastExaminedByte).readBigUInt64BE())
    }

    if (masked) {
      lastExaminedByte = lastExaminedByte + 4
      frame.maskKey = buffer.slice(lastExaminedByte, lastExaminedByte)
    }

    // check if the frame is complete
    if (payloadLength > buffer.length - lastExaminedByte) {
      return
    }

    if (frame.maskKey) {
      const maskedPayloadData = buffer.slice(lastExaminedByte, lastExaminedByte + payloadLength + 1)
      frame.data = Buffer.allocUnsafe(payloadLength)

      for (let i = 0; i < payloadLength; i++) {
        frame.data[i] = maskedPayloadData[i] ^ frame.maskKey[i % 4]
      }
    } else {
      // we can't parse the payload inside the frame as the payload could be fragmented across multiple frames..
      frame.data = buffer.slice(lastExaminedByte, lastExaminedByte + payloadLength + 1)
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
  // TODO: use the payload length from the first chunk instead of 0
  let buffer = Buffer.alloc(0)
  response.socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])

    const frame = WebsocketFrame.from(buffer)

    if (!frame) {
      // frame is still incomplete, do nothing and wait for the next chunk
      return
    } else {
      buffer = Buffer.alloc(0)
    }

    if (frame.opcode === opcodes.CLOSE) {
      // Upon either sending or receiving a Close control frame, it is said
      // that _The WebSocket Closing Handshake is Started_ and that the
      // WebSocket connection is in the CLOSING state.
      ws[kReadyState] = states.CLOSING
      ws[kClosingFrame] = frame
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

    // An unfragmented message consists of a single frame with the FIN
    // bit set (Section 5.2) and an opcode other than 0.
    if (frame.fin && frame.opcode !== 0) {
      // 1. If ready state is not OPEN (1), then return.
      if (ws[kReadyState] !== states.OPEN) {
        return
      }

      // 2. Let dataForEvent be determined by switching on type and binary type:
      let dataForEvent

      if (frame.opcode === opcodes.TEXT) {
        // - type indicates that the data is Text
        //      a new DOMString containing data
        dataForEvent = new TextDecoder().decode(frame.data)
      } else if (frame.opcode === opcodes.BINARY && ws[kBinaryType] === 'blob') {
        // - type indicates that the data is Binary and binary type is "blob"
        //      a new Blob object, created in the relevant Realm of the
        //      WebSocket object, that represents data as its raw data
        dataForEvent = new Blob([frame.data])
      } else if (frame.opcode === opcodes.BINARY && ws[kBinaryType] === 'arraybuffer') {
        // - type indicates that the data is Binary and binary type is
        //   "arraybuffer"
        //      a new ArrayBuffer object, created in the relevant Realm of the
        //      WebSocket object, whose contents are data
        return new Uint8Array(frame.data).buffer
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

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.4
 * @param {import('./websocket').WebSocket} ws
 */
function socketClosed (ws) {
  const { [kResponse]: response } = ws

  response.socket.on('close', () => {
    const wasClean = ws[kReadyState] === states.CLOSING || isEstablished(ws)

    /** @type {WebsocketFrame} */
    const buffer = ws[kClosingFrame]
    let reason = buffer.data.toString('utf-8', 4)

    // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.5
    let code = ws[kReadyState] === states.CLOSED ? 1006 : 1005

    if (buffer.data.length >= 2) {
      code = buffer.data.readUInt16BE(2)
    }

    // 1. Change the ready state to CLOSED (3).
    ws[kReadyState] = states.CLOSED

    // Remove BOM
    if (reason.startsWith(String.fromCharCode(0xEF, 0xBB, 0xBF))) {
      reason = reason.slice(3)
    }

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
  })
}

module.exports = {
  establishWebSocketConnection,
  failWebsocketConnection,
  WebsocketFrame
}
