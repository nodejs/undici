'use strict'

const { Readable } = require('stream')

class FileStream extends Readable {
  _read () {}
}

module.exports = {
  FileStream
}
