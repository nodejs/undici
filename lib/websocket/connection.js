'use strict'

// TODO: crypto isn't available in all environments
const { randomBytes, createHash } = require('crypto')
const { Headers } = require('../..')
const { uid } = require('./constants')

/**
 * @see https://websockets.spec.whatwg.org/#concept-websocket-connection-obtain
 * @param {URL} url
 * @param {import('../..').Agent} agent
 * @returns {import('stream').Duplex}
 */
async function obtainWebSocketConnection (url, agent) {
  // 1. Let host be url’s host.
  // 2. Let port be url’s port.
  // 3. Let resource name be U+002F (/), followed by the strings in url’s path
  //    (including empty strings), if any, separated from each other by U+002F
  //    (/).
  let { origin: host, port, pathname: resourceName, searchParams } = url

  // 4. If url’s query is non-empty, append U+003F (?), followed by url’s
  //    query, to resource name.

  // 5. Let secure be false, if url’s scheme is "http", and true otherwise.
  const secure = url.protocol !== 'http:' && url.protocol !== 'ws:'

  // 6. Follow the requirements stated in step 2 to 5, inclusive, of the first
  //    set of steps in section 4.1 of The WebSocket Protocol to establish a
  //    WebSocket connection, passing host, port, resource name and secure.
  const socket = await rfc6455OpeningHandshake(host, port, resourceName, secure, agent, searchParams)
    .catch((err) => console.log(err))

  // 7. If that established a connection, return it, and return failure otherwise.
  return socket
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-4.1
 * @param {string} host
 * @param {`${number}`} port
 * @param {string} resourceName
 * @param {boolean} secure
 * @param {import('../..').Agent} agent
 * @param {URLSearchParams} search
 */
function rfc6455OpeningHandshake (host, port, resourceName, secure, agent, search) {
  // TODO(@KhafraDev): pretty sure 'nonce' is a curse word in the UK?
  const nonce = randomBytes(16).toString('base64')

  return new Promise((resolve, reject) => agent.dispatch(
    {
      // The method of the request MUST be GET
      method: 'GET',
      // TODO(@KhafraDev): should this match the fetch spec limit of 20?
      // https://github.com/websockets/ws/blob/ea761933702bde061c2f5ac8aed5f62f9d5439ea/lib/websocket.js#L644
      maxRedirections: 10,
      origin: host + (port ? `:${port}` : ''),
      query: Object.fromEntries([...search]),
      // The "Request-URI" part of the request MUST match the /resource name/
      // defined in Section 3 (a relative URI) or be an absolute http/https
      // URI that, when parsed, has a /resource name/, /host/, and /port/ that
      // match the corresponding ws/wss URI.
      path: resourceName,
      headers: {
        // The request MUST contain a |Host| header field whose value contains
        // /host/ plus optionally ":" followed by /port/ (when not using the
        // default port).
        host: host + (port ? `:${port}` : ''),
        // The request MUST contain an |Upgrade| header field whose value MUST
        // include the "websocket" keyword.
        upgrade: 'websocket',
        // The request MUST contain a |Connection| header field whose value
        // MUST include the "Upgrade" token.
        connection: 'Upgrade',
        // The request MUST include a header field with the name
        // |Sec-WebSocket-Key|.  The value of this header field MUST be a nonce
        // consisting of a randomly selected 16-byte value that has been
        // base64-encoded (see Section 4 of [RFC4648]).  The nonce MUST be
        // selected randomly for each connection.
        'sec-websocket-key': nonce,
        // The request MUST include a header field with the name
        // |Sec-WebSocket-Version|.  The value of this header field MUST be 13.
        'sec-websocket-version': '13',
        // TODO(@KhafraDev): Sec-WebSocket-Protocol (#10)
        // TODO(@KhafraDev): Sec-WebSocket-Extensions (#11)
        'sec-websocket-extensions': 'permessage-deflate'
      },
      upgrade: 'websocket'
    },
    {
      onUpgrade (statusCode, headersList, socket) {
        // If the status code received from the server is not 101, the client
        // handles the response per HTTP [RFC2616] procedures.
        if (statusCode !== 101) {
          return
        }

        const headers = new Headers()
        for (let n = 0; n < headersList.length; n += 2) {
          const key = headersList[n + 0].toString('latin1')
          const val = headersList[n + 1].toString('latin1')

          headers.append(key, val)
        }

        // If the response lacks an |Upgrade| header field or the |Upgrade|
        // header field contains a value that is not an ASCII case-
        // insensitive match for the value "websocket", the client MUST
        // _Fail the WebSocket Connection_.
        if (headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          failTheWebSocketConnection(socket)
          reject()
          return
        }

        // If the response lacks a |Connection| header field or the
        // |Connection| header field doesn't contain a token that is an
        // ASCII case-insensitive match for the value "Upgrade", the client
        // MUST _Fail the WebSocket Connection_.
        if (headers.get('Connection')?.toLowerCase() !== 'upgrade') {
          failTheWebSocketConnection(socket)
          reject()
          return
        }

        // If the response lacks a |Sec-WebSocket-Accept| header field or
        // the |Sec-WebSocket-Accept| contains a value other than the
        // base64-encoded SHA-1 of the concatenation of the |Sec-WebSocket-
        // Key| (as a string, not base64-decoded) with the string "258EAFA5-
        // E914-47DA-95CA-C5AB0DC85B11" but ignoring any leading and
        // trailing whitespace, the client MUST _Fail the WebSocket
        // Connection_.
        const secWSAccept = headers.get('Sec-WebSocket-Accept')
        const digest = secWSAccept
          ? createHash('SHA-1').update(nonce + uid).digest('base64')
          : null

        if (secWSAccept !== digest) {
          failTheWebSocketConnection(socket)
          reject()
          return
        }

        // If the response includes a |Sec-WebSocket-Extensions| header
        // field and this header field indicates the use of an extension
        // that was not present in the client's handshake (the server has
        // indicated an extension not requested by the client), the client
        // MUST _Fail the WebSocket Connection_.  (The parsing of this
        // header field to determine which extensions are requested is
        // discussed in Section 9.1.)
        // TODO

        // If the response includes a |Sec-WebSocket-Protocol| header field
        // and this header field indicates the use of a subprotocol that was
        // not present in the client's handshake (the server has indicated a
        // subprotocol not requested by the client), the client MUST _Fail
        // the WebSocket Connection_.
        // TODO

        resolve({
          socket,
          headers
        })
      },

      onError (error) {
        reject(error)
      },

      onConnect () {},
      onHeaders () {},
      onData () {},
      onComplete () {}
    }
  ))
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.7
 * @param {import('stream').Duplex} duplex
 */
function failTheWebSocketConnection (duplex) {
  if (!duplex.destroyed) {
    duplex.destroy()
  }
}

module.exports = {
  obtainWebSocketConnection
}
