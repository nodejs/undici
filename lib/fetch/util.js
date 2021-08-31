'use strict'

const { redirectStatus } = require('./constants')
const { performance } = require('perf_hooks')
const nodeUtil = require('util')

let ReadableStream

// https://fetch.spec.whatwg.org/#block-bad-port
const badPorts = [
  '1', '7', '9', '11', '13', '15', '17', '19', '20', '21', '22', '23', '25', '37', '42', '43', '53', '69', '77', '79',
  '87', '95', '101', '102', '103', '104', '109', '110', '111', '113', '115', '117', '119', '123', '135', '137',
  '139', '143', '161', '179', '389', '427', '465', '512', '513', '514', '515', '526', '530', '531', '532',
  '540', '548', '554', '556', '563', '587', '601', '636', '989', '990', '993', '995', '1719', '1720', '1723',
  '2049', '3659', '4045', '5060', '5061', '6000', '6566', '6665', '6666', '6667', '6668', '6669', '6697',
  '10080'
]

function responseURL (response) {
  // https://fetch.spec.whatwg.org/#responses
  // A response has an associated URL. It is a pointer to the last URL
  // in response’s URL list and null if response’s URL list is empty.
  const urlList = response.urlList
  const length = urlList.length
  return length === 0 ? null : urlList[length - 1].toString()
}

// https://fetch.spec.whatwg.org/#concept-response-location-url
function responseLocationURL (response, requestFragment) {
  // 1. If response’s status is not a redirect status, then return null.
  if (!redirectStatus.includes(response.status)) {
    return null
  }

  // 2. Let location be the result of extracting header list values given
  // `Location` and response’s header list.
  let location = response.headersList.get('location')

  // 3. If location is a value, then set location to the result of parsing
  // location with response’s URL.
  location = location ? new URL(location, responseURL(response)) : null

  // 4. If location is a URL whose fragment is null, then set location’s
  // fragment to requestFragment.
  if (location && !location.hash) {
    location.hash = requestFragment
  }

  // 5. Return location.
  return location
}

function requestCurrentURL (request) {
  return request.urlList[request.urlList.length - 1]
}

function requestBadPort (request) {
  // 1. Let url be request’s current URL.
  const url = requestCurrentURL(request)

  // 2. If url’s scheme is an HTTP(S) scheme and url’s port is a bad port,
  // then return blocked.
  if (/^http?s/.test(url.protocol) && badPorts.includes(url.port)) {
    return 'blocked'
  }

  // 3. Return allowed.
  return 'allowed'
}

// Check whether |statusText| is a ByteString and
// matches the Reason-Phrase token production.
// RFC 2616: https://tools.ietf.org/html/rfc2616
// RFC 7230: https://tools.ietf.org/html/rfc7230
// "reason-phrase = *( HTAB / SP / VCHAR / obs-text )"
// https://github.com/chromium/chromium/blob/94.0.4604.1/third_party/blink/renderer/core/fetch/response.cc#L116
function isValidReasonPhrase (statusText) {
  for (let i = 0; i < statusText.length; ++i) {
    const c = statusText.charCodeAt(i)
    if (
      !(
        (
          c === 0x09 || // HTAB
          (c >= 0x20 && c <= 0x7e) || // SP / VCHAR
          (c >= 0x80 && c <= 0xff)
        ) // obs-text
      )
    ) {
      return false
    }
  }
  return true
}

function isTokenChar (c) {
  return !(
    c >= 0x7f ||
    c <= 0x20 ||
    c === '(' ||
    c === ')' ||
    c === '<' ||
    c === '>' ||
    c === '@' ||
    c === ',' ||
    c === ';' ||
    c === ':' ||
    c === '\\' ||
    c === '"' ||
    c === '/' ||
    c === '[' ||
    c === ']' ||
    c === '?' ||
    c === '=' ||
    c === '{' ||
    c === '}'
  )
}

// See RFC 7230, Section 3.2.6.
// https://github.com/chromium/chromium/blob/d7da0240cae77824d1eda25745c4022757499131/third_party/blink/renderer/platform/network/http_parsers.cc#L321
function isValidHTTPToken (characters) {
  if (!characters || typeof characters !== 'string') {
    return false
  }
  for (let i = 0; i < characters.length; ++i) {
    const c = characters.charCodeAt(i)
    if (c > 0x7f || !isTokenChar(c)) {
      return false
    }
  }
  return true
}

