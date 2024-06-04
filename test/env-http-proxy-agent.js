'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe, after, beforeEach } = require('node:test')
const { EnvHttpProxyAgent, ProxyAgent, Agent, fetch, MockAgent } = require('..')
const { kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent, kClosed, kDestroyed, kProxy } = require('../lib/core/symbols')

const env = { ...process.env }

beforeEach(() => {
  ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy'].forEach((varname) => {
    delete process.env[varname]
  })
})

after(() => {
  process.env = { ...env }
})

test('does not create any proxy agents if http_proxy and https_proxy are not set', async (t) => {
  t = tspl(t, { plan: 4 })
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.deepStrictEqual(dispatcher[kHttpProxyAgent], dispatcher[kNoProxyAgent])
  t.deepStrictEqual(dispatcher[kHttpsProxyAgent], dispatcher[kNoProxyAgent])
  return dispatcher.close()
})

test('creates one proxy agent for both http and https when only http_proxy is defined', async (t) => {
  t = tspl(t, { plan: 5 })
  process.env.http_proxy = 'http://example.com:8080'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.ok(dispatcher[kHttpProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpProxyAgent][kProxy].uri, 'http://example.com:8080/')
  t.deepStrictEqual(dispatcher[kHttpsProxyAgent], dispatcher[kHttpProxyAgent])
  return dispatcher.close()
})

test('creates separate proxy agent for http and https when http_proxy and https_proxy are set', async (t) => {
  t = tspl(t, { plan: 6 })
  process.env.http_proxy = 'http://example.com:8080'
  process.env.https_proxy = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.ok(dispatcher[kHttpProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpProxyAgent][kProxy].uri, 'http://example.com:8080/')
  t.ok(dispatcher[kHttpsProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpsProxyAgent][kProxy].uri, 'http://example.com:8443/')
  return dispatcher.close()
})

test('handles uppercase HTTP_PROXY and HTTPS_PROXY', async (t) => {
  t = tspl(t, { plan: 6 })
  process.env.HTTP_PROXY = 'http://example.com:8080'
  process.env.HTTPS_PROXY = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.ok(dispatcher[kHttpProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpProxyAgent][kProxy].uri, 'http://example.com:8080/')
  t.ok(dispatcher[kHttpsProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpsProxyAgent][kProxy].uri, 'http://example.com:8443/')
  return dispatcher.close()
})

test('accepts httpProxy and httpsProxy options', async (t) => {
  t = tspl(t, { plan: 6 })
  const opts = {
    httpProxy: 'http://example.com:8080',
    httpsProxy: 'http://example.com:8443'
  }
  const dispatcher = new EnvHttpProxyAgent(opts)
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.ok(dispatcher[kHttpProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpProxyAgent][kProxy].uri, 'http://example.com:8080/')
  t.ok(dispatcher[kHttpsProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpsProxyAgent][kProxy].uri, 'http://example.com:8443/')
  return dispatcher.close()
})

test('prefers options over env vars', async (t) => {
  t = tspl(t, { plan: 2 })
  const opts = {
    httpProxy: 'http://opts.example.com:8080',
    httpsProxy: 'http://opts.example.com:8443'
  }
  process.env.http_proxy = 'http://lower.example.com:8080'
  process.env.https_proxy = 'http://lower.example.com:8443'
  process.env.HTTP_PROXY = 'http://upper.example.com:8080'
  process.env.HTTPS_PROXY = 'http://upper.example.com:8443'
  const dispatcher = new EnvHttpProxyAgent(opts)
  t.equal(dispatcher[kHttpProxyAgent][kProxy].uri, 'http://opts.example.com:8080/')
  t.equal(dispatcher[kHttpsProxyAgent][kProxy].uri, 'http://opts.example.com:8443/')
  return dispatcher.close()
})

test('prefers lowercase over uppercase env vars', async (t) => {
  t = tspl(t, { plan: 2 })
  process.env.HTTP_PROXY = 'http://upper.example.com:8080'
  process.env.HTTPS_PROXY = 'http://upper.example.com:8443'
  process.env.http_proxy = 'http://lower.example.com:8080'
  process.env.https_proxy = 'http://lower.example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  t.equal(dispatcher[kHttpProxyAgent][kProxy].uri, 'http://lower.example.com:8080/')
  t.equal(dispatcher[kHttpsProxyAgent][kProxy].uri, 'http://lower.example.com:8443/')
  return dispatcher.close()
})

test('prefers lowercase over uppercase env vars even when empty', async (t) => {
  t = tspl(t, { plan: 2 })
  process.env.HTTP_PROXY = 'http://upper.example.com:8080'
  process.env.HTTP_PROXY = 'http://upper.example.com:8443'
  process.env.http_proxy = ''
  process.env.https_proxy = ''
  const dispatcher = new EnvHttpProxyAgent()

  t.deepStrictEqual(dispatcher[kHttpProxyAgent], dispatcher[kNoProxyAgent])
  t.deepStrictEqual(dispatcher[kHttpsProxyAgent], dispatcher[kNoProxyAgent])
  return dispatcher.close()
})

