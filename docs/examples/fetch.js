'use strict'

const { fetch } = require('../../')

async function main () {
  const res = await fetch('http://localhost:3001/')

  const data = await res.text()
  console.log('response received', res.status)
  console.log('headers', res.headers)
  console.log('data', data)
}
main()
