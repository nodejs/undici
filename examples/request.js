'use strict'

const { request } = require('../')

async function main () {
  const {
    statusCode,
    headers,
    body
  } = await request('http://localhost:3001/')

  const data = await body.text()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', data)
}

main()
