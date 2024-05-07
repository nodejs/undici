'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { strictEqual, throws, doesNotThrow } = require('node:assert')
const { test, describe } = require('node:test')
const { isBlobLike, parseURL, isHttpOrHttpsPrefixed, isValidPort } = require('../lib/core/util')
const { Blob, File } = require('node:buffer')
const { InvalidArgumentError } = require('../lib/core/errors')
const timers = require('../lib/util/timers')

describe('isBlobLike', () => {
  test('buffer', () => {
    const buffer = Buffer.alloc(1)
    strictEqual(isBlobLike(buffer), false)
  })

  test('blob', { skip: !Blob }, () => {
    const blob = new Blob(['asd'], {
      type: 'application/json'
    })
    strictEqual(isBlobLike(blob), true)
  })

  test('file', { skip: !File }, () => {
    const file = new File(['asd'], 'file.txt', {
      type: 'text/plain'
    })
    strictEqual(isBlobLike(file), true)
  })

  test('blobLikeStream', () => {
    const blobLikeStream = {
      [Symbol.toStringTag]: 'Blob',
      stream: () => { }
    }
    strictEqual(isBlobLike(blobLikeStream), true)
  })

  test('fileLikeStream', () => {
    const fileLikeStream = {
      stream: () => { },
      [Symbol.toStringTag]: 'File'
    }
    strictEqual(isBlobLike(fileLikeStream), true)
  })

  test('fileLikeArrayBuffer', () => {
    const blobLikeArrayBuffer = {
      [Symbol.toStringTag]: 'Blob',
      arrayBuffer: () => { }
    }
    strictEqual(isBlobLike(blobLikeArrayBuffer), true)
  })

  test('blobLikeArrayBuffer', () => {
    const fileLikeArrayBuffer = {
      [Symbol.toStringTag]: 'File',
      arrayBuffer: () => { }
    }
    strictEqual(isBlobLike(fileLikeArrayBuffer), true)
  })

  test('string', () => {
    strictEqual(isBlobLike('Blob'), false)
  })

  test('null', () => {
    strictEqual(isBlobLike(null), false)
  })
})

describe('isHttpOrHttpsPrefixed', () => {
  test('returns false for invalid values', () => {
    strictEqual(isHttpOrHttpsPrefixed('wss:'), false)
  })
  test('returns true for "http:" or "https:"', () => {
    strictEqual(isHttpOrHttpsPrefixed('http:'), true)
    strictEqual(isHttpOrHttpsPrefixed('https:'), true)
  })
})

describe('isValidPort', () => {
  test('returns false for invalid values', () => {
    strictEqual(isValidPort(NaN), false)
    strictEqual(isValidPort(Infinity), false)
    strictEqual(isValidPort(-Infinity), false)
    strictEqual(isValidPort(NaN.toString()), false)
    strictEqual(isValidPort(Infinity.toString()), false)
    strictEqual(isValidPort(-Infinity.toString()), false)
    strictEqual(isValidPort('port'), false)
    strictEqual(isValidPort('65535i'), false)
  })
  test('returns true for port in range of 0 to 65535 as number', () => {
    for (let i = 0; i < 65536; i++) {
      strictEqual(isValidPort(i), true)
    }
  })
  test('returns true for port in range of 0 to 65535 as string', () => {
    for (let i = 0; i < 65536; i++) {
      strictEqual(isValidPort(i.toString()), true)
    }
  })
})

