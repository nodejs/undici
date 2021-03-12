function matchValue (match, value) {
  if (typeof match === 'string') {
    return match === value
  }
  if (match instanceof RegExp) {
    return match.test(value)
  }
  if (typeof match === 'function') {
    return match(value) === true
  }
  return false
}

function buildMatcher ({ url, path, method, body }) {
  return (mockDispatch) => {
    const urlMatch = matchValue(mockDispatch.url, url)
    const pathMatch = matchValue(mockDispatch.path, path)
    const methodMatch = matchValue(mockDispatch.method, method)
    const bodyMatch = typeof mockDispatch.body !== 'undefined' ? matchValue(mockDispatch.body, body) : true

    return urlMatch && pathMatch && methodMatch && bodyMatch
  }
}

function getResponseData (data) {
  return typeof data === 'object' ? JSON.stringify(data) : data.toString()
}

function getMockDispatch (mockDispatches, key) {
  return mockDispatches.find(buildMatcher(key))
}

function addMockDispatch (mockDispatches, key, data) {
  const baseData = { error: null, times: null, persist: false, consumed: false }
  const currentMockDispatch = getMockDispatch(mockDispatches, key)
  const index = 0
  if (typeof currentMockDispatch !== 'undefined') {
    currentMockDispatch.replies.push({ ...baseData, ...data })
  } else {
    mockDispatches.push({ ...key, replies: [{ ...baseData, ...data }] })
  }
  return index
}

function deleteMockDispatch (mockDispatches, key) {
  const index = mockDispatches.findIndex(buildMatcher(key))
  if (index !== -1) {
    mockDispatches.splice(index, 1)
  }
}

function buildKey (url, opts) {
  const { path, method, body } = opts
  return {
    url: url instanceof URL ? url.origin : url,
    path: path,
    method: method,
    body: body
  }
}

function generateKeyValues (data) {
  return Object.entries(data).reduce((keyValuePairs, [key, value]) => [...keyValuePairs, key, value], [])
}

async function getResponse (body) {
  const buffers = []
  for await (const data of body) {
    buffers.push(data)
  }

  return Buffer.concat(buffers).toString('utf8')
}

module.exports = {
  getResponseData,
  getMockDispatch,
  addMockDispatch,
  deleteMockDispatch,
  buildKey,
  generateKeyValues,
  matchValue,
  getResponse
}
