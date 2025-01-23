import * as config from './config.mjs'
import { fixupHeader } from '../lib/header-fixup.mjs'

export function init (idx, reqConfig, prevResp) {
  const init = {
    headers: []
  }
  if (!config.useBrowserCache) {
    init.cache = 'no-store'
    init.headers.push(['Pragma', 'foo']) // dirty hack for Fetch
    init.headers.push(['Cache-Control', 'nothing-to-see-here']) // ditto
  }
  if ('request_method' in reqConfig) init.method = reqConfig.request_method
  if ('request_headers' in reqConfig) init.headers = init.headers.concat(reqConfig.request_headers)
  if ('magic_ims' in reqConfig && reqConfig.magic_ims === true) {
    for (let i = 0; i < init.headers.length; i++) {
      const header = init.headers[i]
      if (header[0].toLowerCase() === 'if-modified-since') {
        init.headers[i] = fixupHeader(header, prevResp, reqConfig)
      }
    }
  }
  if ('name' in reqConfig) init.headers.push(['Test-Name', reqConfig.name])
  if ('request_body' in reqConfig) init.body = reqConfig.request_body
  if ('mode' in reqConfig) init.mode = reqConfig.mode
  if ('credentials' in reqConfig) init.mode = reqConfig.credentials
  if ('cache' in reqConfig) init.cache = reqConfig.cache
  if ('redirect' in reqConfig) init.redirect = reqConfig.redirect
  init.headers.push(['Test-ID', reqConfig.id])
  init.headers.push(['Req-Num', (idx + 1).toString()])
  return init
}

export function inflateRequests (test) {
  const rawRequests = test.requests
  const requests = []
  for (let i = 0; i < rawRequests.length; i++) {
    const reqConfig = rawRequests[i]
    reqConfig.name = test.name
    reqConfig.id = test.id
    reqConfig.dump = test.dump
    requests.push(reqConfig)
  }
  return requests
}
