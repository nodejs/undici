const { request } = require('..')

request('http://www.rolbox.it/rk-kastelruth/webcam/web03.jpg', { throwOnError: true })
  .then(({ statusCode, body }) => {
    console.log('then called', { statusCode })
    body.on('err', e => console.error('body error:', e))
  })
  .catch(e => console.error('catch called:', e))
  .finally(() => console.log('finally called'))
