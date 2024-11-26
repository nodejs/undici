import { sendResponse, stash } from './utils.mjs'

export default function handleState (pathSegs, request, response) {
  const uuid = pathSegs[0]
  const state = stash.get(uuid)
  if (state === undefined) {
    sendResponse(response, 404, `State not found for ${uuid}`)
    return
  }
  response.setHeader('Content-Type', 'text/plain')
  response.end(JSON.stringify(state))
}
