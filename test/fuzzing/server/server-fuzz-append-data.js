'use strict'

function appendData (socket, data) {
  socket.end('HTTP/1.1 200 OK' + data)
}

module.exports = appendData
