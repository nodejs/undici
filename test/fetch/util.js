'use strict'

const t = require('tap')
const { test } = t

const util = require('../../lib/fetch/util')
const { HeadersList } = require('../../lib/fetch/headers')

test('responseURL', (t) => {
  t.plan(2)

  t.ok(util.responseURL({
    urlList: [
      new URL('http://asd'),
      new URL('http://fgh')
    ]
  }))
  t.notOk(util.responseURL({
    urlList: []
  }))
})

test('responseLocationURL', (t) => {
  t.plan(3)

  const acceptHeaderList = new HeadersList()
  acceptHeaderList.append('Accept', '*/*')

  const locationHeaderList = new HeadersList()
  locationHeaderList.append('Location', 'http://asd')

  t.notOk(util.responseLocationURL({
    status: 200
  }))
  t.notOk(util.responseLocationURL({
    status: 301,
    headersList: acceptHeaderList
  }))
  t.ok(util.responseLocationURL({
    status: 301,
    headersList: locationHeaderList,
    urlList: [
      new URL('http://asd'),
      new URL('http://fgh')
    ]
  }))
})

test('requestBadPort', (t) => {
  t.plan(3)

  t.equal('allowed', util.requestBadPort({
    urlList: [new URL('https://asd')]
  }))
  t.equal('blocked', util.requestBadPort({
    urlList: [new URL('http://asd:7')]
  }))
  t.equal('blocked', util.requestBadPort({
    urlList: [new URL('https://asd:7')]
  }))
})

// https://html.spec.whatwg.org/multipage/origin.html#same-origin
// look at examples
test('sameOrigin', (t) => {
  t.test('first test', (t) => {
    const A = {
      protocol: 'https:',
      hostname: 'example.org',
      port: ''
    }

    const B = {
      protocol: 'https:',
      hostname: 'example.org',
      port: ''
    }

    t.ok(util.sameOrigin(A, B))
    t.end()
  })

  t.test('second test', (t) => {
    const A = {
      protocol: 'https:',
      hostname: 'example.org',
      port: '314'
    }

    const B = {
      protocol: 'https:',
      hostname: 'example.org',
      port: '420'
    }

    t.notOk(util.sameOrigin(A, B))
    t.end()
  })

  t.test('obviously shouldn\'t be equal', (t) => {
    t.notOk(util.sameOrigin(
      { protocol: 'http:', hostname: 'example.org' },
      { protocol: 'https:', hostname: 'example.org' }
    ))

    t.notOk(util.sameOrigin(
      { protocol: 'https:', hostname: 'example.org' },
      { protocol: 'https:', hostname: 'example.com' }
    ))

    t.end()
  })

  t.end()
})

test('CORBCheck', (t) => {
  const allowedRequests = [{
    initiator: 'download',
    currentURL: { scheme: '' }
  }, {
    initiator: '',
    currentURL: { scheme: 'https' }
  }
  ]

  const response = { headersList: { get () { return '' } } }

  allowedRequests.forEach((request) => {
    t.ok(util.CORBCheck(request, response))
  })

  t.ok(util.CORBCheck({
    initiator: '',
    currentURL: { scheme: '' }
  }, response))

  const protectedResponses = [{
    status: 206,
    headersList: { get () { return 'text/html' } }
  }, {
    status: 206,
    headersList: { get () { return 'application/javascript' } }
  }, {
    status: 206,
    headersList: { get () { return 'application/xml' } }
  }, {
    status: 218,
    headersList: { get (type) { return type === 'content-type' ? 'text/html' : 'x-content-type-options' } }
  }]

  protectedResponses.forEach(response => {
    t.equal(util.CORBCheck({
      initiator: '',
      currentURL: { scheme: 'https' }
    }, response), 'blocked')
  })

  t.end()
})

test('isURLPotentiallyTrustworthy', (t) => {
  const valid = ['http://127.0.0.1', 'http://localhost.localhost',
    'http://[::1]', 'http://adb.localhost', 'https://something.com', 'wss://hello.com',
    'file:///link/to/file.txt', 'data:text/plain;base64,randomstring', 'about:blank', 'about:srcdoc']
  const invalid = ['http://121.3.4.5:55', 'null:8080', 'something:8080']

  t.plan(valid.length + invalid.length + 1)
  t.notOk(util.isURLPotentiallyTrustworthy('string'))

  for (const url of valid) {
    const instance = new URL(url)
    t.ok(util.isURLPotentiallyTrustworthy(instance))
  }

  for (const url of invalid) {
    const instance = new URL(url)
    t.notOk(util.isURLPotentiallyTrustworthy(instance))
  }
})

test('determineRequestsReferrer', (t) => {
  t.plan(4)
  t.test('Should handle empty referrerPolicy', (tt) => {
    tt.plan(2)
    tt.equal(util.determineRequestsReferrer({}), 'no-referrer')
    tt.equal(util.determineRequestsReferrer({ referrerPolicy: '' }), 'no-referrer')
  })

  t.test('Should handle "no-referrer" referrerPolicy', (tt) => {
    tt.plan(1)
    tt.equal(util.determineRequestsReferrer({ referrerPolicy: 'no-referrer' }), 'no-referrer')
  })

  t.test('Should return "no-referrer" if request referrer is absent', (tt) => {
    tt.plan(1)
    tt.equal(util.determineRequestsReferrer({
      referrerPolicy: 'origin'
    }), 'no-referrer')
  })

  t.test('Should return "no-referrer" if scheme is local scheme', (tt) => {
    tt.plan(4)
    const referrerSources = [
      new URL('data:something'),
      new URL('about:blank'),
      new URL('javascript:something'),
      new URL('file://path/to/file')]

    for (const source of referrerSources) {
      tt.equal(util.determineRequestsReferrer({
        referrerPolicy: 'origin',
        referrer: source
      }), 'no-referrer')
    }
  })
})
