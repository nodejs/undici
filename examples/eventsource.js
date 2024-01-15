'use strict'

const { EventSource } = require('../')

async function main () {
  const ev = new EventSource('https://smee.io/wcGp009TievZCLT')
  ev.onmessage = (event) => {
    console.log(event)
  }
  ev.onerror = event => {
    console.log(event)
  }
  ev.onopen = event => {
    console.log(event)
  }
  setTimeout(() => {
    console.log('close')
    ev.close()
  }, 3000)
}
main()
