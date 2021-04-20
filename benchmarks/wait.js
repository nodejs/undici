'use strict'

const os = require('os')
const path = require('path')
const waitOn = require('wait-on')

const socketPath = path.join(os.tmpdir(), 'undici.sock')

waitOn({
  resources: [`http-get://unix:${socketPath}:/`],
  timeout: 5000
}).catch(() => process.exit(1))
