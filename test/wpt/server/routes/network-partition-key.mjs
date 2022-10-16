const stash = new Map()

/**
 * @see https://github.com/web-platform-tests/wpt/blob/master/fetch/connection-pool/resources/network-partition-key.py
 * @param {Parameters<import('http').RequestListener>[0]} req
 * @param {Parameters<import('http').RequestListener>[1]} res
 * @param {URL} url
 */
export function route (req, res, { searchParams, port }) {
  res.setHeader('Cache-Control', 'no-store')

  const dispatch = searchParams.get('dispatch')
  const uuid = searchParams.get('uuid')
  const partitionId = searchParams.get('partition_id')

  if (!uuid || !dispatch || !partitionId) {
    res.statusCode = 404
    res.end('Invalid query parameters')
    return
  }

  let testFailed = false
  let requestCount = 0
  let connectionCount = 0

  if (searchParams.get('nocheck_partition') !== 'True') {
    const addressKey = `${req.socket.localAddress}|${port}`
    const serverState = stash.get(uuid) ?? {
      testFailed: false,
      requestCount: 0,
      connectionCount: 0
    }

    stash.delete(uuid)
    requestCount = serverState.requestCount + 1
    serverState.requestCount = requestCount

    if (Object.hasOwn(serverState, addressKey)) {
      if (serverState[addressKey] !== partitionId) {
        serverState.testFailed = true
      }
    } else {
      connectionCount = serverState.connectionCount + 1
      serverState.connectionCount = connectionCount
    }

    serverState[addressKey] = partitionId
    testFailed = serverState.testFailed
    stash.set(uuid, serverState)
  }

  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }

  if (req.method === 'OPTIONS') {
    return handlePreflight(req, res)
  }

  if (dispatch === 'fetch_file') {
    res.end()
    return
  }

  if (dispatch === 'check_partition') {
    const status = searchParams.get('status') ?? 200

    if (testFailed) {
      res.statusCode = status
      res.end('Multiple partition IDs used on a socket')
      return
    }

    let body = 'ok'
    if (searchParams.get('addcounter')) {
      body += `. Request was sent ${requestCount} times. ${connectionCount} connections were created.`
      res.statusCode = status
      res.end(body)
      return
    }
  }

  if (dispatch === 'clean_up') {
    stash.delete(uuid)
    res.statusCode = 200
    if (testFailed) {
      res.end('Test failed, but cleanup completed.')
    } else {
      res.end('cleanup complete')
    }

    return
  }

  res.statusCode = 404
  res.end('Unrecognized dispatch parameter: ' + dispatch)
}

/**
 * @param {Parameters<import('http').RequestListener>[0]} req
 * @param {Parameters<import('http').RequestListener>[1]} res
 */
function handlePreflight (req, res) {
  res.statusCode = 200
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Access-Control-Allow-Headers', 'header-to-force-cors')
  res.setHeader('Access-Control-Max-Age', '86400')
  res.end('Preflight request')
}
