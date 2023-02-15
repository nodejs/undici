'use strict'

const { test } = require('tap')
const { nodeMajor } = require('../lib/core/util')
const { MockNotMatchedError } = require('../lib/mock/mock-errors')
const {
  deleteMockDispatch,
  getMockDispatch,
  getResponseData,
  getStatusText,
  getHeaderByName
} = require('../lib/mock/mock-utils')

test('deleteMockDispatch - should do nothing if not able to find mock dispatch', (t) => {
  t.plan(1)

  const key = {
    url: 'url',
    path: 'path',
    method: 'method',
    body: 'body'
  }

  t.doesNotThrow(() => deleteMockDispatch([], key))
})

test('getMockDispatch', (t) => {
  t.plan(3)

  t.test('it should find a mock dispatch', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    const result = getMockDispatch(dispatches, {
      path: 'path',
      method: 'method'
    })
    t.same(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  t.test('it should skip consumed dispatches', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: true
      },
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    const result = getMockDispatch(dispatches, {
      path: 'path',
      method: 'method'
    })
    t.same(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  t.test('it should throw if dispatch not found', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    t.throws(() => getMockDispatch(dispatches, {
      path: 'wrong',
      method: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for path \'wrong\''))
  })
})

test('getResponseData', (t) => {
  t.plan(3)

  t.test('it should stringify objects', (t) => {
    t.plan(1)
    const responseData = getResponseData({ str: 'string', num: 42 })
    t.equal(responseData, '{"str":"string","num":42}')
  })

  t.test('it should return strings untouched', (t) => {
    t.plan(1)
    const responseData = getResponseData('test')
    t.equal(responseData, 'test')
  })

  t.test('it should return buffers untouched', (t) => {
    t.plan(1)
    const responseData = getResponseData(Buffer.from('test'))
    t.ok(Buffer.isBuffer(responseData))
  })
})

test('getStatusText', (t) => {
  for (const statusCode of [
    100, 101, 102, 103, 200, 201, 202, 203,
    204, 205, 206, 207, 208, 226, 300, 301,
    302, 303, 304, 305, 306, 307, 308, 400,
    401, 402, 403, 404, 405, 406, 407, 408,
    409, 410, 411, 412, 413, 414, 415, 416,
    417, 418, 421, 422, 423, 424, 425, 426,
    428, 429, 431, 451, 500, 501, 502, 503,
    504, 505, 506, 507, 508, 510, 511
  ]) {
    t.ok(getStatusText(statusCode))
  }

  t.equal(getStatusText(420), 'unknown')

  t.end()
})

test('getHeaderByName', (t) => {
  const headersRecord = {
    key: 'value'
  }

  t.equal(getHeaderByName(headersRecord, 'key'), 'value')
  t.equal(getHeaderByName(headersRecord, 'anotherKey'), undefined)

  const headersArray = ['key', 'value']

  t.equal(getHeaderByName(headersArray, 'key'), 'value')
  t.equal(getHeaderByName(headersArray, 'anotherKey'), undefined)

  if (nodeMajor >= 16) {
    const { Headers } = require('../index')

    const headers = new Headers([
      ['key', 'value']
    ])

    t.equal(getHeaderByName(headers, 'key'), 'value')
    t.equal(getHeaderByName(headers, 'anotherKey'), null)
  }

  t.end()
})
