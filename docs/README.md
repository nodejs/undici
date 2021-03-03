# undici

![Node CI](https://github.com/mcollina/undici/workflows/Node%20CI/badge.svg)  [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/) [![npm version](https://badge.fury.io/js/undici.svg)](https://badge.fury.io/js/undici) [![codecov](https://codecov.io/gh/nodejs/undici/branch/master/graph/badge.svg)](https://codecov.io/gh/nodejs/undici)

A HTTP/1.1 client, written from scratch for Node.js.

> Undici means eleven in Italian. 1.1 -> 11 -> Eleven -> Undici.
It is also a Stranger Things reference.

<!--
Picture of Eleven
-->

## Install

```
npm i undici
```

## Benchmarks

Machine: AMD EPYC 7502P<br/>

Node 15
```
http - keepalive x 12,028 ops/sec ±2.60% (265 runs sampled)
undici - pipeline x 31,321 ops/sec ±0.77% (276 runs sampled)
undici - request x 36,612 ops/sec ±0.71% (277 runs sampled)
undici - stream x 41,291 ops/sec ±0.90% (268 runs sampled)
undici - dispatch x 47,319 ops/sec ±1.17% (263 runs sampled)
```

The benchmark is a simple `hello world` [example](benchmarks/index.js) using a
single unix socket with pipelining.

## Quick Start

```js
import { request } from 'undici'

const {
  statusCode,
  headers,
  trailers,
  body
} = await request('http://localhost:3000/foo')

console.log('response received', statusCode)
console.log('headers', headers)

for await (const data of body) {
  console.log('data', data)
}

console.log('trailers', trailers)
```

## Collaborators

* [__Robert Nagy__](https://github.com/ronag), <https://www.npmjs.com/~ronag>

## License

MIT