test('creates a proxy agent only for https when only https_proxy is set', async (t) => {
  t = tspl(t, { plan: 5 })
  process.env.https_proxy = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  t.ok(dispatcher[kNoProxyAgent] instanceof Agent)
  t.ok(!(dispatcher[kNoProxyAgent] instanceof ProxyAgent))
  t.deepStrictEqual(dispatcher[kHttpProxyAgent], dispatcher[kNoProxyAgent])
  t.ok(dispatcher[kHttpsProxyAgent] instanceof ProxyAgent)
  t.equal(dispatcher[kHttpsProxyAgent][kProxy].uri, 'http://example.com:8443/')
  return dispatcher.close()
})

test('closes all agents', async (t) => {
  t = tspl(t, { plan: 3 })
  process.env.http_proxy = 'http://example.com:8080'
  process.env.https_proxy = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  await dispatcher.close()
  t.ok(dispatcher[kNoProxyAgent][kClosed])
  t.ok(dispatcher[kHttpProxyAgent][kClosed])
  t.ok(dispatcher[kHttpsProxyAgent][kClosed])
})

test('destroys all agents', async (t) => {
  t = tspl(t, { plan: 3 })
  process.env.http_proxy = 'http://example.com:8080'
  process.env.https_proxy = 'http://example.com:8443'
  const dispatcher = new EnvHttpProxyAgent()
  await dispatcher.destroy()
  t.ok(dispatcher[kNoProxyAgent][kDestroyed])
  t.ok(dispatcher[kHttpProxyAgent][kDestroyed])
  t.ok(dispatcher[kHttpsProxyAgent][kDestroyed])
})

