import { bench, run } from 'mitata'
import { Request } from '../../lib/web/fetch/request.js'

const input = 'https://example.com/post'

bench('new Request(input)', () => new Request(input, undefined))

await run()
