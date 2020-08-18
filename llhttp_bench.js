'use strict'
const undici = require('.')

const undiciOptions = {
  path: '/',
  method: 'GET'
}

const pool = new undici.Client(`http://localhost:3009`, {
  pipelining: 10,
  requestTimeout: 0
})

for (let n = 0; n < 1e5; ++n) {
  pool.request(undiciOptions, (err, { body }) => {
    if (err) {
      console.error(err)
    }
    body.resume()
  })
}
