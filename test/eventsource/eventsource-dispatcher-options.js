'use strict'

const buffer = require('node:buffer')
const http = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const { Agent, Client, Dispatcher1Wrapper, MockAgent, Pool, RetryAgent } = require('../..')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

test('Agent eventSourceOptions.maxEventSize is read correctly', async (t) => {
  const customLimit = 32 * 1024 * 1024
  const agent = new Agent({
    eventSource: {
      maxEventSize: customLimit
    }
  })

  t.after(() => agent.close())

  t.assert.strictEqual(agent.eventSourceOptions.maxEventSize, customLimit)
})

test('Agent with default eventSourceOptions uses buffer.kStringMaxLength', async (t) => {
  const agent = new Agent()

  t.after(() => agent.close())

  t.assert.strictEqual(agent.eventSourceOptions.maxEventSize, buffer.kStringMaxLength)
})

test('Client eventSourceOptions.maxEventSize is read correctly', async (t) => {
  const customLimit = 16 * 1024 * 1024
  const client = new Client('http://localhost', {
    eventSource: {
      maxEventSize: customLimit
    }
  })

  t.after(() => client.close())

  t.assert.strictEqual(client.eventSourceOptions.maxEventSize, customLimit)
})

test('Pool eventSourceOptions.maxEventSize is read correctly', async (t) => {
  const customLimit = 8 * 1024 * 1024
  const pool = new Pool('http://localhost', {
    eventSource: {
      maxEventSize: customLimit
    }
  })

  t.after(() => pool.close())

  t.assert.strictEqual(pool.eventSourceOptions.maxEventSize, customLimit)
})

// Wrappers report the eventSourceOptions of the dispatcher they wrap, so a
// configured maxEventSize isn't lost behind them.
const eventSource = { maxEventSize: 5 }
const wrappers = {
  RetryAgent: () => new RetryAgent(new Agent({ eventSource })),
  MockAgent: () => {
    const agent = new MockAgent({ eventSource })
    agent.enableNetConnect()
    return agent
  },
  'MockAgent({ agent })': () => {
    const agent = new MockAgent({ agent: new Agent({ eventSource }) })
    agent.enableNetConnect()
    return agent
  },
  Dispatcher1Wrapper: () => new Dispatcher1Wrapper(new Agent({ eventSource }))
}

// Resolves with 'message' or 'error', whichever the EventSource emits first,
// for a server that sends one event with `data`.
async function firstEvent (t, dispatcher, data) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`data: ${data}\n\n`)
  })
  await once(server.listen(0), 'listening')

  const es = new EventSource(`http://localhost:${server.address().port}`, {
    node: { dispatcher }
  })
  t.after(async () => {
    es.close()
    server.closeAllConnections()
    server.close()
    await dispatcher.close()
  })

  const type = await new Promise((resolve) => {
    es.onmessage = () => resolve('message')
    es.onerror = () => resolve('error')
  })
  return { type, readyState: es.readyState }
}

for (const [name, createDispatcher] of Object.entries(wrappers)) {
  test(`${name} reports the wrapped agent's eventSourceOptions`, async (t) => {
    const dispatcher = createDispatcher()
    t.after(() => dispatcher.close())

    t.assert.deepStrictEqual(dispatcher.eventSourceOptions, eventSource)
  })

  test(`${name} applies the wrapped agent's maxEventSize`, async (t) => {
    // 11 bytes of data against a limit of 5.
    const { type, readyState } = await firstEvent(t, createDispatcher(), 'hello world')

    t.assert.strictEqual(type, 'error')
    t.assert.strictEqual(readyState, EventSource.CLOSED)
  })

  test(`${name} delivers events within the wrapped agent's maxEventSize`, async (t) => {
    const { type } = await firstEvent(t, createDispatcher(), 'hello')

    t.assert.strictEqual(type, 'message')
  })
}
