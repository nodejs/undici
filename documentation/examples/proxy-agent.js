'use strict'

const { request, setGlobalDispatcher, ProxyAgent } = require('../..')

setGlobalDispatcher(new ProxyAgent('http://localhost:8000/'))

async function main () {
  const {
    statusCode,
    headers,
    trailers,
    body
    // send the request via the http://localhost:8000/ HTTP proxy
  } = await request('http://localhost:3000/undici')

  console.log('response received', statusCode)
  console.log('headers', headers)

  for await (const data of body) {
    console.log('data', data)
  }

  console.log('trailers', trailers)
}
main()
