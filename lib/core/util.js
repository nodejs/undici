'use strict'

const assert = require('assert')
const { kDestroyed, kBodyUsed } = require('./symbols')
const { IncomingMessage } = require('http')
const stream = require('stream')
const net = require('net')
const { InvalidArgumentError } = require('./errors')
const { Blob } = require('buffer')
const nodeUtil = require('util')
const { stringify } = require('querystring')

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(v => Number(v))

function nop () {}

function isStream (obj) {
  return obj && typeof obj.pipe === 'function'
}

// based on https://github.com/node-fetch/fetch-blob/blob/8ab587d34080de94140b54f07168451e7d0b655e/index.js#L229-L241 (MIT License)
function isBlobLike (object) {
  return (Blob && object instanceof Blob) || (
    object &&
    typeof object === 'object' &&
    (typeof object.stream === 'function' ||
      typeof object.arrayBuffer === 'function') &&
    /^(Blob|File)$/.test(object[Symbol.toStringTag])
  )
}

function buildURL (url, queryParams) {
  if (url.includes('?') || url.includes('#')) {
    throw new Error('Query params cannot be passed when url already contains "?" or "#".')
  }

  const stringified = stringify(queryParams)

  if (stringified) {
    url += '?' + stringified
  }

  return url
}

function parseURL (url) {
  if (typeof url === 'string') {
    url = new URL(url)
  }

  if (!url || typeof url !== 'object') {
    throw new InvalidArgumentError('invalid url')
  }

  if (url.port != null && url.port !== '' && !Number.isFinite(parseInt(url.port))) {
    throw new InvalidArgumentError('invalid port')
  }

  if (url.path != null && typeof url.path !== 'string') {
    throw new InvalidArgumentError('invalid path')
  }

  if (url.pathname != null && typeof url.pathname !== 'string') {
    throw new InvalidArgumentError('invalid pathname')
  }

  if (url.hostname != null && typeof url.hostname !== 'string') {
    throw new InvalidArgumentError('invalid hostname')
  }

  if (url.origin != null && typeof url.origin !== 'string') {
    throw new InvalidArgumentError('invalid origin')
  }

  if (!/^https?:/.test(url.origin || url.protocol)) {
    throw new InvalidArgumentError('invalid protocol')
  }

  if (!(url instanceof URL)) {
    const port = url.port != null
      ? url.port
      : (url.protocol === 'https:' ? 443 : 80)
    let origin = url.origin != null
      ? url.origin
      : `${url.protocol}//${url.hostname}:${port}`
    let path = url.path != null
      ? url.path
      : `${url.pathname || ''}${url.search || ''}`

    if (origin.endsWith('/')) {
      origin = origin.substring(0, origin.length - 1)
    }

    if (path && !path.startsWith('/')) {
      path = `/${path}`
    }
    // new URL(path, origin) is unsafe when `path` contains an absolute URL
    // From https://developer.mozilla.org/en-US/docs/Web/API/URL/URL:
    // If first parameter is a relative URL, second param is required, and will be used as the base URL.
    // If first parameter is an absolute URL, a given second param will be ignored.
    url = new URL(origin + path)
  }

  return url
}

function parseOrigin (url) {
  url = parseURL(url)

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new InvalidArgumentError('invalid url')
  }

  return url
}

function getHostname (host) {
  if (host[0] === '[') {
    const idx = host.indexOf(']')

    assert(idx !== -1)
    return host.substr(1, idx - 1)
  }

  const idx = host.indexOf(':')
  if (idx === -1) return host

  return host.substr(0, idx)
}

// IP addresses are not valid server names per RFC6066
// > Currently, the only server names supported are DNS hostnames
function getServerName (host) {
  if (!host) {
    return null
  }

  assert.strictEqual(typeof host, 'string')

  const servername = getHostname(host)
  if (net.isIP(servername)) {
    return ''
  }

  return servername
}

