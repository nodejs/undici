'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { ProxyAgent, EnvHttpProxyAgent } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')

// Regression test for https://github.com/nodejs/undici/issues/6082
//
// Proxy URIs with an unsupported scheme fell through to the HTTP proxy path and
// failed in parseOrigin with "the URL must start with `http:` or `https:`",
// which is misleading because socks5: and socks: are supported too.
const expected = (protocol) => ({
  name: 'InvalidArgumentError',
  code: 'UND_ERR_INVALID_ARG',
  message: `Unsupported proxy protocol '${protocol}'. Supported protocols: http:, https:, socks5:, socks:`
})

test('ProxyAgent rejects unsupported proxy protocols with a descriptive error', () => {
  for (const [uri, protocol] of [
    ['socks5h://127.0.0.1:1080', 'socks5h:'],
    ['socks4://127.0.0.1:1080', 'socks4:'],
    ['ftp://127.0.0.1:21', 'ftp:'],
    ['localhost:8080', 'localhost:']
  ]) {
    assert.throws(() => new ProxyAgent(uri), expected(protocol))
    assert.throws(() => new ProxyAgent(new URL(uri)), expected(protocol))
    assert.throws(() => new ProxyAgent({ uri }), expected(protocol))
  }
})

test('ProxyAgent rejects unsupported proxy protocols before calling clientFactory', () => {
  assert.throws(() => new ProxyAgent({
    uri: 'socks5h://127.0.0.1:1080',
    clientFactory: () => assert.fail('clientFactory should not be called')
  }), InvalidArgumentError)
})

test('ProxyAgent accepts supported proxy protocols case-insensitively', async (t) => {
  for (const uri of [
    'http://127.0.0.1:8080',
    'https://127.0.0.1:8443',
    'socks5://127.0.0.1:1080',
    'socks://127.0.0.1:1080',
    'SOCKS5://127.0.0.1:1080',
    'HTTP://127.0.0.1:8080'
  ]) {
    const agent = new ProxyAgent(uri)
    t.after(() => agent.close())
  }
})

test('EnvHttpProxyAgent rejects unsupported proxy protocols with a descriptive error', () => {
  assert.throws(() => new EnvHttpProxyAgent({ httpProxy: 'socks5h://127.0.0.1:1080' }), expected('socks5h:'))
  assert.throws(() => new EnvHttpProxyAgent({ httpsProxy: 'socks4://127.0.0.1:1080' }), expected('socks4:'))
})
