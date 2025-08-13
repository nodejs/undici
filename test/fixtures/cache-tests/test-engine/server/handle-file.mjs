import fs from 'fs'
import path from 'path'
import process from 'process'

import { sendResponse } from './utils.mjs'
import { mimeTypes } from '../lib/defines.mjs'

export default function handleFile (url, request, response) {
  let urlPath = path.normalize(url.pathname)
  if (urlPath === '/') urlPath = '/index.html'
  const filename = path.join(process.cwd(), urlPath)
  let stat
  try {
    stat = fs.statSync(filename)
  } catch {}
  if (!stat || !stat.isFile()) {
    sendResponse(response, 404, `${urlPath} Not Found`)
    return
  }
  const mimeType = mimeTypes[path.extname(filename).split('.')[1]] || 'application/octet-stream'
  const fileStream = fs.createReadStream(filename)
  response.writeHead(200, { 'Content-Type': mimeType })
  fileStream.pipe(response)
}
