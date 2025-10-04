'use strict'

const { test, describe } = require('node:test')
const { isBlobLike, parseURL, isHttpOrHttpsPrefixed, isValidPort } = require('../lib/core/util')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('isBlobLike', () => {
  test('buffer', (t) => {
    const buffer = Buffer.alloc(1)
    t.assert.strictEqual(isBlobLike(buffer), false)
  })

  test('blob', (t) => {
    const blob = new Blob(['asd'], {
      type: 'application/json'
    })
    t.assert.strictEqual(isBlobLike(blob), true)
  })

  test('file', (t) => {
    const file = new File(['asd'], 'file.txt', {
      type: 'text/plain'
    })
    t.assert.strictEqual(isBlobLike(file), true)
  })

  test('blobLikeStream', (t) => {
    const blobLikeStream = {
      [Symbol.toStringTag]: 'Blob',
      stream: () => { }
    }
    t.assert.strictEqual(isBlobLike(blobLikeStream), true)
  })

  test('fileLikeStream', (t) => {
    const fileLikeStream = {
      stream: () => { },
      [Symbol.toStringTag]: 'File'
    }
    t.assert.strictEqual(isBlobLike(fileLikeStream), true)
  })

  test('fileLikeArrayBuffer', (t) => {
    const blobLikeArrayBuffer = {
      [Symbol.toStringTag]: 'Blob',
      arrayBuffer: () => { }
    }
    t.assert.strictEqual(isBlobLike(blobLikeArrayBuffer), true)
  })

  test('blobLikeArrayBuffer', (t) => {
    const fileLikeArrayBuffer = {
      [Symbol.toStringTag]: 'File',
      arrayBuffer: () => { }
    }
    t.assert.strictEqual(isBlobLike(fileLikeArrayBuffer), true)
  })

  test('string', (t) => {
    t.assert.strictEqual(isBlobLike('Blob'), false)
  })

  test('null', (t) => {
    t.assert.strictEqual(isBlobLike(null), false)
  })
})

describe('isHttpOrHttpsPrefixed', () => {
  test('returns false for invalid values', (t) => {
    t.assert.strictEqual(isHttpOrHttpsPrefixed('wss:'), false)
  })
  test('returns true for "http:" or "https:"', (t) => {
    t.assert.strictEqual(isHttpOrHttpsPrefixed('http:'), true)
    t.assert.strictEqual(isHttpOrHttpsPrefixed('https:'), true)
  })
})

describe('isValidPort', () => {
  test('returns false for invalid values', (t) => {
    t.assert.strictEqual(isValidPort(NaN), false)
    t.assert.strictEqual(isValidPort(Infinity), false)
    t.assert.strictEqual(isValidPort(-Infinity), false)
    t.assert.strictEqual(isValidPort(NaN.toString()), false)
    t.assert.strictEqual(isValidPort(Infinity.toString()), false)
    t.assert.strictEqual(isValidPort(-Infinity.toString()), false)
    t.assert.strictEqual(isValidPort('port'), false)
    t.assert.strictEqual(isValidPort('65535i'), false)
  })
  test('returns true for port in range of 0 to 65535 as number', (t) => {
    for (let i = 0; i < 65536; i++) {
      t.assert.strictEqual(isValidPort(i), true)
    }
  })
  test('returns true for port in range of 0 to 65535 as string', (t) => {
    for (let i = 0; i < 65536; i++) {
      t.assert.strictEqual(isValidPort(i.toString()), true)
    }
  })
})