function deepClone (obj) {
  return JSON.parse(JSON.stringify(obj))
}

function isAsyncIterable (obj) {
  return !!(obj != null && typeof obj[Symbol.asyncIterator] === 'function')
}

function isIterable (obj) {
  return !!(obj != null && (typeof obj[Symbol.iterator] === 'function' || typeof obj[Symbol.asyncIterator] === 'function'))
}

function bodyLength (body) {
  if (body == null) {
    return 0
  } else if (isStream(body)) {
    const state = body._readableState
    return state && state.ended === true && Number.isFinite(state.length)
      ? state.length
      : null
  } else if (isBlobLike(body)) {
    return body.size != null ? body.size : null
  } else if (isBuffer(body)) {
    return body.byteLength
  }

  return null
}

function isDestroyed (stream) {
  return !stream || !!(stream.destroyed || stream[kDestroyed])
}

function isReadableAborted (stream) {
  const state = stream && stream._readableState
  return isDestroyed(stream) && state && !state.endEmitted
}

function destroy (stream, err) {
  if (!isStream(stream) || isDestroyed(stream)) {
    return
  }

  if (typeof stream.destroy === 'function') {
    if (Object.getPrototypeOf(stream).constructor === IncomingMessage) {
      // See: https://github.com/nodejs/node/pull/38505/files
      stream.socket = null
    }
    stream.destroy(err)
  } else if (err) {
    process.nextTick((stream, err) => {
      stream.emit('error', err)
    }, stream, err)
  }

  if (stream.destroyed !== true) {
    stream[kDestroyed] = true
  }
}

const KEEPALIVE_TIMEOUT_EXPR = /timeout=(\d+)/
function parseKeepAliveTimeout (val) {
  const m = val.toString().match(KEEPALIVE_TIMEOUT_EXPR)
  return m ? parseInt(m[1], 10) * 1000 : null
}

function parseHeaders (headers, obj = {}) {
  for (let i = 0; i < headers.length; i += 2) {
    const key = headers[i].toString().toLowerCase()
    let val = obj[key]

    const encoding = key.length === 19 && key === 'content-disposition'
      ? 'latin1'
      : 'utf8'

    if (!val) {
      if (Array.isArray(headers[i + 1])) {
        obj[key] = headers[i + 1]
      } else {
        obj[key] = headers[i + 1].toString(encoding)
      }
    } else {
      if (!Array.isArray(val)) {
        val = [val]
        obj[key] = val
      }
      val.push(headers[i + 1].toString(encoding))
    }
  }
  return obj
}

function parseRawHeaders (headers) {
  const ret = []
  for (let n = 0; n < headers.length; n += 2) {
    const key = headers[n + 0].toString()

    const encoding = key.length === 19 && key.toLowerCase() === 'content-disposition'
      ? 'latin1'
      : 'utf8'

    const val = headers[n + 1].toString(encoding)

    ret.push(key, val)
  }
  return ret
}

function isBuffer (buffer) {
  // See, https://github.com/mcollina/undici/pull/319
  return buffer instanceof Uint8Array || Buffer.isBuffer(buffer)
}

function validateHandler (handler, method, upgrade) {
  if (!handler || typeof handler !== 'object') {
    throw new InvalidArgumentError('handler must be an object')
  }

  if (typeof handler.onConnect !== 'function') {
    throw new InvalidArgumentError('invalid onConnect method')
  }

  if (typeof handler.onError !== 'function') {
    throw new InvalidArgumentError('invalid onError method')
  }

  if (typeof handler.onBodySent !== 'function' && handler.onBodySent !== undefined) {
    throw new InvalidArgumentError('invalid onBodySent method')
  }

  if (upgrade || method === 'CONNECT') {
    if (typeof handler.onUpgrade !== 'function') {
      throw new InvalidArgumentError('invalid onUpgrade method')
    }
  } else {
    if (typeof handler.onHeaders !== 'function') {
      throw new InvalidArgumentError('invalid onHeaders method')
    }

    if (typeof handler.onData !== 'function') {
      throw new InvalidArgumentError('invalid onData method')
    }

    if (typeof handler.onComplete !== 'function') {
      throw new InvalidArgumentError('invalid onComplete method')
    }
  }
}

