import { bench, group, run } from 'mitata'
import { Headers } from '../../lib/web/fetch/headers.js'

const objectInit = {
  Accept: 'application/json',
  'Content-Type': 'text/plain',
  'User-Agent': 'benchmark',
  Authorization: 'Bearer token',
  Cookie: 'a=1',
  'X-Request-Id': 'abc',
  'Cache-Control': 'no-cache',
  Host: 'example.com'
}

const headers = new Headers(objectInit)
const copySource = new Headers(objectInit)

group('Headers methods', () => {
  bench('construct empty', () => {
    return new Headers()
  })

  bench('construct object', () => {
    return new Headers(objectInit)
  })

  bench('construct headers', () => {
    return new Headers(copySource)
  })

  bench('get custom', () => {
    return headers.get('x-request-id')
  })

  bench('get common', () => {
    return headers.get('content-type')
  })

  bench('has', () => {
    return headers.has('authorization')
  })

  bench('set', () => {
    headers.set('x-count', '1')
    return headers
  })

  bench('append', () => {
    const current = new Headers()
    current.append('Accept', 'text/html')
    current.append('X-Custom', '1')
    return current
  })

  bench('delete', () => {
    const current = new Headers(objectInit)
    current.delete('content-type')
    return current
  })

  bench('iterate', () => {
    let result
    for (const entry of headers) {
      result = entry
    }
    return result
  })
})

await run()
