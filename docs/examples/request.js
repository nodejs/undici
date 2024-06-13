'use strict'

const { request } = require('../../')

async function getRequest (port = 3001) {
  // A simple GET request
  const {
    statusCode,
    headers,
    body
  } = await request(`http://localhost:${port}/`)

  const data = await body.text()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', data)
}

async function postJSONRequest (port = 3001) {
  // Make a JSON POST request:

  const requestBody = {
    hello: 'JSON POST Example body'
  }

  const {
    statusCode,
    headers,
    body
  } = await request(
    `http://localhost:${port}/json`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody) }
  )

  // .json() will fail if we did not receive a valid json body in response:
  const decodedJson = await body.json()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', decodedJson)
}

async function postFormRequest (port = 3001) {
  // Make a URL-encoded form POST request:
  const qs = require('node:querystring')

  const requestBody = {
    hello: 'URL Encoded Example body'
  }

  const {
    statusCode,
    headers,
    body
  } = await request(
    `http://localhost:${port}/form`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: qs.stringify(requestBody) }
  )

  const data = await body.text()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', data)
}

async function deleteRequest (port = 3001) {
  // Make a DELETE request
  const {
    statusCode,
    headers,
    body
  } = await request(
    `http://localhost:${port}/something`,
    { method: 'DELETE' }
  )

  console.log('response received', statusCode)
  console.log('headers', headers)
  // For a DELETE request we expect a 204 response with no body if successful, in which case getting the body content with .json() will fail
  if (statusCode === 204) {
    console.log('delete successful')
    // always consume the body if there is one:
    await body.dump()
  } else {
    const data = await body.text()
    console.log('received unexpected data', data)
  }
}

module.exports = {
  getRequest,
  postJSONRequest,
  postFormRequest,
  deleteRequest
}
