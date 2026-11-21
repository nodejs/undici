import { group, bench, run } from 'mitata'
import { Response } from '../../lib/web/fetch/response.js'

// Benchmark body mixin methods with known-source bodies (string & Uint8Array)
// to measure the impact of the body source shortcut optimization (#2164)

const shortString = 'hello world'
const mediumString = 'x'.repeat(1024)
const longString = 'x'.repeat(65536)
const shortBytes = new Uint8Array(32).fill(65)
const mediumBytes = new Uint8Array(1024).fill(65)
const longBytes = new Uint8Array(65536).fill(65)

group('Response#text() with string body', () => {
  bench('short string (11B)', async () => {
    await new Response(shortString).text()
  })
  bench('medium string (1KB)', async () => {
    await new Response(mediumString).text()
  })
  bench('long string (64KB)', async () => {
    await new Response(longString).text()
  })
})

group('Response#json() with string body', () => {
  bench('small JSON', async () => {
    await new Response('{"a":1}').json()
  })
})

group('Response#arrayBuffer() with string body', () => {
  bench('short string (11B)', async () => {
    await new Response(shortString).arrayBuffer()
  })
  bench('medium string (1KB)', async () => {
    await new Response(mediumString).arrayBuffer()
  })
})

group('Response#text() with Uint8Array body', () => {
  bench('short bytes (32B)', async () => {
    await new Response(shortBytes).text()
  })
  bench('medium bytes (1KB)', async () => {
    await new Response(mediumBytes).text()
  })
  bench('long bytes (64KB)', async () => {
    await new Response(longBytes).text()
  })
})

group('Response#arrayBuffer() with Uint8Array body', () => {
  bench('short bytes (32B)', async () => {
    await new Response(shortBytes).arrayBuffer()
  })
  bench('medium bytes (1KB)', async () => {
    await new Response(mediumBytes).arrayBuffer()
  })
})

group('Response#bytes() with Uint8Array body', () => {
  bench('short bytes (32B)', async () => {
    await new Response(shortBytes).bytes()
  })
  bench('medium bytes (1KB)', async () => {
    await new Response(mediumBytes).bytes()
  })
})

await run()
