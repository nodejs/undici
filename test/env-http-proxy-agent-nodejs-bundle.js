'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test, after, before } = require('node:test')
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('../index-fetch')
const http = require('node:http')
const net = require('node:net')
const { once } = require('node:events')

const env = { ...process.env }

describe('EnvHttpProxyAgent and setGlobalDispatcher', () => {
  before(() => {
    ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy'].forEach((varname) => {
      delete process.env[varname]
    })
  })

  after(() => {
    process.env = { ...env }
  })

  test('should work with global fetch from undici bundled with Node.js', async (t) => {
    const { strictEqual } = tspl(t, { plan: 3 })

    // Instead of using mocks, start a real server and a minimal proxy server
    // in order to exercise the actual paths in EnvHttpProxyAgent from the
    // Node.js bundle.
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => { res.end('Hello world') })
    server.on('error', err => { console.log('Server error', err) })
    server.listen(0)
    await once(server, 'listening')
    t.after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    const proxy = http.createServer({ joinDuplicateHeaders: true })
    proxy.on('connect', (req, clientSocket, head) => {
      // Check that the proxy is actually used to tunnel the request sent below.
      const [hostname, port] = req.url.split(':')
      strictEqual(hostname, 'localhost')
      strictEqual(port, server.address().port.toString())

      const serverSocket = net.connect(port, hostname, () => {
        clientSocket.write(
          'HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-agent: Node.js-Proxy\r\n' +
          '\r\n'
        )
        serverSocket.write(head)
        clientSocket.pipe(serverSocket)
        serverSocket.pipe(clientSocket)
      })

      serverSocket.on('error', () => {
        clientSocket.write('HTTP/1.1 500 Connection Error\r\n\r\n')
        clientSocket.end()
      })
    })

    proxy.on('error', (err) => { console.log('Proxy error', err) })

    proxy.listen(0)
    await once(proxy, 'listening')
    t.after(() => {
      proxy.closeAllConnections?.()
      proxy.close()
    })

    // Use setGlobalDispatcher and EnvHttpProxyAgent from Node.js
    // and make sure that they work together.
    const proxyAddress = `http://localhost:${proxy.address().port}`
    const serverAddress = `http://localhost:${server.address().port}`
    process.env.http_proxy = proxyAddress
    setGlobalDispatcher(new EnvHttpProxyAgent())

    // eslint-disable-next-line no-restricted-globals
    const res = await fetch(serverAddress)
    strictEqual(await res.text(), 'Hello world')
  })
})
