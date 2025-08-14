import * as config from './config.mjs'
import * as utils from '../lib/utils.mjs'
import * as defines from '../lib/defines.mjs'

export function pause () {
  return new Promise(function (resolve, reject) {
    setTimeout(() => {
      return resolve()
    }, 3000)
  })
}

export function makeTestUrl (uuid, reqConfig) {
  let extra = ''
  if ('filename' in reqConfig) {
    extra += `/${reqConfig.filename}`
  }
  if ('query_arg' in reqConfig) {
    extra += `?${reqConfig.query_arg}`
  }
  return `${config.baseUrl}/test/${uuid}${extra}`
}

const uninterestingHeaders = new Set(['date', 'expires', 'last-modified', 'content-length', 'content-type', 'connection', 'content-language', 'vary', 'mime-version'])

export async function putTestConfig (uuid, requests) {
  const init = {
    method: 'PUT',
    headers: [['content-type', 'application/json']],
    body: JSON.stringify(requests)
  }
  return fetch(`${config.baseUrl}/config/${uuid}`, init)
    .then(response => {
      if (response.status !== 201) {
        let headers = ''
        response.headers.forEach((hvalue, hname) => { // for some reason, node-fetch reverses these
          if (!uninterestingHeaders.has(hname.toLowerCase())) {
            headers += `${hname}: ${hvalue}    `
          }
        })
        throw new utils.SetupError({ message: `PUT config resulted in ${response.status} ${response.statusText} - ${headers}` })
      }
    })
}

export async function getServerState (uuid) {
  return fetch(`${config.baseUrl}/state/${uuid}`)
    .then(response => {
      if (response.status === 200) {
        return response.text()
      }
    }).then(text => {
      if (text === undefined) return []
      return JSON.parse(text)
    })
}

export function setupCheck (reqConfig, memberName) {
  return reqConfig.setup === true || ('setup_tests' in reqConfig && reqConfig.setup_tests.indexOf(memberName) > -1)
}

export function logRequest (url, init, reqNum) {
  console.log(`${defines.GREEN}=== Client request ${reqNum}${defines.NC}`)
  if ('method' in init) {
    console.log(`    ${init.method} ${url}`)
  } else {
    console.log(`    GET ${url}`)
  }
  init.headers.forEach(header => {
    console.log(`    ${header[0]}: ${header[1]}`)
  })
  console.log('')
}

export function logResponse (response, interimResponses, reqNum) {
  console.log(`${defines.GREEN}=== Client response ${reqNum}${defines.NC}`)
  for (const [statusCode, headers] of interimResponses) {
    console.log(`    HTTP ${statusCode}`)
    for (const [key, value] of Object.entries(headers)) {
      console.log(`    ${key}: ${value}`)
    }
    console.log('')
  }
  console.log(`    HTTP ${response.status} ${response.statusText}`)
  response.headers.forEach((hvalue, hname) => { // for some reason, node-fetch reverses these
    console.log(`    ${hname}: ${hvalue}`)
  })
  console.log('')
}

class InterimResponsesCollectingHandler {
  #handler
  #interimResponses

  constructor (handler, interimResponses) {
    this.#handler = handler
    this.#interimResponses = interimResponses
  }

  onRequestStart (controller, context) {
    this.#handler.onRequestStart?.(controller, context)
  }

  onRequestUpgrade (controller, statusCode, headers, socket) {
    this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket)
  }

  onResponseStart (controller, statusCode, headers, statusMessage) {
    if (statusCode < 200) this.#interimResponses.push([statusCode, headers])
    this.#handler.onResponseStart?.(controller, statusCode, headers, statusMessage)
  }

  onResponseData (controller, data) {
    this.#handler.onResponseData?.(controller, data)
  }

  onResponseEnd (controller, trailers) {
    this.#handler.onResponseEnd?.(controller, trailers)
  }

  onResponseError (controller, err) {
    this.#handler.onResponseError?.(controller, err)
  }
}

export function interimResponsesCollectingInterceptor (collectInto) {
  return (dispatch) => {
    return (opts, handler) => {
      return dispatch(opts, new InterimResponsesCollectingHandler(handler, collectInto))
    }
  }
}
