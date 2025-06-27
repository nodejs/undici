const { request } = require('undici')
const createDecompressInterceptor = require('./lib/interceptor/decompress')

// Create client with decompression
const client = request.compose(createDecompressInterceptor())

// Now requests will automatically decompress gzip/deflate/brotli responses
const response = await client('https://httpbin.org/gzip', {
  headers: {
    'accept-encoding': 'gzip, deflate, br'
  }
})

console.log(await response.body.text()) // Automatically decompressed
