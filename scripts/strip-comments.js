'use strict'

const strip = require('strip-comments')
const { readFileSync, writeFileSync } = require('node:fs')

const contents = readFileSync('./undici-fetch.js', 'utf-8')

writeFileSync('./undici-fetch.js', strip(contents))
