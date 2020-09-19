const net = require('net')
const { pipeline } = require('stream')
const createError = require('http-errors')

module.exports = async function proxy (ctx, client) {
  const { req, socket } = ctx

  if (socket) {
    const handler = new WSHandler(ctx)
    client.dispatch({
      method: req.method,
      path: req.url,
      headers: getHeaders(ctx),
      upgrade: 'Websocket'
    }, handler)
    return handler.promise
  } else {
    const handler = new HTTPHandler(ctx)
    client.dispatch({
      method: req.method,
      path: req.url,
      headers: getHeaders(ctx),
      body: req
    }, handler)
    return handler.promise
  }
}

class HTTPHandler {
  constructor (ctx) {
    const { req, res } = ctx

    this.req = req
    this.res = res
    this.resume = null
    this.abort = null
    this.promise = new Promise((resolve, reject) => {
      this.callback = err => err ? reject(err) : resolve()
    })
  }

  onConnect (abort) {
    if (this.req.aborted) {
      abort()
    } else {
      this.abort = abort
      this.res.on('close', abort)
    }
  }

  onHeaders (statusCode, headers, resume) {
    if (statusCode < 200) {
      return
    }

    this.resume = resume
    this.res.on('drain', resume)
    writeHead(this.res, statusCode, getHeaders({ headers }))
  }

  onData (chunk) {
    return this.res.write(chunk)
  }

  onComplete () {
    this.res.end()
    this.callback()
  }

  onError (err) {
    this.res.off('close', this.abort)
    this.res.off('drain', this.resume)
    this.callback(err)
  }
}

class WSHandler {
  constructor (ctx) {
    const { socket, head } = ctx

    setupSocket(socket)

    this.socket = socket
    this.head = head
    this.abort = null
    this.promise = new Promise((resolve, reject) => {
      this.callback = err => err ? reject(err) : resolve()
    })
  }

  onConnect (abort) {
    if (this.socket.destroyed) {
      abort()
    } else {
      this.abort = abort
      this.socket.on('close', abort)
    }
  }

  onUpgrade (statusCode, headers, socket) {
    if (this.head && this.head.length) {
      socket.unshift(this.head)
    }

    setupSocket(socket)

    let head = 'HTTP/1.1 101 Switching Protocols\r\nconnection: upgrade\r\nupgrade: websocket'

    headers = getHeaders({ headers })
    for (let n = 0; n < headers.length; n += 2) {
      const key = headers[n + 0]
      const val = headers[n + 1]

      if (!Array.isArray(val)) {
        head += `\r\n${key}: ${val}`
      } else {
        for (let i = 0; i < val.length; i++) {
          head += `\r\n${key}: ${val[i]}`
        }
      }
    }
    head += '\r\n\r\n'

    this.socket.write(head)

    pipeline(socket, this.socket, socket, this.callback)
  }

  onError (err) {
    this.socket.off('close', this.abort)
    this.callback(err)
  }
}

// This expression matches hop-by-hop headers.
// These headers are meaningful only for a single transport-level connection,
// and must not be retransmitted by proxies or cached.
const HOP_EXPR = /^(te|host|upgrade|trailers|connection|keep-alive|http2-settings|transfer-encoding|proxy-connection|proxy-authenticate|proxy-authorization)$/i

// Removes hop-by-hop and pseudo headers.
// Updates via and forwarded headers.
// Only hop-by-hop headers may be set using the Connection general header.
function getHeaders (ctx) {
  const {
    proxyName,
    req,
    headers = req ? req.rawHeaders : undefined
  } = ctx

  let via = ''
  let forwarded = ''
  let host = ''
  let authority = ''
  let connection = ''

  for (let n = 0; n < headers.length; n += 2) {
    const key = headers[n + 0]
    const val = headers[n + 1]

    if (!via && key.length === 3 && key.toLowerCase() === 'via') {
      via = val
    } else if (!host && key.length === 4 && key.toLowerCase() === 'host') {
      host = val
    } else if (!forwarded && key.length === 9 && key.toLowerCase() === 'forwarded') {
      forwarded = val
    } else if (!connection && key.length === 10 && key.toLowerCase() === 'connection') {
      connection = val
    } else if (!authority && key.length === 10 && key === ':authority') {
      authority = val
    }
  }

  let remove
  if (connection && !HOP_EXPR.test(connection)) {
    remove = connection.split(/,\s*/)
  }

  const result = []
  for (let n = 0; n < headers.length; n += 2) {
    const key = headers[n + 0]
    const val = headers[n + 1]

    if (
      key.charAt(0) !== ':' &&
      !HOP_EXPR.test(key) &&
      (!remove || !remove.includes(key))
    ) {
      result.push(key, val)
    }
  }

  if (req) {
    const { socket, httpVersion } = req

    result.push('forwarded', (forwarded ? forwarded + ', ' : '') + [
      `by=${printIp(socket.localAddress, socket.localPort)}`,
      `for=${printIp(socket.remoteAddress, socket.remotePort)}`,
      `proto=${socket.encrypted ? 'https' : 'http'}`,
      `host=${printIp(authority || host || '')}`
    ].join(';'))

    // TODO (fix): Should also apply to responses.
    if (proxyName) {
      if (via) {
        if (via.split(',').some(name => name.endsWith(proxyName))) {
          throw new createError.LoopDetected()
        }
        via += ', '
      }
      via += `${httpVersion} ${proxyName}`
    }
  }

  if (via) {
    result.push('via', via)
  }

  return result
}

function setupSocket (socket) {
  socket.setTimeout(0)
  socket.setNoDelay(true)
  socket.setKeepAlive(true, 0)
}

function printIp (address, port) {
  const isIPv6 = net.isIPv6(address)
  let str = `${address}`
  if (isIPv6) {
    str = `[${str}]`
  }
  if (port) {
    str = `${str}:${port}`
  }
  if (isIPv6 || port) {
    str = `"${str}"`
  }
  return str
}

function writeHead (res, statusCode, headers) {
  // TODO (perf): res.writeHead should support Array and/or string.
  const obj = {}
  for (var i = 0; i < headers.length; i += 2) {
    var key = headers[i]
    var val = obj[key]
    if (!val) {
      obj[key] = headers[i + 1]
    } else {
      if (!Array.isArray(val)) {
        val = [val]
        obj[key] = val
      }
      val.push(headers[i + 1])
    }
  }

  res.writeHead(statusCode, obj)

  return res
}
