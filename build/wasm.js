'use strict'

const { execSync } = require('child_process')
const { join, resolve } = require('path')
const { WASI_ROOT } = process.env

const ROOT = resolve(__dirname, '../')
const WASM_SRC = resolve(__dirname, '../deps/llhttp')
const WASM_OUT = resolve(__dirname, '../lib/llhttp')

if (process.argv[2] === '--docker') {
  let cmd = 'docker run --rm -it'
  if (process.platform === 'linux') {
    cmd += ` --user ${process.getuid()}:${process.getegid()}`
  }
  cmd += ` --mount type=bind,source=${ROOT}/lib/llhttp,target=/home/node/undici/lib/llhttp llhttp_wasm_builder node build/wasm.js`
  execSync(cmd, { stdio: 'inherit' })
  process.exit(0)
}

if (!WASI_ROOT) {
  throw new Error('Please setup the WASI_ROOT env variable.')
}

// Build wasm binary
execSync(`${WASI_ROOT}/bin/clang \
 --sysroot=${WASI_ROOT}/share/wasi-sysroot \
 -target wasm32-wasi \
 -msimd128 \
 -Ofast \
 -fno-exceptions \
 -fvisibility=hidden \
 -mexec-model=reactor \
 -Wl,-error-limit=0 \
 -Wl,-O3 \
 -Wl,--lto-O3 \
 -Wl,--strip-all \
 -Wl,--allow-undefined \
 -Wl,--export-dynamic \
 -Wl,--export-table \
 -Wl,--export=malloc \
 -Wl,--export=free \
 ${join(WASM_SRC, 'src')}/*.c \
 -I${join(WASM_SRC, 'include')} \
 -o ${join(WASM_OUT, 'llhttp.wasm')}`, { stdio: 'inherit' })
