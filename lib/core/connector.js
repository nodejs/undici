const net = require('net')
const tls = require('tls')

module.exports = class Connector {
  constructor ({ socketPath, tls }) {
    this.socketPath = socketPath
    this.session = null
    this.tls = tls || {}
  }

  connect ({
    protocol,
    port,
    hostname,
    host
  }, callback) {
    const servername = (
      host &&
      !/^\[/.test(host) &&
      !net.isIP(host)
    ) ? host : this.tls.servername

    let socket
    if (protocol === 'https:') {
      const tlsOpts = {
        ...this.tls,
        servername,
        session: this.session
      }

      /* istanbul ignore next: https://github.com/mcollina/undici/issues/267 */
      socket = this.socketPath
        ? tls.connect(this.socketPath, tlsOpts)
        : tls.connect(port || /* istanbul ignore next */ 443, hostname, tlsOpts)

      socket
        .setNoDelay(true)
        .on('session', (session) => {
          // Cache new session for reuse.
          this.session = session
        })
        .once('secureConnect', callback)
    } else {
      socket = this.socketPath
        ? net.connect(this.socketPath)
        : net.connect(port || /* istanbul ignore next */ 80, hostname)

      socket
        .setNoDelay(true)
        .once('connect', callback)
    }

    socket.on('error', (err) => {
      if (err.code !== 'UND_ERR_INFO') {
        // Evict session on errors.
        this.session = null
      }
    })

    return socket
  }
}
