const undici = require('.')

;(async () => {
  const { body } = await undici.request('https://httpbin.org/anything')
  const json = await body.json()

  console.log(json)
})()
