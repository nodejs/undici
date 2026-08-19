import { bench, run } from 'mitata'
import { Response } from '../../lib/web/fetch/response.js'

bench('new Response()', () => new Response())
bench('new Response(body)', () => new Response('hello'))
bench('new Response(null, { status: 201 })', () => new Response(null, { status: 201 }))

await run()
