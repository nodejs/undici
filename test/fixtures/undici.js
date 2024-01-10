const { request } = require('../..')

request('https://nodejs.org', { maxRedirections: 0 }).then(
  res => res.body.dump(),
  () => {}
)
