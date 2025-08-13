import { locationHeaders, dateHeaders } from './defines.mjs'
import { httpDate } from './utils.mjs'

export function fixupHeader (header, respHeaders, reqConfig) {
  const headerName = header[0].toLowerCase()

  // Date headers
  const serverNow = parseInt(respHeaders['server-now'])
  if (dateHeaders.has(headerName) && Number.isInteger(header[1])) {
    let format
    if ('rfc850date' in reqConfig && reqConfig.rfc850date.includes(headerName)) {
      format = 'rfc850'
    }
    header[1] = httpDate(serverNow, header[1], format)
  }

  // Location headers
  const baseUrl = respHeaders['server-base-url']
  if (locationHeaders.has(headerName) && reqConfig.magic_locations) {
    if (header[1]) {
      header[1] = `${baseUrl}/${header[1]}`
    } else {
      header[1] = `${baseUrl}`
    }
  }

  return header
}
