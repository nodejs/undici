'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe, after, beforeEach, afterEach } = require('node:test')
const sinon = require('sinon')
const { EnvHttpProxyAgent, ProxyAgent, Agent, fetch, MockAgent } = require('..')
const { kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent, kClosed, kDestroyed } = require('../lib/core/symbols')

const env = { ...process.env }

beforeEach(() => {
  ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy'].forEach((varname) => {
    delete process.env[varname]
  })
})

after(() => {
  process.env = { ...env }
})

test('does not create any proxy agents if HTTP_PROXY and HTTPS_PROXY are not set', async (t) => {
  t = tspl(t, { plan: 4 })
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.deepStrictEqual(dispatcher[kHttpProxyAgent], dispatcher[kNoProxyAgent])
  t.deepStrictEqual(dispatcher[kHttpsProxyAgent], dispatcher[kNoProxyAgent])
  return dispatcher.close()
})

test('creates one proxy agent for both http and https when only HTTP_PROXY is defined', async (t) => {
  t = tspl(t, { plan: 4 })
  process.env.HTTP_PROXY = 'http://example.com:8080'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.ok(dispatcher[kHttpProxyAgent] instanceof ProxyAgent)
  t.deepStrictEqual(dispatcher[kHttpsProxyAgent], dispatcher[kHttpProxyAgent])
  return dispatcher.close()
})

test('creates separate proxy agent for http and https when HTTP_PROXY and HTTPS_PROXY are set', async (t) => {
  t = tspl(t, { plan: 5 })
  process.env.HTTP_PROXY = 'http://example.com:8080'
  process.env.HTTPS_PROXY = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.ok(dispatcher[kHttpProxyAgent] instanceof ProxyAgent)
  t.notDeepStrictEqual(dispatcher[kHttpsProxyAgent], dispatcher[kHttpProxyAgent])
  t.ok(dispatcher[kHttpsProxyAgent] instanceof ProxyAgent)
  return dispatcher.close()
})

test('handles lowercase http_proxy and https_proxy', async (t) => {
  t = tspl(t, { plan: 5 })
  process.env.http_proxy = 'http://example.com:8080'
  process.env.https_proxy = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.ok(dispatcher[kHttpProxyAgent] instanceof ProxyAgent)
  t.notDeepStrictEqual(dispatcher[kHttpsProxyAgent], dispatcher[kHttpProxyAgent])
  t.ok(dispatcher[kHttpsProxyAgent] instanceof ProxyAgent)
  return dispatcher.close()
})

test('creates a proxy agent only for https when only HTTPS_PROXY is set', async (t) => {
  t = tspl(t, { plan: 4 })
  process.env.HTTPS_PROXY = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.deepStrictEqual(dispatcher[kHttpProxyAgent], dispatcher[kNoProxyAgent])
  t.ok(dispatcher[kHttpsProxyAgent] instanceof ProxyAgent)
  return dispatcher.close()
})

test('closes all agents', async (t) => {
  t = tspl(t, { plan: 3 })
  process.env.HTTP_PROXY = 'http://example.com:8080'
  process.env.HTTPS_PROXY = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  await dispatcher.close()
  t.ok(dispatcher[kNoProxyAgent][kClosed])
  t.ok(dispatcher[kHttpProxyAgent][kClosed])
  t.ok(dispatcher[kHttpsProxyAgent][kClosed])
})

test('destroys all agents', async (t) => {
  t = tspl(t, { plan: 3 })
  process.env.HTTP_PROXY = 'http://example.com:8080'
  process.env.HTTPS_PROXY = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  await dispatcher.destroy()
  t.ok(dispatcher[kNoProxyAgent][kDestroyed])
  t.ok(dispatcher[kHttpProxyAgent][kDestroyed])
  t.ok(dispatcher[kHttpsProxyAgent][kDestroyed])
})

