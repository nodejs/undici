'use strict'

const { execSync } = require('node:child_process')
const { writeFileSync, readFileSync } = require('node:fs')
const { join, resolve, basename } = require('node:path')

const ROOT = resolve(__dirname, '../')
const WASM_SRC = resolve(__dirname, '../deps/llhttp')
const WASM_OUT = resolve(__dirname, '../lib/llhttp')
const DOCKERFILE = resolve(__dirname, './Dockerfile')

// These are defined by build environment
const WASM_CC = process.env.WASM_CC || 'clang'
let WASM_CFLAGS = process.env.WASM_CFLAGS || '--sysroot=/usr/share/wasi-sysroot -target wasm32-unknown-wasi'
let WASM_LDFLAGS = process.env.WASM_LDFLAGS || ''
const WASM_LDLIBS = process.env.WASM_LDLIBS || ''

const EXTERNAL_PATH = process.env.EXTERNAL_PATH

// These are relevant for undici and should not be overridden
WASM_CFLAGS += ' -Ofast -fno-exceptions -fvisibility=hidden -mexec-model=reactor'
WASM_LDFLAGS += ' -Wl,-error-limit=0 -Wl,-O3 -Wl,--lto-O3 -Wl,--strip-all'
WASM_LDFLAGS += ' -Wl,--allow-undefined -Wl,--export-dynamic -Wl,--export-table'
WASM_LDFLAGS += ' -Wl,--export=malloc -Wl,--export=free -Wl,--no-entry'

let platform = process.env.WASM_PLATFORM
if (!platform && process.argv[2]) {
  platform = execSync('docker info -f "{{.OSType}}/{{.Architecture}}"').toString().trim()
}

if (process.argv[2] === '--prebuild') {
  const cmd = `docker build --platform=${platform.toString().trim()} -t llhttp_wasm_builder -f ${DOCKERFILE} ${ROOT}`

  console.log(`> ${cmd}\n\n`)
  execSync(cmd, { stdio: 'inherit' })

  process.exit(0)
}

if (process.argv[2] === '--docker') {
  let cmd = `docker run --rm -it --platform=${platform.toString().trim()}`
  if (process.platform === 'linux') {
    cmd += ` --user ${process.getuid()}:${process.getegid()}`
  }

  cmd += ` --mount type=bind,source=${ROOT}/lib/llhttp,target=/home/node/undici/lib/llhttp llhttp_wasm_builder node build/wasm.js`
  console.log(`> ${cmd}\n\n`)
  execSync(cmd, { stdio: 'inherit' })
  process.exit(0)
}

const hasApk = (function () {
  try { execSync('command -v apk'); return true } catch (error) { return false }
})()
if (hasApk) {
  // Gather information about the tools used for the build
  const buildInfo = execSync('apk info -v').toString()
  if (!buildInfo.includes('wasi-sdk')) {
    console.log('Failed to generate build environment information')
    process.exit(-1)
  }
  writeFileSync(join(WASM_OUT, 'wasm_build_env.txt'), buildInfo)
}

const writeWasmChunk = EXTERNAL_PATH
  ? (path, dest) => {
      const base64 = readFileSync(join(WASM_OUT, path)).toString('base64')
      writeFileSync(join(WASM_OUT, dest), `
const { Buffer } = require('node:buffer')

module.exports = Buffer.from('${base64}', 'base64')
`)
    }
  : (path, dest) => {
      writeFileSync(join(WASM_OUT, dest), `
const { fs } = require('node:fs')

module.exports = fs.readFileSync(require.resolve('./${basename(path)}'))
`)
    }

// Build wasm binary
execSync(`${WASM_CC} ${WASM_CFLAGS} ${WASM_LDFLAGS} \
 ${join(WASM_SRC, 'src')}/*.c \
 -I${join(WASM_SRC, 'include')} \
 -o ${join(WASM_OUT, 'llhttp.wasm')} \
 ${WASM_LDLIBS}`, { stdio: 'inherit' })

writeWasmChunk('llhttp.wasm', 'llhttp-wasm.js')

// Build wasm simd binary
execSync(`${WASM_CC} ${WASM_CFLAGS} -msimd128 ${WASM_LDFLAGS} \
 ${join(WASM_SRC, 'src')}/*.c \
 -I${join(WASM_SRC, 'include')} \
 -o ${join(WASM_OUT, 'llhttp_simd.wasm')} \
 ${WASM_LDLIBS}`, { stdio: 'inherit' })

writeWasmChunk('llhttp_simd.wasm', 'llhttp_simd-wasm.js')

if (EXTERNAL_PATH) {
  writeFileSync(join(ROOT, 'loader.js'), `
'use strict'

globalThis.__UNDICI_IS_NODE__ = true
module.exports = require('node:module').createRequire('${EXTERNAL_PATH}/loader.js')('./index-fetch.js')
delete globalThis.__UNDICI_IS_NODE__
`)
}
