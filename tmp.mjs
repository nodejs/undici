import { Client, interceptors }  from './index.js'

const client = new Client('https://google.com').compose(interceptors.cache())

await client.request({ path: '/', method: 'GET', origin: 'google.com' })