const createEnvHttpProxyAgentWithMocks = () => {
  const testPaths = ['/', '/example', '/32']
  const mockAgent = new MockAgent()
  let mockPool
  const factory = (origin) => {
    mockPool = mockAgent.get(origin)
    testPaths.forEach((path) => mockPool.intercept({ path }).reply(200, 'OK'))
    return mockPool
  }
  process.env.HTTP_PROXY = 'http://localhost:8080'
  process.env.HTTPS_PROXY = 'http://localhost:8443'
  const dispatcher = new EnvHttpProxyAgent({ factory })
  const agentSymbols = [kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent]
  agentSymbols.forEach((agent) => {
    sinon.spy(dispatcher[agent], 'dispatch')
  })
  const reset = () => agentSymbols.forEach((agent) => {
    dispatcher[agent].dispatch.resetHistory()
    testPaths.forEach((path) => mockPool.intercept({ path }).reply(200, 'OK'))
  })
  const usesProxyAgent = async (agent, url) => {
    await fetch(url, { dispatcher })
    const result = agentSymbols.every((agentSymbol) => agent === agentSymbol
      ? dispatcher[agentSymbol].dispatch.called
      : dispatcher[agentSymbol].dispatch.notCalled)
    reset()
    return result
  }
  const doesNotProxy = usesProxyAgent.bind(this, kNoProxyAgent)
  return {
    dispatcher,
    doesNotProxy,
    usesProxyAgent
  }
}

test('uses the appropriate proxy for the protocol', async (t) => {
  t = tspl(t, { plan: 2 })
  const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks()
  t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com/'))
  t.ok(await usesProxyAgent(kHttpsProxyAgent, 'https://example.com/'))
  return dispatcher.close()
})

