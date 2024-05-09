import { LockedResource } from '../lockedresource.mjs'

const stash = new Map()
const lockedStash = new LockedResource(stash)

/**
 * @see https://github.com/web-platform-tests/wpt/blob/master/fetch/connection-pool/resources/network-partition-key.py
 * @param {Parameters<import('http').RequestListener>[0]} request
 * @param {Parameters<import('http').RequestListener>[1]} response
 * @param {URL} url
 */
export async function route (request, response, { searchParams, port }) {
  response.setHeader('Cache-Control', 'no-store')

  const dispatch = searchParams.get('dispatch')
  const uuid = searchParams.get('uuid')
  const partitionId = searchParams.get('partition_id')

  if (!uuid || !dispatch || !partitionId) {
    return simpleResponse(request, response, 404, 'Not found', 'Invalid query parameters')
  }

  let testFailed = false
  let requestCount = 0
  let connectionCount = 0

  if (searchParams.get('nocheck_partition') !== 'true') {
    const stash = await lockedStash.acquire()
    try {
      const addressKey = `${request.socket.localAddress}|${port}`
      const serverState = stash.get(uuid) ?? {
        testFailed: false,
        requestCount: 0,
        connectionCount: 0,
        sockets: new Set()
      }

      stash.delete(uuid)
      requestCount = serverState.requestCount
      requestCount += 1
      serverState.requestCount = requestCount

      if (addressKey in serverState) {
        if (serverState[addressKey] !== partitionId) {
          serverState.testFailed = true
        }
      }

      // We can detect if a new connection is created by checking if the socket
      // was already used in the test.
      if (serverState.sockets.has(request.socket) === false) {
        connectionCount = serverState.connectionCount
        connectionCount += 1
        serverState.connectionCount = connectionCount
        serverState.sockets.add(request.socket)
      }

      serverState[addressKey] = partitionId
      testFailed = serverState.testFailed
      stash.set(uuid, serverState)
    } finally {
      lockedStash.release()
    }
  }

  const origin = request.headers.origin
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
  }

  if (request.method === 'OPTIONS') {
    return handlePreflight(request, response)
  }

  if (dispatch === 'fetch_file') {
    // There is currently no relevant wpt test that uses this dispatch
    return response.end()
  }

  if (dispatch === 'check_partition') {
    const status = searchParams.get('status') ?? 200

    if (testFailed) {
      return simpleResponse(request, response, status, 'OK', 'Multiple partition IDs used on a socket')
    }

    let body = 'ok'
    if (searchParams.get('addcounter') === 'true') {
      body += `. Request was sent ${requestCount} times. ${connectionCount} connections were created.`
      return simpleResponse(request, response, status, 'OK', body)
    }
  }

  if (dispatch === 'clean_up') {
    stash.delete(uuid)
    if (testFailed) {
      return simpleResponse(request, response, 200, 'OK', 'Test failed, but cleanup completed.')
    }
    return simpleResponse(request, response, 200, 'OK', 'cleanup complete')
  }

  return simpleResponse(request, response, 404, 'Not found', 'Unrecognized dispatch parameter: ' + dispatch)
}

/**
 * @param {Parameters<import('http').RequestListener>[0]} request
 * @param {Parameters<import('http').RequestListener>[1]} response
 */
function handlePreflight (request, response) {
  response.statusCode = 200
  response.statusMessage = 'OK'
  response.setHeader('Access-Control-Allow-Methods', 'GET')
  response.setHeader('Access-Control-Allow-Headers', 'header-to-force-cors')
  response.setHeader('Access-Control-Max-Age', '86400')
  response.end('Preflight request')
}

/**
 * @param {Parameters<import('http').RequestListener>[0]} request
 * @param {Parameters<import('http').RequestListener>[1]} response
 * @param {number} statusCode
 * @param {string} statusMessage
 * @param {string} body
 * @param {string} [contentType='text/plain']
 */
function simpleResponse (request, response, statusCode, statusMessage, body, contentType = 'text/plain') {
  response.statusCode = statusCode
  response.statusMessage = statusMessage
  response.setHeader('Content-Type', contentType)
  response.end(body)
}
