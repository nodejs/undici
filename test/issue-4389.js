const { describe, test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const { createServer: createHttpServer } = require('node:http')
const { createServer: createSocketServer } = require('node:net')
const { fetch, Agent } = require('..')

describe('Interceptor should not break multi-value headers', () => {
  test('Interceptor should not break Set-Cookie', async (t) => {
    const server = createHttpServer({ joinDuplicateHeaders: true }, async (_req, res) => {
      const headers = [
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
        ['set-cookie', 'c=3']
      ]
      res.writeHead(200, headers)
      res.end()
    }).listen(0)

    await once(server, 'listening')
    t.after(() => server.close())

    const dispatcher = new Agent().compose((dispatch) => dispatch)

    const { headers } = await fetch(`http://localhost:${server.address().port}`, { dispatcher })
    assert.deepStrictEqual(headers.getSetCookie(), ['a=1', 'b=2', 'c=3'])
  })

  test('Interceptor should not break other multi-value header', async (t) => {
    const server = createSocketServer((socket) => {
      socket.write('HTTP/1.0 204 No Content\r\n')
      socket.write('X-Test-Header: 1\r\n')
      socket.write('X-Test-Header: 2\r\n')
      socket.write('X-Test-Header: 3\r\n')
      socket.end('\r\n\r\n')
    }).listen(0)
    t.after(() => server.close())
    await once(server, 'listening')

    const dispatcher = new Agent().compose((dispatch) => dispatch)

    const { headers } = await fetch(`http://localhost:${server.address().port}`, { dispatcher })
    assert.deepStrictEqual(headers.get('x-test-header'), '1, 2, 3')
  })
})
