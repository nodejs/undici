import { group, bench, run } from 'mitata'
import { Response } from '../../lib/web/fetch/response.js'

const settings = {
  small: 2 << 8,
  middle: 2 << 12,
  long: 2 << 16
}

for (const [name, length] of Object.entries(settings)) {
  const buffer = Buffer.allocUnsafe(length).map(() => (Math.random() * 100) | 0)
  group(`${name} (length ${length})`, () => {
    bench('Response#arrayBuffer', async () => {
      return await new Response(buffer).arrayBuffer()
    })

    // for comparison
    bench('Response#text', async () => {
      return await new Response(buffer).text()
    })
  })
}

await run()
