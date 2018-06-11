'use strict'

const { Agent, request } = require('http')
const total = 10000

const agent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 60 * 1000, // 1 minute
  maxSockets: 100,
  maxFreeSockets: 100
})

let responses = 0

console.time('requests')
for (let i = 0; i < total; i++) {
  request({
    port: 3000,
    method: 'GET',
    path: '/',
    agent
  }).on('response', (res) => {
    res.resume()

    if (++responses === total) {
      console.timeEnd('requests')
    }
  }).end()
}