// A body is disturbed if it has been read from and it cannot
// be re-used without losing state or data.
function isDisturbed (body) {
  return !!(body && (
    stream.isDisturbed
      ? stream.isDisturbed(body) || body[kBodyUsed] // TODO (fix): Why is body[kBodyUsed] needed?
      : body[kBodyUsed] ||
        body.readableDidRead ||
        (body._readableState && body._readableState.dataEmitted) ||
        isReadableAborted(body)
  ))
}

function isErrored (body) {
  return !!(body && (
    stream.isErrored
      ? stream.isErrored(body)
      : /state: 'errored'/.test(nodeUtil.inspect(body)
      )))
}

function isReadable (body) {
  return !!(body && (
    stream.isReadable
      ? stream.isReadable(body)
      : /state: 'readable'/.test(nodeUtil.inspect(body)
      )))
}

function getSocketInfo (socket) {
  return {
    localAddress: socket.localAddress,
    localPort: socket.localPort,
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort,
    remoteFamily: socket.remoteFamily,
    timeout: socket.timeout,
    bytesWritten: socket.bytesWritten,
    bytesRead: socket.bytesRead
  }
}

let ReadableStream
function ReadableStreamFrom (iterable) {
  if (!ReadableStream) {
    ReadableStream = require('stream/web').ReadableStream
  }

  if (ReadableStream.from) {
    // https://github.com/whatwg/streams/pull/1083
    return ReadableStream.from(iterable)
  }

  let iterator
  return new ReadableStream(
    {
      async start () {
        iterator = iterable[Symbol.asyncIterator]()
      },
      async pull (controller) {
        const { done, value } = await iterator.next()
        if (done) {
          queueMicrotask(() => {
            controller.close()
          })
        } else {
          const buf = Buffer.isBuffer(value) ? value : Buffer.from(value)
          controller.enqueue(new Uint8Array(buf))
        }
        return controller.desiredSize > 0
      },
      async cancel (reason) {
        await iterator.return()
      }
    },
    0
  )
}

// The chunk should be a FormData instance and contains
// all the required methods.
function isFormDataLike (chunk) {
  return (chunk &&
    chunk.constructor && chunk.constructor.name === 'FormData' &&
    typeof chunk === 'object' &&
      (typeof chunk.append === 'function' &&
        typeof chunk.delete === 'function' &&
        typeof chunk.get === 'function' &&
        typeof chunk.getAll === 'function' &&
        typeof chunk.has === 'function' &&
        typeof chunk.set === 'function' &&
        typeof chunk.entries === 'function' &&
        typeof chunk.keys === 'function' &&
        typeof chunk.values === 'function' &&
        typeof chunk.forEach === 'function')
  )
}

const kEnumerableProperty = Object.create(null)
kEnumerableProperty.enumerable = true

module.exports = {
  kEnumerableProperty,
  nop,
  isDisturbed,
  isErrored,
  isReadable,
  toUSVString: nodeUtil.toUSVString || ((val) => `${val}`),
  isReadableAborted,
  isBlobLike,
  parseOrigin,
  parseURL,
  getServerName,
  isStream,
  isIterable,
  isAsyncIterable,
  isDestroyed,
  parseRawHeaders,
  parseHeaders,
  parseKeepAliveTimeout,
  destroy,
  bodyLength,
  deepClone,
  ReadableStreamFrom,
  isBuffer,
  validateHandler,
  getSocketInfo,
  isFormDataLike,
  buildURL,
  nodeMajor,
  nodeMinor,
  nodeHasAutoSelectFamily: nodeMajor > 18 || (nodeMajor === 18 && nodeMinor >= 13)
}
