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

test('setRequestReferrerPolicyOnRedirect', nested => {
  nested.plan(7)

  nested.test('should set referrer policy from response headers on redirect', t => {
    const request = {
      referrerPolicy: 'no-referrer, strict-origin-when-cross-origin'
    }

    const actualResponse = {
      headersList: new HeadersList()
    }

    t.plan(1)

    actualResponse.headersList.append('Connection', 'close')
    actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
    actualResponse.headersList.append('Referrer-Policy', 'origin')
    util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

    t.equal(request.referrerPolicy, 'origin')
  })

  nested.test('should select the first valid policy from a response', t => {
    const request = {
      referrerPolicy: 'no-referrer, strict-origin-when-cross-origin'
    }

    const actualResponse = {
      headersList: new HeadersList()
    }

    t.plan(1)

    actualResponse.headersList.append('Connection', 'close')
    actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
    actualResponse.headersList.append('Referrer-Policy', 'asdas, origin')
    util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

    t.equal(request.referrerPolicy, 'origin')
  })

  nested.test('should select the first valid policy from a response#2', t => {
    const request = {
      referrerPolicy: 'no-referrer, strict-origin-when-cross-origin'
    }

    const actualResponse = {
      headersList: new HeadersList()
    }

    t.plan(1)

    actualResponse.headersList.append('Connection', 'close')
    actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
    actualResponse.headersList.append('Referrer-Policy', 'no-referrer, asdas, origin, 0943sd')
    util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

    t.equal(request.referrerPolicy, 'origin')
  })

  nested.test('should pick the last fallback over invalid policy tokens', t => {
    const request = {
      referrerPolicy: 'no-referrer, strict-origin-when-cross-origin'
    }

    const actualResponse = {
      headersList: new HeadersList()
    }

    t.plan(1)

    actualResponse.headersList.append('Connection', 'close')
    actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
    actualResponse.headersList.append('Referrer-Policy', 'origin, asdas, asdaw34')
    util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

    t.equal(request.referrerPolicy, 'origin')
  })

  nested.test('should set not change request referrer policy if no Referrer-Policy from initial redirect response', t => {
    const request = {
      referrerPolicy: 'no-referrer, strict-origin-when-cross-origin'
    }

    const actualResponse = {
      headersList: new HeadersList()
    }

    t.plan(1)

    actualResponse.headersList.append('Connection', 'close')
    actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
    util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

    t.equal(request.referrerPolicy, 'no-referrer, strict-origin-when-cross-origin')
  })

  nested.test('should set not change request referrer policy if the policy is a non-valid Referrer Policy', t => {
    const initial = 'no-referrer, strict-origin-when-cross-origin'
    const request = {
      referrerPolicy: initial
    }
    const actualResponse = {
      headersList: new HeadersList()
    }

    t.plan(1)

    actualResponse.headersList.append('Connection', 'close')
    actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
    actualResponse.headersList.append('Referrer-Policy', 'asdasd')
    util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

    t.equal(request.referrerPolicy, initial)
  })

  nested.test('should set not change request referrer policy if the policy is a non-valid Referrer Policy', t => {
    const initial = 'no-referrer, strict-origin-when-cross-origin'
    const request = {
      referrerPolicy: initial
    }
    const actualResponse = {
      headersList: new HeadersList()
    }

    t.plan(1)

    actualResponse.headersList.append('Connection', 'close')
    actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
    actualResponse.headersList.append('Referrer-Policy', 'asdasd, asdasa, 12daw,')
    util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

    t.equal(request.referrerPolicy, initial)
  })
})
