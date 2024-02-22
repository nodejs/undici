'use strict'

const { randomBytes } = require('node:crypto')
const { EventSource } = require('../../')

async function main () {
  const url = `https://smee.io/${randomBytes(8).toString('base64url')}`
  console.log(`Connecting to event source server ${url}`)
  const ev = new EventSource(url)
  ev.onmessage = console.log
  ev.onerror = console.log
  ev.onopen = console.log

  // Special event of smee.io
  ev.addEventListener('ready', console.log)

  // Ping event is sent every 30 seconds by smee.io
  ev.addEventListener('ping', console.log)
}
main()
