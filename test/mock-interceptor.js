'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test, after } = require('node:test')
const { MockInterceptor, MockScope } = require('../lib/mock/mock-interceptor')
const MockAgent = require('../lib/mock/mock-agent')
const { kDispatchKey } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')
const { fetch } = require('../lib/web/fetch/index')

describe('MockInterceptor - path', () => {
  test('should remove hash fragment from paths', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '#foobar',
      method: ''
    }, [])
    t.strictEqual(mockInterceptor[kDispatchKey].path, '')
  })
})

describe('MockInterceptor - reply', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply(200, 'hello')
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 2 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.reply(), new InvalidArgumentError('statusCode must be defined'))
    t.throws(() => mockInterceptor.reply(200, '', 'hello'), new InvalidArgumentError('responseOptions must be an object'))
  })
})

describe('MockInterceptor - reply callback', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply(200, () => 'hello')
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 3 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.reply(), new InvalidArgumentError('statusCode must be defined'))
    t.throws(() => mockInterceptor.reply(200, () => { }, 'hello'), new InvalidArgumentError('responseOptions must be an object'))
    t.throws(() => mockInterceptor.reply(200, () => { }, null), new InvalidArgumentError('responseOptions must be an object'))
  })
})

describe('MockInterceptor - reply options callback', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 2 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply((options) => ({
      statusCode: 200,
      data: 'hello'
    }))
    t.ok(result instanceof MockScope)

    // Test parameters

    const baseUrl = 'http://localhost:9999'
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/test',
      method: 'GET'
    }).reply((options) => {
      t.deepStrictEqual(options, { path: '/test', method: 'GET', headers: { foo: 'bar' } })
      return { statusCode: 200, data: 'hello' }
    })

    mockPool.dispatch({
      path: '/test',
      method: 'GET',
      headers: { foo: 'bar' }
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    })
  })

  test('should error if passed options invalid', async (t) => {
    t = tspl(t, { plan: 4 })

    const baseUrl = 'http://localhost:9999'
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/test-return-undefined',
      method: 'GET'
    }).reply(() => { })

    mockPool.intercept({
      path: '/test-return-null',
      method: 'GET'
    }).reply(() => { return null })

    mockPool.intercept({
      path: '/test3',
      method: 'GET'
    }).reply(() => ({
      statusCode: 200,
      data: 'hello',
      responseOptions: 42
    }))

    mockPool.intercept({
      path: '/test4',
      method: 'GET'
    }).reply(() => ({
      data: 'hello',
      responseOptions: 42
    }))

    t.throws(() => mockPool.dispatch({
      path: '/test-return-undefined',
      method: 'GET'
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    }), new InvalidArgumentError('reply options callback must return an object'))

    t.throws(() => mockPool.dispatch({
      path: '/test-return-null',
      method: 'GET'
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    }), new InvalidArgumentError('reply options callback must return an object'))

    t.throws(() => mockPool.dispatch({
      path: '/test3',
      method: 'GET'
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    }), new InvalidArgumentError('responseOptions must be an object'))

    t.throws(() => mockPool.dispatch({
      path: '/test4',
      method: 'GET'
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    }), new InvalidArgumentError('statusCode must be defined'))
  })
})

describe('MockInterceptor - replyWithError', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.replyWithError(new Error('kaboom'))
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 1 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.replyWithError(), new InvalidArgumentError('error must be defined'))
  })
})

describe('MockInterceptor - defaultReplyHeaders', () => {
  test('should return MockInterceptor', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyHeaders({})
    t.ok(result instanceof MockInterceptor)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 1 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.defaultReplyHeaders(), new InvalidArgumentError('headers must be defined'))
  })
})

describe('MockInterceptor - defaultReplyTrailers', () => {
  test('should return MockInterceptor', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyTrailers({})
    t.ok(result instanceof MockInterceptor)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 1 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.defaultReplyTrailers(), new InvalidArgumentError('trailers must be defined'))
  })
})

describe('MockInterceptor - replyContentLength', () => {
  test('should return MockInterceptor', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyTrailers({})
    t.ok(result instanceof MockInterceptor)
  })
})

