'use strict'

function splitData (socket, data) {
  const lines = [
    'HTTP/1.1 200 OK',
    'Date: Sat, 09 Oct 2010 14:28:02 GMT',
    'Connection: close',
    '',
    data
  ]
  for (const line of lines.join('\r\n').split(data)) {
    socket.write(line)
  }
  socket.end()
}

module.exports = splitData
