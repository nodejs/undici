'use strict'

import { createServer } from 'node:http'
import { Agent, fetch } from '../../index.js'

const ITERATIONS = Number(process.env.SAMPLES ?? 2000)
const WARMUP = 300

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end('{"ok":1}')
})

server.keepAliveTimeout = 65_000

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const { port } = server.address()
const url = `http://127.0.0.1:${port}/`
const agent = new Agent({
  keepAliveTimeout: 60_000,
  connections: 1,
  pipelining: 1
})

for (let i = 0; i < WARMUP; i++) {
  await (await fetch(url, { dispatcher: agent })).text()
}

const times = new Array(ITERATIONS)
for (let i = 0; i < ITERATIONS; i++) {
  const t0 = process.hrtime.bigint()
  await (await fetch(url, { dispatcher: agent })).text()
  times[i] = Number(process.hrtime.bigint() - t0)
}

times.sort((a, b) => a - b)
const pct = (p) => times[Math.min(ITERATIONS - 1, Math.floor(ITERATIONS * p))] / 1e6

console.log(JSON.stringify({
  iterations: ITERATIONS,
  p50_ms: Number(pct(0.5).toFixed(3)),
  p90_ms: Number(pct(0.9).toFixed(3)),
  p99_ms: Number(pct(0.99).toFixed(3))
}))

await agent.close()
server.close()
