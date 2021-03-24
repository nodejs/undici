const { Readable, Writable } = require('stream')

function createReadable (data) {
  return new Readable({
    read () {
      this.push(Buffer.from(data))
      this.push(null)
    }
  })
}

function createWritable (target) {
  return new Writable({
    write (chunk, _, callback) {
      target.push(chunk.toString())
      callback()
    },
    final (callback) {
      callback()
    }
  })
}

module.exports = { createReadable, createWritable }