describe('parseURL', () => {
  test('throws if url is not a string or object', (t) => {
    t.assert.throws(() => { parseURL(null) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    t.assert.throws(() => { parseURL(1) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    t.assert.throws(() => { parseURL(true) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    t.assert.throws(() => { parseURL(false) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
    t.assert.throws(() => { parseURL(false) }, new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.'))
  })
  test('throws if protocol is not beginning with http:', (t) => {
    t.assert.throws(() => { parseURL('ws://www.example.com') }, new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.'))
  })
  test('throws if protocol is not beginning with https:', (t) => {
    t.assert.throws(() => { parseURL('wss://www.example.com') }, new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.'))
  })
  test('returns an URL object if url is a string of an https URL', (t) => {
    const url = parseURL('https://www.example.com')
    t.assert.strictEqual(url instanceof URL, true)
    t.assert.strictEqual(url.href, 'https://www.example.com/')
  })
  test('returns an URL object if url is a string of an http URL', (t) => {
    const url = parseURL('http://www.example.com')
    t.assert.strictEqual(url instanceof URL, true)
    t.assert.strictEqual(url.href, 'http://www.example.com/')
  })

  describe('when url is an instance of URL', () => {
    test('returns the same URL object', (t) => {
      const url = new URL('https://www.example.com')
      const parsedURL = parseURL(url)
      t.assert.strictEqual(parsedURL, url)
    })
    test('throws if the URL protocol is not http: or https:', (t) => {
      const url = new URL('ws://www.example.com')
      t.assert.throws(() => { parseURL(url) }, new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.'))
    })
    test('passes if the URL protocol is http:', (t) => {
      const url = new URL('http://www.example.com')
      delete url.origin
      t.assert.doesNotThrow(() => { parseURL(url) })
    })
    test('passes if the URL protocol is https:', (t) => {
      const url = new URL('https://www.example.com')
      delete url.origin
      t.assert.doesNotThrow(() => { parseURL(url) })
    })
    test('passes if the URL protocol is http:', (t) => {
      const url = new URL('http://www.example.com')
      t.assert.doesNotThrow(() => { parseURL(url) })
    })
    test('passes if the URL protocol is https:', (t) => {
      const url = new URL('https://www.example.com')
      t.assert.doesNotThrow(() => { parseURL(url) })
    })
  })

  describe('when url is an common object', () => {
    test.skip('does not throw if a urlLike object is passed', (t) => {
      const url = parseURL({ protocol: 'http:' })
      console.log(url)
    })

    describe('port', () => {
      test('throws if port is not an finite number as string', (t) => {
        t.assert.throws(() => parseURL({ protocol: 'http:', port: 'NaN' }), new InvalidArgumentError('Invalid URL: port must be a valid integer or a string representation of an integer.'))
      })
      test('doesn\'t throw if port is valid number', (t) => {
        for (let i = 0; i < 65536; i++) {
          t.assert.doesNotThrow(() => parseURL({ protocol: 'http:', hostname: 'www.example.com', port: i.toString() }), i.toString())
        }
      })
      test('throws if port is invalid number', (t) => {
        t.assert.throws(() => parseURL({ protocol: 'http:', port: '-1' }), new InvalidArgumentError('Invalid URL: port must be a valid integer or a string representation of an integer.'))
        t.assert.throws(() => parseURL({ protocol: 'http:', port: '65536' }), new InvalidArgumentError('Invalid URL: port must be a valid integer or a string representation of an integer.'))
      })
      test('sets port based on protocol', (t) => {
        t.assert.strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '/' }).port, '')
        t.assert.strictEqual(parseURL({ protocol: 'https:', hostname: 'www.example.com', path: '/' }).port, '')
      })
      test('don\'t override port with protocol if port was explicitly set', (t) => {
        t.assert.strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '/', port: 1337 }).port, '1337')
        t.assert.strictEqual(parseURL({ protocol: 'https:', hostname: 'www.example.com', path: '/', port: 1337 }).port, '1337')
      })
    })

    describe('path', () => {
      test('doesn\'t throw if path null or undefined', (t) => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', path: null })
        parseURL({ protocol: 'http:', hostname: 'www.example.com', path: undefined })
      })
      test('throws if path is not as string', (t) => {
        t.assert.throws(() => parseURL({ protocol: 'http:', hostname: 'www.example.com', path: 1 }), new InvalidArgumentError('Invalid URL path: the path must be a string or null/undefined.'))
      })
      test('doesn\'t throw if path is a string', (t) => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '/' })
      })
      test('accepts path with and without leading /', (t) => {
        t.assert.strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: 'abc' }).pathname, '/abc')
        t.assert.strictEqual(parseURL({ protocol: 'https:', hostname: 'www.example.com', path: '/abc' }).pathname, '/abc')
      })
    })

    describe('pathname', () => {
      test('doesn\'t throw if pathname null or undefined', (t) => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', pathname: null })
        parseURL({ protocol: 'http:', hostname: 'www.example.com', pathname: undefined })
      })
      test('throws if pathname is not as string', (t) => {
        t.assert.throws(() => parseURL({ protocol: 'http:', pathname: 1 }), new InvalidArgumentError('Invalid URL pathname: the pathname must be a string or null/undefined.'))
      })
      test('doesn\'t throw if pathname is a string', (t) => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', pathname: '/' })
      })
    })

    describe('hostname', () => {
      test('doesn\'t throw if hostname null or undefined', (t) => {
        parseURL({ protocol: 'http:', hostname: null, origin: 'http://www.example.com' })
        parseURL({ protocol: 'http:', hostname: undefined, origin: 'http://www.example.com' })
      })
      test('throws if hostname is not as string', (t) => {
        t.assert.throws(() => parseURL({ protocol: 'http:', hostname: 1 }), new InvalidArgumentError('Invalid URL hostname: the hostname must be a string or null/undefined.'))
      })
      test('doesn\'t throw if hostname is a string', (t) => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com' })
      })
    })

    describe('origin', () => {
      test('doesn\'t throw if origin null or undefined', (t) => {
        parseURL({ protocol: 'http:', hostname: 'www.example.com', origin: null })
        parseURL({ protocol: 'http:', hostname: 'www.example.com', origin: undefined })
      })
      test('throws if origin is not as string', (t) => {
        t.assert.throws(() => parseURL({ protocol: 'http:', origin: 1 }), new InvalidArgumentError('Invalid URL origin: the origin must be a string or null/undefined.'))
      })
      test('doesn\'t throw if origin is a string', (t) => {
        parseURL({ protocol: 'http:', origin: 'https://www.example.com' })
      })
      test('removes trailing /', (t) => {
        t.assert.strictEqual(parseURL({ protocol: 'http:', origin: 'https://www.example.com/' }).origin, 'https://www.example.com')
      })
    })

    describe('protocol', () => {
      test('throws if protocol is not http: or https: and no origin is defined', (t) => {
        t.assert.throws(() => parseURL({ protocol: 'wss:', hostname: 'www.example.com', path: '' }))
      })
      test('doesn\'t throw when origin is not provided', (t) => {
        t.assert.strictEqual(parseURL({ protocol: 'http:', hostname: 'www.example.com', path: '' }).origin, 'http://www.example.com')
      })
    })
  })
})
