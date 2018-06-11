'use strict'

const undici = require('..')
const total = 10000

const agent = undici('http://localhost:3000', {
  connections: 100,
  pipelining: 10
})

let responses = 0

console.time('requests')
for (let i = 0; i < total; i++) {
  agent.request({
    method: 'GET',
    path: '/'
  }, (err, { body }) => {
    // let's crash this, the benchmark harness is not
    // ready to capture failures
    if (err) {
      throw err
    }

    body.resume()

    if (++responses === total) {
      console.timeEnd('requests')
      agent.close()
    }
  })
}
