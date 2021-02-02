const undici = require('./')
const http = require('http')

function run () {
  const server = http.createServer((req, res) => {
    res.end('hello')
  })
  server.listen(0, () => {
    const client = new undici.Client(`http://localhost:${server.address().port}`)
    client.request({ path: '/', method: 'GET' }, (err, { statusCode, body, headers, trailers }) => {
      body.on('data', console.log)
      body.on('end', () => {
        client.close(() => {
          console.trace()
        })
      })
    })
  })
}

run()