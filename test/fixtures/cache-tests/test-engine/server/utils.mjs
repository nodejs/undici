import { BLUE, NC } from '../lib/defines.mjs'

export function sendResponse (response, statusCode, message) {
  console.log(`SERVER WARNING: ${message}`)
  response.writeHead(statusCode, { 'Content-Type': 'text/plain' })
  response.write(`${message}\n`)
  response.end()
}

export function getHeader (headers, headerName) {
  let result
  headers.forEach(header => {
    if (header[0].toLowerCase() === headerName.toLowerCase()) {
      result = header[1]
    }
  })
  return result
}

// stash for server state
export const stash = new Map()

export function setStash (key, value) {
  stash.set(key, value)
}

// configurations
export const configs = new Map()

export function setConfig (key, value) {
  configs.set(key, value)
}

export function logRequest (request, reqNum) {
  console.log(`${BLUE}=== Server request ${reqNum}${NC}`)
  console.log(`    ${request.method} ${request.url}`)
  for (const [key, value] of Object.entries(request.headers)) {
    console.log(`    ${key}: ${value}`)
  }
  console.log('')
}

export function logResponse (response, resNum) {
  console.log(`${BLUE}=== Server response ${resNum}${NC}`)
  if (response === 'disconnect') {
    console.log('    [ server disconnect ]')
  } else {
    console.log(`    HTTP ${response.statusCode} ${response.statusPhrase}`)
    for (const [key, value] of Object.entries(response.getHeaders())) {
      console.log(`    ${key}: ${value}`)
    }
  }
  console.log('')
}
