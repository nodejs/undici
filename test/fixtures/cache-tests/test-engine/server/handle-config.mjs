import { sendResponse, configs, setConfig } from './utils.mjs'

export default function handleConfig (pathSegs, request, response) {
  const uuid = pathSegs[0]
  if (request.method !== 'PUT') {
    sendResponse(response, 405, `${request.method} request to config for ${uuid}`)
    return
  }
  if (configs.has(uuid)) {
    sendResponse(response, 409, `Config already exists for ${uuid}`)
    return
  }
  let body = ''
  request.on('data', chunk => {
    body += chunk
  })
  request.on('end', () => {
    setConfig(uuid, JSON.parse(body))
    response.statusCode = 201
    response.end('OK')
  })
}
