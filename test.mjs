import { Client } from './wrapper.mjs'

const client = new Client(`http://example.com`)

client.request({
  path: '/',
  method: 'GET'
}, function (err, data) {
  if (err) {
    // handle this in some way!
    return
  }

  const {
    statusCode,
    headers,
    body
  } = data

  console.log('response received', statusCode)
  console.log('headers', headers)

  body.setEncoding('utf8')
  body.on('data', console.log)

  client.close()
})