describe('NO_PROXY', () => {
  let dispatcher
  let doesNotProxy
  let usesProxyAgent

  beforeEach(() => {
    ({ dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks())
  })

  afterEach(() => dispatcher.close())

  test('set to *', async (t) => {
    t = tspl(t, { plan: 2 })
    process.env.NO_PROXY = '*'
    t.ok(await doesNotProxy('https://example.com'))
    t.ok(await doesNotProxy('http://example.com'))
  })

  test('set but empty', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.NO_PROXY = ''
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
  })

  test('no entries (comma)', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.NO_PROXY = ','
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
  })

  test('no entries (whitespace)', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.NO_PROXY = ' '
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
  })

  test('no entries (multiple whitespace / commas)', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.NO_PROXY = ',\t,,,\n,  ,\r'
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
  })

  test('single host', async (t) => {
    t = tspl(t, { plan: 9 })
    process.env.NO_PROXY = 'example'
    t.ok(await doesNotProxy('http://example'))
    t.ok(await doesNotProxy('http://example:80'))
    t.ok(await doesNotProxy('http://example:0'))
    t.ok(await doesNotProxy('http://example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://a.b.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://host/example'))
  })

  test('subdomain', async (t) => {
    t = tspl(t, { plan: 8 })
    process.env.NO_PROXY = 'sub.example'
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:0'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:1337'))
    t.ok(await doesNotProxy('http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://no.sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub-example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.sub'))
  })

  test('host + port', async (t) => {
    t = tspl(t, { plan: 12 })
    process.env.NO_PROXY = 'example:80, localhost:3000'
    t.ok(await doesNotProxy('http://example'))
    t.ok(await doesNotProxy('http://example:80'))
    t.ok(await doesNotProxy('http://example:0'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://a.b.example'))
    t.ok(await doesNotProxy('http://localhost:3000/'))
    t.ok(await doesNotProxy('https://localhost:3000/'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://localhost:3001/'))
    t.ok(await usesProxyAgent(kHttpsProxyAgent, 'https://localhost:3001/'))
  })

  test('host suffix', async (t) => {
    t = tspl(t, { plan: 9 })
    process.env.NO_PROXY = '.example'
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:1337'))
    t.ok(await doesNotProxy('http://sub.example'))
    t.ok(await doesNotProxy('http://sub.example:80'))
    t.ok(await doesNotProxy('http://sub.example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await doesNotProxy('http://a.b.example'))
  })

  test('host suffix with *.', async (t) => {
    t = tspl(t, { plan: 9 })
    process.env.NO_PROXY = '*.example'
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:1337'))
    t.ok(await doesNotProxy('http://sub.example'))
    t.ok(await doesNotProxy('http://sub.example:80'))
    t.ok(await doesNotProxy('http://sub.example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await doesNotProxy('http://a.b.example'))
  })

  test('substring suffix', async (t) => {
    t = tspl(t, { plan: 10 })
    process.env.NO_PROXY = '*example'
    t.ok(await doesNotProxy('http://example'))
    t.ok(await doesNotProxy('http://example:80'))
    t.ok(await doesNotProxy('http://example:1337'))
    t.ok(await doesNotProxy('http://sub.example'))
    t.ok(await doesNotProxy('http://sub.example:80'))
    t.ok(await doesNotProxy('http://sub.example:1337'))
    t.ok(await doesNotProxy('http://prefexample'))
    t.ok(await doesNotProxy('http://a.b.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://host/example'))
  })

  test('arbitrary wildcards are NOT supported', async (t) => {
    t = tspl(t, { plan: 6 })
    process.env.NO_PROXY = '.*example'
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://x.prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://a.b.example'))
  })

  test('IP addresses', async (t) => {
    t = tspl(t, { plan: 12 })
    process.env.NO_PROXY = '[::1],[::2]:80,10.0.0.1,10.0.0.2:80'
    t.ok(await doesNotProxy('http://[::1]/'))
    t.ok(await doesNotProxy('http://[::1]:80/'))
    t.ok(await doesNotProxy('http://[::1]:1337/'))
    t.ok(await doesNotProxy('http://[::2]/'))
    t.ok(await doesNotProxy('http://[::2]:80/'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://[::2]:1337/'))
    t.ok(await doesNotProxy('http://10.0.0.1/'))
    t.ok(await doesNotProxy('http://10.0.0.1:80/'))
    t.ok(await doesNotProxy('http://10.0.0.1:1337/'))
    t.ok(await doesNotProxy('http://10.0.0.2/'))
    t.ok(await doesNotProxy('http://10.0.0.2:80/'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://10.0.0.2:1337/'))
  })

  test('CIDR is NOT supported', async (t) => {
    t = tspl(t, { plan: 2 })
    env.NO_PROXY = '127.0.0.1/32'
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://127.0.0.1'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://127.0.0.1/32'))
  })

  test('127.0.0.1 does NOT match localhost', async (t) => {
    t = tspl(t, { plan: 2 })
    process.env.NO_PROXY = '127.0.0.1'
    t.ok(await doesNotProxy('http://127.0.0.1'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://localhost'))
  })

  test('protocols that have a default port', async (t) => {
    t = tspl(t, { plan: 6 })
    process.env.NO_PROXY = 'xxx:21,xxx:70,xxx:80,xxx:443'
    t.ok(await doesNotProxy('http://xxx'))
    t.ok(await doesNotProxy('http://xxx:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://xxx:1337'))
    t.ok(await doesNotProxy('https://xxx'))
    t.ok(await doesNotProxy('https://xxx:443'))
    t.ok(await usesProxyAgent(kHttpsProxyAgent, 'https://xxx:1337'))
  })

  test('should not be case-sensitive', async (t) => {
    t = tspl(t, { plan: 6 })
    process.env.no_proxy = 'XXX YYY ZzZ'
    t.ok(await doesNotProxy('http://xxx'))
    t.ok(await doesNotProxy('http://XXX'))
    t.ok(await doesNotProxy('http://yyy'))
    t.ok(await doesNotProxy('http://YYY'))
    t.ok(await doesNotProxy('http://ZzZ'))
    t.ok(await doesNotProxy('http://zZz'))
  })
})
