'use strict'

const { Readable, Writable } = require('stream')

let ReadableStream

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

class Source {
  constructor (data) {
    this.data = data
  }

  async start (controller) {
    this.controller = controller
  }

  async pull (controller) {
    controller.enqueue(this.data)
    controller.close()
  }
}

function createReadableStream (data) {
  ReadableStream = require('stream/web').ReadableStream
  return new ReadableStream(new Source(data))
}

module.exports = { createReadableStream, createReadable, createWritable }
