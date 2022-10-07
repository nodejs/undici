import { once } from 'node:events'
import { createServer } from 'node:http'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createReadStream } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const tests = fileURLToPath(join(import.meta.url, '../../tests'))

// https://web-platform-tests.org/tools/wptserve/docs/stash.html
class Stash extends Map {
  take (key) {
    if (this.has(key)) {
      const value = this.get(key)

      this.delete(key)
      return value.value
    }
  }

  put (key, value, path) {
    this.set(key, { value, path })
  }
}

const stash = new Stash()

const server = createServer(async (req, res) => {
  const fullUrl = new URL(req.url, `http://localhost:${server.address().port}`)

  switch (fullUrl.pathname) {
    case '/interfaces/dom.idl':
    case '/interfaces/html.idl':
    case '/interfaces/fetch.idl':
    case '/interfaces/referrer-policy.idl':
    case '/xhr/resources/utf16-bom.json':
    case '/fetch/data-urls/resources/base64.json':
    case '/fetch/data-urls/resources/data-urls.json':
    case '/fetch/api/resources/empty.txt':
    case '/fetch/api/resources/data.json': {
      // https://github.com/web-platform-tests/wpt/blob/6ae3f702a332e8399fab778c831db6b7dca3f1c6/fetch/api/resources/data.json
      return createReadStream(join(tests, fullUrl.pathname))
        .on('end', () => res.end())
        .pipe(res)
    }
    case '/fetch/api/resources/trickle.py': {
      // Note: python's time.sleep(...) takes seconds, while setTimeout
      // takes ms.
      const delay = parseFloat(fullUrl.searchParams.get('ms') ?? 500)
      const count = parseInt(fullUrl.searchParams.get('count') ?? 50)

      // eslint-disable-next-line no-unused-vars
      for await (const chunk of req); // read request body

      await sleep(delay)

      if (!fullUrl.searchParams.has('notype')) {
        res.setHeader('Content-type', 'text/plain')
      }

      res.statusCode = 200
      await sleep(delay)

      for (let i = 0; i < count; i++) {
        res.write('TEST_TRICKLE\n')
        await sleep(delay)
      }

      res.end()
      break
    }
    case '/fetch/api/resources/infinite-slow-response.py': {
      // https://github.com/web-platform-tests/wpt/blob/master/fetch/api/resources/infinite-slow-response.py
      const stateKey = fullUrl.searchParams.get('stateKey') ?? ''
      const abortKey = fullUrl.searchParams.get('abortKey') ?? ''

      if (stateKey) {
        stash.put(stateKey, 'open', fullUrl.pathname)
      }

      res.setHeader('Content-Type', 'text/plain')
      res.statusCode = 200

      res.write('.'.repeat(2048))

      while (true) {
        if (!res.write('.')) {
          break
        } else if (abortKey && stash.take(abortKey, fullUrl.pathname)) {
          break
        }

        await sleep(10)
      }

      if (stateKey) {
        stash.put(stateKey, 'closed', fullUrl.pathname)
      }

      return res.end()
    }
    case '/fetch/api/resources/stash-take.py': {
      // https://github.com/web-platform-tests/wpt/blob/6ae3f702a332e8399fab778c831db6b7dca3f1c6/fetch/api/resources/stash-take.py

      const key = fullUrl.searchParams.get('key')
      res.setHeader('Access-Control-Allow-Origin', '*')

      const took = stash.take(key, fullUrl.pathname) ?? null

      res.write(JSON.stringify(took))
      return res.end()
    }
    default: {
      res.statusCode = 200
      res.end('body')
    }
  }
}).listen(0)

await once(server, 'listening')

const send = (message) => {
  if (typeof process.send === 'function') {
    process.send(message)
  }
}

send({ server: `http://localhost:${server.address().port}` })

process.on('message', (message) => {
  if (message === 'shutdown') {
    server.close((err) => err ? send(err) : send({ message: 'shutdown' }))
  }
})
