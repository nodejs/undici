const { fetch } = require('../..')

fetch('https://nodejs.org').then(
  res => res.body.cancel(),
  () => {}
)
