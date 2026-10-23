'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { ProxyAgent, EnvHttpProxyAgent, errors } = require('..')

// Regression test for https://github.com/nodejs/undici/issues/6082
test('unsupported proxy scheme error names the scheme and lists supported ones', (t) => {
  t = tspl(t, { plan: 4 })

  t.throws(
    () => new ProxyAgent('socks5h://127.0.0.1:1080'),
    new errors.InvalidArgumentError("Unsupported proxy protocol 'socks5h:'. Supported: http:, https:, socks5:, socks:")
  )

  t.throws(
    () => new ProxyAgent('socks4://127.0.0.1:1080'),
    new errors.InvalidArgumentError("Unsupported proxy protocol 'socks4:'. Supported: http:, https:, socks5:, socks:")
  )

  t.throws(
    () => new ProxyAgent({ uri: 'ftp://127.0.0.1:1080' }),
    new errors.InvalidArgumentError("Unsupported proxy protocol 'ftp:'. Supported: http:, https:, socks5:, socks:")
  )

  const originalHttpProxy = process.env.HTTP_PROXY
  try {
    process.env.HTTP_PROXY = 'socks5h://127.0.0.1:1080'
    t.throws(
      () => new EnvHttpProxyAgent(),
      new errors.InvalidArgumentError("Unsupported proxy protocol 'socks5h:'. Supported: http:, https:, socks5:, socks:")
    )
  } finally {
    if (originalHttpProxy !== undefined) {
      process.env.HTTP_PROXY = originalHttpProxy
    } else {
      delete process.env.HTTP_PROXY
    }
  }
})