describe('https://github.com/nodejs/undici/issues/3649', () => {
  [
    ['/api/some-path', '/api/some-path'],
    ['/api/some-path/', '/api/some-path'],
    ['/api/some-path', '/api/some-path/'],
    ['/api/some-path/', '/api/some-path/'],
    ['/api/some-path////', '/api/some-path//'],
    ['', ''],
    ['/', ''],
    ['', '/'],
    ['/', '/']
  ].forEach(([interceptPath, fetchedPath], index) => {
    test(`MockAgent should match with or without trailing slash by setting ignoreTrailingSlash as MockAgent option /${index}`, async (t) => {
      t = tspl(t, { plan: 1 })

      const mockAgent = new MockAgent({ ignoreTrailingSlash: true })
      mockAgent.disableNetConnect()
      mockAgent
        .get('https://localhost')
        .intercept({ path: interceptPath }).reply(200, { ok: true })

      const res = await fetch(new URL(fetchedPath, 'https://localhost'), { dispatcher: mockAgent })

      t.deepStrictEqual(await res.json(), { ok: true })
    })

    test(`MockAgent should match with or without trailing slash by setting ignoreTrailingSlash as intercept option /${index}`, async (t) => {
      t = tspl(t, { plan: 1 })

      const mockAgent = new MockAgent()
      mockAgent.disableNetConnect()
      mockAgent
        .get('https://localhost')
        .intercept({ path: interceptPath, ignoreTrailingSlash: true }).reply(200, { ok: true })

      const res = await fetch(new URL(fetchedPath, 'https://localhost'), { dispatcher: mockAgent })

      t.deepStrictEqual(await res.json(), { ok: true })
    })

    if (
      (interceptPath === fetchedPath && (interceptPath !== '' && fetchedPath !== '')) ||
      (interceptPath === '/' && fetchedPath === '')
    ) {
      test(`MockAgent should should match on strict equal cases of paths when ignoreTrailingSlash is not set /${index}`, async (t) => {
        t = tspl(t, { plan: 1 })

        const mockAgent = new MockAgent()
        mockAgent.disableNetConnect()
        mockAgent
          .get('https://localhost')
          .intercept({ path: interceptPath }).reply(200, { ok: true })

        const res = await fetch(new URL(fetchedPath, 'https://localhost'), { dispatcher: mockAgent })

        t.deepStrictEqual(await res.json(), { ok: true })
      })
    } else {
      test(`MockAgent should should reject on not strict equal cases of paths when ignoreTrailingSlash is not set /${index}`, async (t) => {
        t = tspl(t, { plan: 1 })

        const mockAgent = new MockAgent()
        mockAgent.disableNetConnect()
        mockAgent
          .get('https://localhost')
          .intercept({ path: interceptPath }).reply(200, { ok: true })

        t.rejects(fetch(new URL(fetchedPath, 'https://localhost'), { dispatcher: mockAgent }))
      })
    }
  })
})

describe('MockInterceptor - different payloads', () => {
  [
    // Buffer
    ['arrayBuffer', 'ArrayBuffer', 'ArrayBuffer', new TextEncoder().encode('{"test":true}').buffer, new TextEncoder().encode('{"test":true}').buffer],
    ['json', 'ArrayBuffer', 'Object', new TextEncoder().encode('{"test":true}').buffer, { test: true }],
    ['bytes', 'ArrayBuffer', 'Uint8Array', new TextEncoder().encode('{"test":true}').buffer, new TextEncoder().encode('{"test":true}')],
    ['text', 'ArrayBuffer', 'string', new TextEncoder().encode('{"test":true}').buffer, '{"test":true}'],

    // Buffer
    ['arrayBuffer', 'Buffer', 'ArrayBuffer', Buffer.from('{"test":true}'), new TextEncoder().encode('{"test":true}').buffer],
    ['json', 'Buffer', 'Object', Buffer.from('{"test":true}'), { test: true }],
    ['bytes', 'Buffer', 'Uint8Array', Buffer.from('{"test":true}'), new TextEncoder().encode('{"test":true}')],
    ['text', 'Buffer', 'string', Buffer.from('{"test":true}'), '{"test":true}'],

    // Uint8Array
    ['arrayBuffer', 'Uint8Array', 'ArrayBuffer', new TextEncoder().encode('{"test":true}'), new TextEncoder().encode('{"test":true}').buffer],
    ['json', 'Uint8Array', 'Object', new TextEncoder().encode('{"test":true}'), { test: true }],
    ['bytes', 'Uint8Array', 'Uint8Array', new TextEncoder().encode('{"test":true}'), new TextEncoder().encode('{"test":true}')],
    ['text', 'Uint8Array', 'string', new TextEncoder().encode('{"test":true}'), '{"test":true}'],

    // string
    ['arrayBuffer', 'string', 'ArrayBuffer', '{"test":true}', new TextEncoder().encode('{"test":true}').buffer],
    ['json', 'string', 'Object', '{"test":true}', { test: true }],
    ['bytes', 'string', 'Uint8Array', '{"test":true}', new TextEncoder().encode('{"test":true}')],
    ['text', 'string', 'string', '{"test":true}', '{"test":true}'],

    // object
    ['arrayBuffer', 'Object', 'ArrayBuffer', { test: true }, new TextEncoder().encode('{"test":true}').buffer],
    ['json', 'Object', 'Object', { test: true }, { test: true }],
    ['bytes', 'Object', 'Uint8Array', { test: true }, new TextEncoder().encode('{"test":true}')],
    ['text', 'Object', 'string', { test: true }, '{"test":true}']
  ].forEach(([method, inputType, outputType, input, output]) => {
    test(`${inputType} will be returned as ${outputType} via ${method}()`, async (t) => {
      t = tspl(t, { plan: 1 })

      const mockAgent = new MockAgent()
      mockAgent.disableNetConnect()
      mockAgent
        .get('https://localhost')
        .intercept({ path: '/' }).reply(200, input)

      const response = await fetch('https://localhost', { dispatcher: mockAgent })

      t.deepStrictEqual(await response[method](), output)
    })
  })
})