const createEnvHttpProxyAgentWithMocks = (plan = 1, opts = {}) => {
  const factory = (origin) => {
    const mockAgent = new MockAgent()
    const mockPool = mockAgent.get(origin)
    let i = 0
    while (i < plan) {
      mockPool.intercept({ path: /.*/ }).reply(200, 'OK')
      i++
    }
    return mockPool
  }
  process.env.http_proxy = 'http://localhost:8080'
  process.env.https_proxy = 'http://localhost:8443'
  const dispatcher = new EnvHttpProxyAgent({ ...opts, factory })
  const agentSymbols = [kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent]
  agentSymbols.forEach((agentSymbol) => {
    const originalDispatch = dispatcher[agentSymbol].dispatch
    dispatcher[agentSymbol].dispatch = function () {
      dispatcher[agentSymbol].dispatch.called = true
      return originalDispatch.apply(this, arguments)
    }
    dispatcher[agentSymbol].dispatch.called = false
  })
  const usesProxyAgent = async (agent, url) => {
    await fetch(url, { dispatcher })
    const result = agentSymbols.every((agentSymbol) => agent === agentSymbol
      ? dispatcher[agentSymbol].dispatch.called === true
      : dispatcher[agentSymbol].dispatch.called === false)

    agentSymbols.forEach((agentSymbol) => {
      dispatcher[agentSymbol].dispatch.called = false
    })
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

describe('no_proxy', () => {
  test('set to *', async (t) => {
    t = tspl(t, { plan: 2 })
    process.env.no_proxy = '*'
    const { dispatcher, doesNotProxy } = createEnvHttpProxyAgentWithMocks(2)
    t.ok(await doesNotProxy('https://example.com'))
    t.ok(await doesNotProxy('http://example.com'))
    return dispatcher.close()
  })

  test('set but empty', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.no_proxy = ''
    const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks()
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
    return dispatcher.close()
  })

  test('no entries (comma)', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.no_proxy = ','
    const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks()
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
    return dispatcher.close()
  })

  test('no entries (whitespace)', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.no_proxy = ' '
    const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks()
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
    return dispatcher.close()
  })

  test('no entries (multiple whitespace / commas)', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.no_proxy = ',\t,,,\n,  ,\r'
    const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks()
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
    return dispatcher.close()
  })

  test('single host', async (t) => {
    t = tspl(t, { plan: 9 })
    process.env.no_proxy = 'example'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(9)
    t.ok(await doesNotProxy('http://example'))
    t.ok(await doesNotProxy('http://example:80'))
    t.ok(await doesNotProxy('http://example:0'))
    t.ok(await doesNotProxy('http://example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://a.b.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://host/example'))
    return dispatcher.close()
  })

  test('as an option', async (t) => {
    t = tspl(t, { plan: 9 })
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(9, { noProxy: 'example' })
    t.ok(await doesNotProxy('http://example'))
    t.ok(await doesNotProxy('http://example:80'))
    t.ok(await doesNotProxy('http://example:0'))
    t.ok(await doesNotProxy('http://example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://a.b.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://host/example'))
    return dispatcher.close()
  })

  test('subdomain', async (t) => {
    t = tspl(t, { plan: 8 })
    process.env.no_proxy = 'sub.example'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(8)
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:0'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:1337'))
    t.ok(await doesNotProxy('http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://no.sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub-example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.sub'))
    return dispatcher.close()
  })

  test('host + port', async (t) => {
    t = tspl(t, { plan: 12 })
    process.env.no_proxy = 'example:80, localhost:3000'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(12)
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
    return dispatcher.close()
  })

  test('host suffix', async (t) => {
    t = tspl(t, { plan: 9 })
    process.env.no_proxy = '.example'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(9)
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:1337'))
    t.ok(await doesNotProxy('http://sub.example'))
    t.ok(await doesNotProxy('http://sub.example:80'))
    t.ok(await doesNotProxy('http://sub.example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await doesNotProxy('http://a.b.example'))
    return dispatcher.close()
  })

  test('host suffix with *.', async (t) => {
    t = tspl(t, { plan: 9 })
    process.env.no_proxy = '*.example'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(9)
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example:1337'))
    t.ok(await doesNotProxy('http://sub.example'))
    t.ok(await doesNotProxy('http://sub.example:80'))
    t.ok(await doesNotProxy('http://sub.example:1337'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.no'))
    t.ok(await doesNotProxy('http://a.b.example'))
    return dispatcher.close()
  })

  test('substring suffix', async (t) => {
    t = tspl(t, { plan: 10 })
    process.env.no_proxy = '*example'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(10)
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
    return dispatcher.close()
  })

  test('arbitrary wildcards are NOT supported', async (t) => {
    t = tspl(t, { plan: 6 })
    process.env.no_proxy = '.*example'
    const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(6)
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://x.prefexample'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://a.b.example'))
    return dispatcher.close()
  })

  test('IP addresses', async (t) => {
    t = tspl(t, { plan: 12 })
    process.env.no_proxy = '[::1],[::2]:80,10.0.0.1,10.0.0.2:80'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(12)
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
    return dispatcher.close()
  })

  test('CIDR is NOT supported', async (t) => {
    t = tspl(t, { plan: 2 })
    process.env.no_proxy = '127.0.0.1/32'
    const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(2)
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://127.0.0.1'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://127.0.0.1/32'))
    return dispatcher.close()
  })

  test('127.0.0.1 does NOT match localhost', async (t) => {
    t = tspl(t, { plan: 2 })
    process.env.no_proxy = '127.0.0.1'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(2)
    t.ok(await doesNotProxy('http://127.0.0.1'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://localhost'))
    return dispatcher.close()
  })

  test('protocols that have a default port', async (t) => {
    t = tspl(t, { plan: 6 })
    process.env.no_proxy = 'xxx:21,xxx:70,xxx:80,xxx:443'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(6)
    t.ok(await doesNotProxy('http://xxx'))
    t.ok(await doesNotProxy('http://xxx:80'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://xxx:1337'))
    t.ok(await doesNotProxy('https://xxx'))
    t.ok(await doesNotProxy('https://xxx:443'))
    t.ok(await usesProxyAgent(kHttpsProxyAgent, 'https://xxx:1337'))
    return dispatcher.close()
  })

  test('should not be case sensitive', async (t) => {
    t = tspl(t, { plan: 6 })
    process.env.NO_PROXY = 'XXX YYY ZzZ'
    const { dispatcher, doesNotProxy } = createEnvHttpProxyAgentWithMocks(6)
    t.ok(await doesNotProxy('http://xxx'))
    t.ok(await doesNotProxy('http://XXX'))
    t.ok(await doesNotProxy('http://yyy'))
    t.ok(await doesNotProxy('http://YYY'))
    t.ok(await doesNotProxy('http://ZzZ'))
    t.ok(await doesNotProxy('http://zZz'))
    return dispatcher.close()
  })

  test('prefers lowercase over uppercase', async (t) => {
    t = tspl(t, { plan: 2 })
    process.env.NO_PROXY = 'sub.example.com'
    process.env.no_proxy = 'example.com'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(6)
    t.ok(await doesNotProxy('http://example.com'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example.com'))
    return dispatcher.close()
  })

  test('prefers lowercase over uppercase even when it is empty', async (t) => {
    t = tspl(t, { plan: 1 })
    process.env.NO_PROXY = 'example.com'
    process.env.no_proxy = ''
    const { dispatcher, usesProxyAgent } = createEnvHttpProxyAgentWithMocks()
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
    return dispatcher.close()
  })

  test('handles env var changes', async (t) => {
    t = tspl(t, { plan: 4 })
    process.env.no_proxy = 'example.com'
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(4)
    t.ok(await doesNotProxy('http://example.com'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example.com'))
    process.env.no_proxy = 'sub.example.com'
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://example.com'))
    t.ok(await doesNotProxy('http://sub.example.com'))
    return dispatcher.close()
  })

  test('ignores env var changes when set via config', async (t) => {
    t = tspl(t, { plan: 4 })
    const { dispatcher, doesNotProxy, usesProxyAgent } = createEnvHttpProxyAgentWithMocks(4, { noProxy: 'example.com' })
    t.ok(await doesNotProxy('http://example.com'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example.com'))
    process.env.no_proxy = 'sub.example.com'
    t.ok(await doesNotProxy('http://example.com'))
    t.ok(await usesProxyAgent(kHttpProxyAgent, 'http://sub.example.com'))
    return dispatcher.close()
  })
})
