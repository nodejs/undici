/* global URL */

import fs from 'fs'
import http from 'http'
import https from 'https'
import process from 'process'

import handleConfig from './handle-config.mjs'
import handleFile from './handle-file.mjs'
import handleState from './handle-state.mjs'
import handleTest from './handle-test.mjs'

function handleMain (request, response) {
  const url = new URL(request.url, baseUrl)
  const pathSegs = url.pathname.split('/')
  pathSegs.shift()
  const dispatch = pathSegs.shift()
  if (dispatch === 'config') {
    handleConfig(pathSegs, request, response)
  } else if (dispatch === 'test') {
    handleTest(pathSegs, request, response)
  } else if (dispatch === 'state') {
    handleState(pathSegs, request, response)
  } else {
    handleFile(url, request, response)
  }
}

const protocol = process.env.npm_config_protocol || process.env.npm_package_config_protocol
const port = process.env.npm_config_port || process.env.npm_package_config_port
const baseUrl = `${protocol}://localhost:${port}/`
const pidfile = process.env.npm_config_pidfile || process.env.npm_package_config_pidfile

fs.writeFile(pidfile, process.pid.toString(), 'ascii', function (err) {
  if (err) { console.log(`PID file write error: ${err.message}`) }
})

let server
if (protocol.toLowerCase() === 'https') {
  const options = {
    key: fs.readFileSync(process.env.npm_config_keyfile),
    cert: fs.readFileSync(process.env.npm_config_certfile)
  }
  server = https.createServer(options, handleMain)
} else {
  server = http.createServer(handleMain)
}
server.on('listening', () => {
  const host = (server.address().family === 'IPv6')
    ? `[${server.address().address}]`
    : server.address().address
  console.log(`Listening on ${protocol.toLowerCase()}://${host}:${server.address().port}/`)
})
server.listen(port)
