'use strict'

const os = require('node:os')
const path = require('node:path')
const waitOn = require('wait-on')

const socketPath = path.join(os.tmpdir(), 'undici.sock')

let resources
if (process.env.PORT) {
  resources = [`http-get://localhost:${process.env.PORT}/`]
} else {
  resources = [`http-get://unix:${socketPath}:/`]
}

waitOn({
  resources,
  timeout: 5000
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
