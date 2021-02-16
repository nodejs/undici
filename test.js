'use strict'

const { Readable, Writable, PassThrough, pipeline } = require('stream')
const { createServer } = require('http')
const { Client } = require('.')

const server = createServer((request, response) => {
  request.pipe(response)
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  let res = ''

  pipeline(
    new Readable({
      read () {
        this.push(Buffer.from('undici'))
        this.push(null)
      }
    }),
    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers, body }) => {
      console.log(`response received ${statusCode}`)
      console.log('headers', headers)
      return pipeline(body, new PassThrough(), () => {})
    }),
    new Writable({
      write (chunk, _, callback) {
        res += chunk.toString()
        callback()
      },
      final (callback) {
        console.log(`Response pipelined to writable: ${res}`)
        callback()
      }
    }),
    error => {
      if (error) {
        console.error(error)
      }

      client.close()
      server.close()
    }
  )
})