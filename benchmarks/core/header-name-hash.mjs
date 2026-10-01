// Header name Buffer -> lowercased string: stringifyHTTPHeader against the
// ternary search tree (util.bufferToLowerCasedHeaderName) and a plain decode.
// node --expose-gc micro.mjs <undici root>
import { createRequire } from 'node:module'
import { bench, do_not_optimize as doNotOptimize, run, summary } from 'mitata'

const require = createRequire(import.meta.url)
const util = require(`${process.argv[2]}/lib/core/util.js`)
const baselineUtil = require(`${process.argv[3]}/lib/core/util.js`)
const { wellknownResponseHeaderNames } = require(`${process.argv[2]}/lib/core/constants.js`)
const headerNames = new Map(wellknownResponseHeaderNames.map(name => [name, name]))

// A typical response: 12 names in both lists, 3 only in the response list,
// and one custom name.
const NAMES = [
  'Date', 'Content-Type', 'Content-Length', 'Connection', 'Server', 'Cache-Control', 'ETag',
  'Last-Modified', 'Accept-Ranges', 'Vary', 'Age', 'Strict-Transport-Security',
  'CF-Cache-Status', 'CF-Ray', 'X-Amz-Cf-Id', 'X-Custom-Header'
]

for (const [label, names] of [['Title-Case', NAMES], ['lowercase', NAMES.map((n) => n.toLowerCase())]]) {
  const sources = names.map((n) => Buffer.from(n, 'latin1'))
  // stringifyHTTPHeader lowercases in place, so every candidate restores the
  // input first and pays the same copy.
  const bufs = sources.map(b => Buffer.alloc(b.length + 8))
  for (let i = 0; i < names.length; i++) {
    const offset = i & 3
    bufs[i].set(sources[i], offset)
    if (util.stringifyHTTPHeader(bufs[i], offset, sources[i].length) !== names[i].toLowerCase()) throw new Error(names[i])
  }
  const each = (fn) => () => {
    for (let i = 0; i < bufs.length; i++) {
      const offset = i & 3
      bufs[i].set(sources[i], offset)
      doNotOptimize(fn(bufs[i], offset, sources[i].length))
    }
  }
  summary(() => {
    bench(`${label} stringifyHTTPHeader`, each((b, offset, length) => util.stringifyHTTPHeader(b, offset, length))).gc('inner')
    bench(`${label} tree.lookup ?? toString().toLowerCase()`, each((b, offset, length) => baselineUtil.bufferToLowerCasedHeaderName(b.subarray(offset, offset + length)))).gc('inner')
    bench(`${label} decode + normal Map lookup`, each((b, offset, length) => {
      const name = b.latin1Slice(offset, offset + length).toLowerCase()
      return headerNames.get(name) ?? name
    })).gc('inner')
    bench(`${label} latin1Slice().toLowerCase()`, each((b, offset, length) => b.latin1Slice(offset, offset + length).toLowerCase())).gc('inner')
  })
}

const { benchmarks } = await run({ format: 'quiet' })
for (const b of benchmarks) {
  const s = b.runs[0].stats
  console.log(JSON.stringify({ name: b.alias, avg: s.avg, p50: s.p50, heap: s.heap?.avg }))
}
