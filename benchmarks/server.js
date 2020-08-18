'use strict'

const { createServer } = require('http')

const headers = {}
for (let n = 0; n < 1000; ++n) {
  headers[n] = 'asdajsndaklsjdnalsjnlajnsdlajknsd'
}
headers['keep-alive'] = 'timeout=5s'

createServer((req, res) => {
  res.writeHead(200, undefined, headers)
  res.end('hello world')
}).listen(3009)
