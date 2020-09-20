const { Pool, Client } = require('../../')
const http = require('http')
const proxy = require('./proxy')

const pool = new Pool('http://localhost:4001', {
  connections: 256,
  pipelining: 1
})

async function run () {
  await Promise.all([
    new Promise(resolve => {
      // Proxy
      http.createServer((req, res) => {
        proxy({ req, res, proxyName: 'example' }, pool).catch(err => {
          if (res.headersSent) {
            res.destroy(err)
          } else {
            for (const name of res.getHeaderNames()) {
              res.removeHeader(name)
            }
            res.statusCode = err.statusCode || 500
            res.end()
          }
        })
      }).listen(4000, resolve)
    }),
    new Promise(resolve => {
      // Upstream
      http.createServer((req, res) => {
        res.end('hello world')
      }).listen(4001, resolve)
    })
  ])

  const client = new Client('http://localhost:4000')
  const { body } = await client.request({
    method: 'GET',
    path: '/'
  })

  for await (const chunk of body) {
    console.log(String(chunk))
  }
}

run()

// TODO: Add websocket example.