function ReadableStreamFrom (iterable) {
  if (!ReadableStream) {
    ReadableStream = require('stream/web').ReadableStream
  }

  if (ReadableStream.from) {
    // https://github.com/whatwg/streams/pull/1083
    return ReadableStream.from(iterable)
  }

  let iterator
  return new ReadableStream(
    {
      async start () {
        iterator = iterable[Symbol.asyncIterator]()
      },
      async pull (controller) {
        const { done, value } = await iterator.next()
        if (done) {
          queueMicrotask(() => {
            controller.close()
          })
        } else {
          const buf = Buffer.isBuffer(value) ? value : Buffer.from(value)
          controller.enqueue(new Uint8Array(buf))
        }
        return controller.desiredSize > 0
      },
      async cancel (reason) {
        await iterator.return()
      }
    },
    0
  )
}

// https://w3c.github.io/webappsec-referrer-policy/#set-requests-referrer-policy-on-redirect
function setRequestReferrerPolicyOnRedirect (request, actualResponse) {
  //  Given a request request and a response actualResponse, this algorithm
  //  updates request’s referrer policy according to the Referrer-Policy
  //  header (if any) in actualResponse.

  // 1. Let policy be the result of executing § 8.1 Parse a referrer policy
  // from a Referrer-Policy header on actualResponse.
  // TODO:  https://w3c.github.io/webappsec-referrer-policy/#parse-referrer-policy-from-header
  const policy = ''

  // 2. If policy is not the empty string, then set request’s referrer policy to policy.
  if (policy !== '') {
    request.referrerPolicy = policy
  }
}

// https://fetch.spec.whatwg.org/#cross-origin-resource-policy-check
function crossOriginResourcePolicyCheck () {
  // TODO
  return 'allowed'
}

// https://fetch.spec.whatwg.org/#concept-cors-check
function corsCheck () {
  // TODO
  return 'success'
}

// https://fetch.spec.whatwg.org/#concept-tao-check
function TAOCheck () {
  // TODO
  return 'success'
}

function appendFetchMetadata (httpRequest) {
  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-dest-header
  //  TODO

  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-mode-header

  //  1. Assert: r’s url is a potentially trustworthy URL.
  //  TODO

  //  2. Let header be a Structured Header whose value is a token.
  let header = null

  //  3. Set header’s value to r’s mode.
  header = httpRequest.mode

  //  4. Set a structured field value `Sec-Fetch-Mode`/header in r’s header list.
  httpRequest.headersList.append('sec-fetch-mode', header)

  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-site-header
  //  TODO

  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-user-header
  //  TODO
}

// https://fetch.spec.whatwg.org/#append-a-request-origin-header
function appendRequestOriginHeader (request) {
  // TODO
}

function coarsenedSharedCurrentTime (crossOriginIsolatedCapability) {
  // TODO
  return performance.now()
}

function makeTimingInfo (init) {
  return {
    startTime: 0,
    redirectStartTime: 0,
    redirectEndTime: 0,
    postRedirectStartTime: 0,
    finalServiceWorkerStartTime: 0,
    finalNetworkResponseStartTime: 0,
    finalNetworkRequestStartTime: 0,
    endTime: 0,
    encodedBodySize: 0,
    decodedBodySize: 0,
    finalConnectionTimingInfo: null,
    ...init
  }
}

// https://html.spec.whatwg.org/multipage/origin.html#policy-container
function makePolicyContainer () {
  // TODO
  return {}
}

// https://html.spec.whatwg.org/multipage/origin.html#clone-a-policy-container
function clonePolicyContainer () {
  // TODO
  return {}
}

// https://w3c.github.io/webappsec-referrer-policy/#determine-requests-referrer
function determineRequestsReferrer (request) {
  // TODO
  return 'no-referrer'
}

function matchRequestIntegrity (request, bytes) {
  return false
}

// https://w3c.github.io/webappsec-upgrade-insecure-requests/#upgrade-request
function tryUpgradeRequestToAPotentiallyTrustworthyURL (request) {
  // TODO
}

class ServiceWorkerGlobalScope {} // dummy
class Window {} // dummy
class EnvironmentSettingsObject {} // dummy
class HTMLFormElement {} // dummy

module.exports = {
  HTMLFormElement,
  ServiceWorkerGlobalScope,
  Window,
  EnvironmentSettingsObject,
  toUSVString: nodeUtil.toUSVString || ((val) => `${val}`),
  tryUpgradeRequestToAPotentiallyTrustworthyURL,
  coarsenedSharedCurrentTime,
  matchRequestIntegrity,
  determineRequestsReferrer,
  makePolicyContainer,
  clonePolicyContainer,
  appendFetchMetadata,
  appendRequestOriginHeader,
  TAOCheck,
  corsCheck,
  crossOriginResourcePolicyCheck,
  ReadableStreamFrom,
  makeTimingInfo,
  setRequestReferrerPolicyOnRedirect,
  isValidHTTPToken,
  requestBadPort,
  requestCurrentURL,
  responseURL,
  responseLocationURL,
  isValidReasonPhrase
}