describe('parseURL', () => {
  test('throws if url is not a string or object', () => {
    throws(() => { parseURL(null) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    throws(() => { parseURL(1) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    throws(() => { parseURL(true) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    throws(() => { parseURL(false) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    throws(() => { parseURL(false) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
  })
  test('throws if protocol is not beginning with http:', () => {
    throws(() => { parseURL('ws://www.example.com') }, new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.'))
  })
  test('throws if protocol is not beginning with https:', () => {
    throws(() => { parseURL('wss://www.example.com') }, new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.'))
  })
  test('returns an URL object if url is a string of an https URL', () => {
    const url = parseURL('https://www.example.com')
    strictEqual(url instanceof URL, true)
    strictEqual(url.href, 'https://www.example.com/')
  })
  test('returns an URL object if url is a string of an http URL', () => {
    const url = parseURL('http://www.example.com')
    strictEqual(url instanceof URL, true)
    strictEqual(url.href, 'http://www.example.com/')
  })

  describe('when url is an instance of URL', () => {
    test('returns the same URL object', () => {
      const url = new URL('https://www.example.com')
      const parsedURL = parseURL(url)
      strictEqual(parsedURL, url)
    })
    test('throws if the URL protocol is not http: or https:', () => {
      const url = new URL('ws://www.example.com')
      throws(() => { parseURL(url) }, new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.'))
    })
    test('passes if the URL protocol is http:', () => {
      const url = new URL('http://www.example.com')
      delete url.origin
      doesNotThrow(() => { parseURL(url) })
    })
    test('passes if the URL protocol is https:', () => {
      const url = new URL('https://www.example.com')
      delete url.origin
      doesNotThrow(() => { parseURL(url) })
    })
    test('passes if the URL protocol is http:', () => {
      const url = new URL('http://www.example.com')
      doesNotThrow(() => { parseURL(url) })
    })
    test('passes if the URL protocol is https:', () => {
      const url = new URL('https://www.example.com')
      doesNotThrow(() => { parseURL(url) })
    })
  })

  describe('when url is an common object', () => {
    test.skip('does not throw if a urlLike object is passed', () => {
      const url = parseURL({ protocol: 'http:' })
      console.log(url)
    })

    describe('port', () => {
      test('throws if port is not an finite number as string', () => {
        throws(() => parseURL({ protocol: 'http:', port: 'NaN' }), new InvalidArgumentError('Invalid URL: port must be a valid integer or a string representation of an integer.'))
      })
      test('doesn\'t throw if port is valid number', () => {
        for (let i = 0; i < 65536; i++) {
          doesNotThrow(() => parseURL({ protocol: 'http:', hostname: 'www.example.com', port: i.toString() }), i.toString())
        }
      })
      test('throws if port is invalid number', () => {
        throws(() => parseURL({ protocol: 'http:', port: '-1' }), new InvalidArgumentError('Invalid URL: port must be a valid integer or a string representation of an integer.'))
        throws(() => parseURL({ protocol: 'http:', port: '65536' }), new InvalidArgumentError('Invalid URL: port must be a valid integer or a string representation of an integer.'))
      })
      test('sets port based on protocol', () => {
        strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '/' }).port, '')
        strictEqual(parseURL({ protocol: 'https:', hostname: 'www.example.com', path: '/' }).port, '')
      })
      test('don\'t override port with protocol if port was explicitly set', () => {
        strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '/', port: 1337 }).port, '1337')
        strictEqual(parseURL({ protocol: 'https:', hostname: 'www.example.com', path: '/', port: 1337 }).port, '1337')
      })
    })

    describe('path', () => {
      test('doesn\'t throw if path null or undefined', () => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', path: null })
        parseURL({ protocol: 'http:', hostname: 'www.example.com', path: undefined })
      })
      test('throws if path is not as string', () => {
        throws(() => parseURL({ protocol: 'http:', hostname: 'www.example.com', path: 1 }), new InvalidArgumentError('Invalid URL path: the path must be a string or null/undefined.'))
      })
      test('doesn\'t throw if path is a string', () => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '/' })
      })
      test('accepts path with and without leading /', () => {
        strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: 'abc' }).pathname, '/abc')
        strictEqual(parseURL({ protocol: 'https:', hostname: 'www.example.com', path: '/abc' }).pathname, '/abc')
      })
    })

    describe('pathname', () => {
      test('doesn\'t throw if pathname null or undefined', () => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', pathname: null })
        parseURL({ protocol: 'http:', hostname: 'www.example.com', pathname: undefined })
      })
      test('throws if pathname is not as string', () => {
        throws(() => parseURL({ protocol: 'http:', pathname: 1 }), new InvalidArgumentError('Invalid URL pathname: the pathname must be a string or null/undefined.'))
      })
      test('doesn\'t throw if pathname is a string', () => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', pathname: '/' })
      })
    })

    describe('hostname', () => {
      test('doesn\'t throw if hostname null or undefined', () => {
        parseURL({ protocol: 'http:', hostname: null, origin: 'http://www.example.com' })
        parseURL({ protocol: 'http:', hostname: undefined, origin: 'http://www.example.com' })
      })
      test('throws if hostname is not as string', () => {
        throws(() => parseURL({ protocol: 'http:', hostname: 1 }), new InvalidArgumentError('Invalid URL hostname: the hostname must be a string or null/undefined.'))
      })
      test('doesn\'t throw if hostname is a string', () => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com' })
      })
    })

    describe('origin', () => {
      test('doesn\'t throw if origin null or undefined', () => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', origin: null })
        parseURL({ protocol: 'http:', hostname: 'www.example.com', origin: undefined })
      })
      test('throws if origin is not as string', () => {
        throws(() => parseURL({ protocol: 'http:', origin: 1 }), new InvalidArgumentError('Invalid URL origin: the origin must be a string or null/undefined.'))
      })
      test('doesn\'t throw if origin is a string', () => {
        parseURL({ protocol: 'http:', origin: 'https://www.example.com' })
      })
      test('removes trailing /', () => {
        strictEqual(parseURL({ protocol: 'http:', origin: 'https://www.example.com/' }).origin, 'https://www.example.com')
      })
    })

    describe('protocol', () => {
      test('throws if protocol is not http: or https: and no origin is defined', () => {
        throws(() => parseURL({ protocol: 'wss:', hostname: 'www.example.com', path: '' }))
      })
      test('doesn\'t throw when origin is not provided', () => {
        strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '' }).origin, 'http://www.example.com')
      })
    })
  })
})

