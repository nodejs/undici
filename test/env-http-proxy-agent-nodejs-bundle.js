'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test, after, before } = require('node:test')
const { EnvHttpProxyAgent, setGlobalDispatcher, fetch: undiciFetch } = require('../index-fetch')
const http = require('node:http')
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

  test('should work with undici fetch from index-fetch', async (t) => {
    const { strictEqual } = tspl(t, { plan: 1 })

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

    // When proxyTunnel is auto-detected for HTTP via HTTP proxy, undici uses
    // direct forwarding (Http1ProxyWrapper) instead of CONNECT tunneling.
    // The proxy receives the full URL path like "http://localhost:PORT/".
    proxy.on('request', (req, res) => {
      // Parse the full URL that Http1ProxyWrapper sends.
      const { hostname, port, pathname, search, method } = new URL(req.url)
      const targetPort = port || 80

      const proxyReq = http.request({
        hostname,
        port: targetPort,
        path: pathname + search,
        method,
        headers: {
          ...req.headers,
          connection: 'keep-alive',
          'proxy-connection': 'keep-alive'
        }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxyReq.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500)
        }
        res.end('Proxy error')
      })

      req.pipe(proxyReq)
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

    const res = await undiciFetch(serverAddress)
    strictEqual(await res.text(), 'Hello world')
  })
})
