const tap = require('tap')
const http = require('http')
const { request } = require('../lib/agent')

tap.test('request a resource using globalAgent', t => {
  t.plan(6)
  const wanted = 'payload'

  const server = http.createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    request(`http://localhost:${server.address().port}`)
      .then(({ statusCode, headers, body }) => {
        t.strictEqual(statusCode, 200)
        t.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
        })
      })
      .catch(err => {
        t.fail(err)
      })
  })
})