describe('timers', () => {
  const getDelta = (start, target) => {
    const end = process.hrtime.bigint()
    const actual = (end - start) / 1_000_000n
    return actual - BigInt(target)
  }

  // timers.setTimeout implements a low resolution timer with a 500 ms granularity
  // It is expected that in the worst case, a timer will fire about 500 ms after the
  // intended amount of time, an extra 200 ms is added to account event loop overhead
  // Timers should never fire excessively early, 1ms early is tolerated
  const ACCEPTABLE_DELTA = 700n

  test('meet acceptable resolution time', async (t) => {
    const testTimeouts = [0, 1, 499, 500, 501, 990, 999, 1000, 1001, 1100, 1400, 1499, 1500, 4000, 5000]

    t = tspl(t, { plan: 1 + testTimeouts.length * 2 })

    const start = process.hrtime.bigint()

    for (const target of testTimeouts) {
      timers.setTimeout(() => {
        const delta = getDelta(start, target)

        t.ok(delta >= -1n, `${target}ms fired early`)
        t.ok(delta < ACCEPTABLE_DELTA, `${target}ms fired late`)
      }, target)
    }

    setTimeout(() => t.ok(true), 6000)
    await t.completed
  })

  test('refresh correctly with timeout < TICK_MS', async (t) => {
    t = tspl(t, { plan: 3 })

    const start = process.hrtime.bigint()

    const timeout = timers.setTimeout(() => {
      // 400 ms timer was refreshed after 600ms; total target is 1000
      const delta = getDelta(start, 1000)

      t.ok(delta >= -1n, 'refreshed timer fired early')
      t.ok(delta < ACCEPTABLE_DELTA, 'refreshed timer fired late')
    }, 400)

    setTimeout(() => timeout.refresh(), 200)
    setTimeout(() => timeout.refresh(), 400)
    setTimeout(() => timeout.refresh(), 600)

    setTimeout(() => t.ok(true), 1500)
    await t.completed
  })

  test('refresh correctly with timeout > TICK_MS', async (t) => {
    t = tspl(t, { plan: 3 })

    const start = process.hrtime.bigint()

    const timeout = timers.setTimeout(() => {
      // 501ms timer was refreshed after 1250ms; total target is 1751
      const delta = getDelta(start, 1751)

      t.ok(delta >= -1n, 'refreshed timer fired early')
      t.ok(delta < ACCEPTABLE_DELTA, 'refreshed timer fired late')
    }, 501)

    setTimeout(() => timeout.refresh(), 250)
    setTimeout(() => timeout.refresh(), 750)
    setTimeout(() => timeout.refresh(), 1250)

    setTimeout(() => t.ok(true), 3000)
    await t.completed
  })
})
