import { bench, group, run } from 'mitata'
import { EventSourceStream } from '../../lib/web/eventsource/eventsource-stream.js'

const EVENT_COUNT = 250

function buildEventStream (count) {
  let content = ''

  for (let i = 0; i < count; i++) {
    content += `id: ${i}\n`
    content += `event: message-${i % 4}\n`
    content += `retry: ${1000 + (i % 5)}\n`
    content += `data: ${'x'.repeat(64)}-${i}\n`
    content += `data: ${'y'.repeat(64)}-${i}\n\n`
  }

  return Buffer.from(content, 'utf8')
}

function splitBuffer (buffer, chunkSize) {
  const chunks = []

  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.subarray(i, Math.min(i + chunkSize, buffer.length)))
  }

  return chunks
}

function parseChunks (chunks, expectedEvents) {
  let events = 0

  const stream = new EventSourceStream({
    push () {
      events++
      return true
    }
  })

  for (let i = 0; i < chunks.length; i++) {
    stream.write(chunks[i])
  }

  if (events !== expectedEvents) {
    throw new Error(`Expected ${expectedEvents} events, got ${events}`)
  }
}

const payload = buildEventStream(EVENT_COUNT)
const payloadWithBOM = Buffer.concat([Buffer.from('\uFEFF', 'utf8'), payload])

const scenarios = {
  'single chunk': splitBuffer(payload, payload.length),
  '256-byte chunks': splitBuffer(payload, 256),
  '64-byte chunks': splitBuffer(payload, 64),
  '8-byte chunks': splitBuffer(payload, 8),
  '1-byte chunks': splitBuffer(payload, 1)
}

const bomScenarios = {
  'BOM + 8-byte chunks': splitBuffer(payloadWithBOM, 8),
  'BOM + 1-byte chunks': splitBuffer(payloadWithBOM, 1)
}

group(`EventSourceStream parsing (${EVENT_COUNT} events)`, () => {
  for (const [name, chunks] of Object.entries(scenarios)) {
    bench(name, () => {
      parseChunks(chunks, EVENT_COUNT)
    })
  }
})

group('EventSourceStream parsing with BOM', () => {
  for (const [name, chunks] of Object.entries(bomScenarios)) {
    bench(name, () => {
      parseChunks(chunks, EVENT_COUNT)
    })
  }
})

await run()
