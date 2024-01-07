const { request } = require('../..')

request('https://nodejs.org', { maxRedirections: 1 }).then(
  res => res.body.dump(),
  () => {}
)
