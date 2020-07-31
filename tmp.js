const { Client } = require('.')
const stream = require('stream')

const client = new Client('http://localhost:5984', {
  socketTimeout: 10e3,
  headersTimeout: 10e3
})

client.stream({
  method: 'GET',
  path: '/nxt/_changes?feed=continuous&heartbeat=5000'
}, ({ headers }) => {
  console.log(headers)
  return new stream.Writable({
    write (chunk, encoding, callback) {
      console.log(chunk.toString())
      callback()
    }
  })
}, (err) => {
  console.error(err)
})
