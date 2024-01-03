let channels
try {
  const diagnosticsChannel = require('diagnostics_channel')
  let isClientSet = false
  channels = {
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

  if (process.env.NODE_DEBUG.match(/(fetch|undici)/) != null) {
    // Track all Client events
    diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(evt => {
      const {
        connectParams: { version, protocol, port, host }
      } = evt
      console.log(
        `HTTP:undici ${process.pid}: connecting to ${host}${
          port ? `:${port}` : ''
        } using ${protocol}${version}`
      )
    })

    diagnosticsChannel.channel('undici:client:connected').subscribe(evt => {
      const {
        connectParams: { version, protocol, port, host }
      } = evt
      console.log(
        `HTTP:undici ${process.pid}: connected to ${host}${
          port ? `:${port}` : ''
        } using ${protocol}${version}`
      )
    })

    diagnosticsChannel.channel('undici:client:connectError').subscribe(evt => {
      const {
        connectParams: { version, protocol, port, host },
        error
      } = evt
      console.log(
        `HTTP:undici ${process.pid}: connection to ${host}${
          port ? `:${port}` : ''
        } using ${protocol}${version} errored - ${error.message}`
      )
    })

    diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(evt => {
      const {
        request: { method, path, origin }
      } = evt
      console.log(
        `HTTP:undici ${process.pid}: sending request to ${method} ${origin}/${path}`
      )
    })

    // Track Request events
    diagnosticsChannel.channel('undici:request:headers').subscribe(evt => {
      const {
        request: { method, path, origin },
        response: { statusCode }
      } = evt
      console.log(
        `HTTP:undici ${process.pid}: received response ${method} ${origin}/${path} - HTTP ${statusCode}`
      )
    })

    diagnosticsChannel.channel('undici:request:trailers').subscribe(evt => {
      const {
        request: { method, path, origin }
      } = evt
      console.log(
        `HTTP:undici ${process.pid}: trailers received from ${method} ${origin}/${path}`
      )
    })

    diagnosticsChannel.channel('undici:request:error').subscribe(evt => {
      const {
        request: { method, path, origin },
        error
      } = evt
      console.log(
        `HTTP:undici ${process.pid}: request errored ${method} ${origin}/${path} - ${error.message}`
      )
    })

    isClientSet = true
  }

  if (process.env.NODE_DEBUG.match(/websocket/) != null) {
    if (!isClientSet) {
      diagnosticsChannel
        .channel('undici:client:beforeConnect')
        .subscribe(evt => {
          const {
            connectParams: { version, protocol, port, host }
          } = evt
          console.log(
            `HTTP:undici ${process.pid}: connecting to ${host}${
              port ? `:${port}` : ''
            } using ${protocol}${version}`
          )
        })

      diagnosticsChannel.channel('undici:client:connected').subscribe(evt => {
        const {
          connectParams: { version, protocol, port, host }
        } = evt
        console.log(
          `HTTP:undici ${process.pid}: connected to ${host}${
            port ? `:${port}` : ''
          } using ${protocol}${version}`
        )
      })

      diagnosticsChannel
        .channel('undici:client:connectError')
        .subscribe(evt => {
          const {
            connectParams: { version, protocol, port, host },
            error
          } = evt
          console.log(
            `HTTP:undici ${process.pid}: connection to ${host}${
              port ? `:${port}` : ''
            } using ${protocol}${version} errored - ${error.message}`
          )
        })

      diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(evt => {
        const {
          request: { method, path, origin }
        } = evt
        console.log(
          `HTTP:undici ${process.pid}: sending request to ${method} ${origin}/${path}`
        )
      })
    }

    // Track all Client events
    diagnosticsChannel.channel('undici:websocket:open').subscribe(evt => {
      const {
        address: { address, port },
        protocol,
        extensions
      } = evt
      console.log(
        `WebSocket:undici ${process.pid}: connection opened ${address}${
          port ? `:${port}` : ''
        } using ${protocol}-${extensions}`
      )
    })

    diagnosticsChannel.channel('undici:websocket:close').subscribe(evt => {
      const { websocket, code, reason } = evt
      console.log(
        `WebSocket:undici ${process.pid}: closed connection to ${websocket.url} - ${code} ${reason}`
      )
    })

    diagnosticsChannel
      .channel('undici:websocket:socket_error')
      .subscribe(err => {
        console.log(
          `WebSocket:undici ${process.pid}: connection errored - ${err.message}`
        )
      })

    diagnosticsChannel.channel('undici:websocket:ping').subscribe(evt => {
      console.log(`WebSocket:undici ${process.pid}: ping received`)
    })

    diagnosticsChannel.channel('undici:websocket:pong').subscribe(evt => {
      console.log(`WebSocket:undici ${process.pid}: pong received`)
    })
  }
} catch (error) {
  channels = {
    // Client
    sendHeaders: { hasSubcribers: false },
    beforeConnect: { hasSubcribers: false },
    connectError: { hasSubcribers: false },
    connected: { hasSubcribers: false },
    // Request
    create: { hasSubcribers: false },
    bodySent: { hasSubcribers: false },
    headers: { hasSubcribers: false },
    trailers: { hasSubcribers: false },
    error: { hasSubcribers: false },
    // WebSocket
    open: { hasSubcribers: false },
    close: { hasSubcribers: false },
    socketError: { hasSubcribers: false },
    ping: { hasSubcribers: false },
    pong: { hasSubcribers: false }
  }
}

module.exports = {
  channels
}
