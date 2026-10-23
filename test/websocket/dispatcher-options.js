'use strict'

const { test } = require('node:test')
const {
  Agent,
  BalancedPool,
  Dispatcher1Wrapper,
  EnvHttpProxyAgent,
  MockAgent,
  ProxyAgent,
  RetryAgent,
  RoundRobinPool,
  Socks5ProxyAgent
} = require('../..')

const webSocket = {
  maxFragments: 8,
  maxPayloadSize: 1024
}

const dispatchers = {
  BalancedPool: () => new BalancedPool([], { webSocket }),
  EnvHttpProxyAgent: () => new EnvHttpProxyAgent({
    httpProxy: '',
    httpsProxy: '',
    noProxy: '*',
    webSocket
  }),
  ProxyAgent: () => new ProxyAgent({
    uri: 'http://localhost',
    webSocket
  }),
  RoundRobinPool: () => new RoundRobinPool('http://localhost', { webSocket }),
  Socks5ProxyAgent: () => new Socks5ProxyAgent('socks5://localhost', { webSocket }),
  // Wrappers report the options of the dispatcher they wrap.
  RetryAgent: () => new RetryAgent(new Agent({ webSocket })),
  MockAgent: () => new MockAgent({ webSocket }),
  'MockAgent({ agent })': () => new MockAgent({ agent: new Agent({ webSocket }) }),
  Dispatcher1Wrapper: () => new Dispatcher1Wrapper(new Agent({ webSocket }))
}

for (const [name, createDispatcher] of Object.entries(dispatchers)) {
  test(`${name} applies WebSocket options`, async (t) => {
    const dispatcher = createDispatcher()

    t.after(() => dispatcher.close())

    t.assert.deepStrictEqual(dispatcher.webSocketOptions, webSocket)
  })
}
