'use strict'

const assert = require('node:assert/strict')
const { channel } = require('node:diagnostics_channel')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { gzipSync } = require('node:zlib')

const compiledModules = []
const OriginalModule = WebAssembly.Module
WebAssembly.Module = new Proxy(OriginalModule, {
  construct (target, args) {
    const mod = Reflect.construct(target, args)
    const exports = OriginalModule.exports(mod).map(entry => entry.name)
    assert.ok(exports.some(name => name.startsWith('llhttp_')))
    assert.ok(!exports.some(name => name.startsWith('milo_')))
    compiledModules.push(mod)
    return mod
  }
})

const { fetch, getGlobalDispatcher, setGlobalDispatcher, EnvHttpProxyAgent } = require('../../undici-fetch')
assert.strictEqual(compiledModules.length, 0)

let connections = 0
channel('undici:client:connected').subscribe(({ socket }) => {
  const key = Object.getOwnPropertySymbols(socket).find(symbol => symbol.description === 'parser')
  assert.ok(key)
  assert.strictEqual(socket[key].constructor.name, 'Parser')
  connections++
})

async function main () {
  const server = createServer(async (req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/length' })
      res.end()
    } else if (req.url === '/echo') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      res.end(Buffer.concat(chunks))
    } else if (req.url === '/gzip') {
      res.setHeader('Content-Encoding', 'gzip')
      res.end(gzipSync('hello'))
    } else if (req.url === '/chunked') {
      res.write('hel')
      res.end('lo')
    } else {
      res.setHeader('Content-Length', '5')
      res.end('hello')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const defaultDispatcher = getGlobalDispatcher()
  const forcedMiloDispatcher = new EnvHttpProxyAgent({ useMilo: true, noProxy: '*' })

  try {
    for (const dispatcher of [defaultDispatcher, forcedMiloDispatcher]) {
      setGlobalDispatcher(dispatcher)
      const connectionsBefore = connections
      for (const path of ['/length', '/chunked', '/redirect', '/gzip']) {
        const response = await fetch(origin + path)
        assert.strictEqual(response.status, 200)
        assert.strictEqual(await response.text(), 'hello')
      }
      const response = await fetch(origin + '/echo', { method: 'POST', body: 'hello' })
      assert.strictEqual(response.status, 200)
      assert.strictEqual(await response.text(), 'hello')
      assert.ok(connections > connectionsBefore)
    }
    assert.ok(compiledModules.length > 0)
  } finally {
    setGlobalDispatcher(defaultDispatcher)
    await Promise.all([defaultDispatcher.close(), forcedMiloDispatcher.close()])
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
