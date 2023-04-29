'use strict'

const { execSync } = require('child_process')
const { writeFileSync, readFileSync } = require('fs')
const { join, resolve } = require('path')

const ROOT = resolve(__dirname, '../')
const WASM_SRC = resolve(__dirname, '../deps/llhttp')
const WASM_OUT = resolve(__dirname, '../lib/llhttp')
const DOCKERFILE = resolve(__dirname, './Dockerfile')

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

// Build wasm binary
execSync(`clang \
 --sysroot=/usr/share/wasi-sysroot \
 -target wasm32-unknown-wasi \
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
 -Wl,--no-entry \
 ${join(WASM_SRC, 'src')}/*.c \
 -I${join(WASM_SRC, 'include')} \
 -o ${join(WASM_OUT, 'llhttp.wasm')}`, { stdio: 'inherit' })

const base64Wasm = readFileSync(join(WASM_OUT, 'llhttp.wasm')).toString('base64')
writeFileSync(
  join(WASM_OUT, 'llhttp-wasm.js'),
  `module.exports = "${base64Wasm}";\n`
)

// Build wasm simd binary
execSync(`clang \
 --sysroot=/usr/share/wasi-sysroot \
 -target wasm32-unknown-wasi \
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
 -Wl,--no-entry \
 ${join(WASM_SRC, 'src')}/*.c \
 -I${join(WASM_SRC, 'include')} \
 -o ${join(WASM_OUT, 'llhttp_simd.wasm')}`, { stdio: 'inherit' })

const base64WasmSimd = readFileSync(join(WASM_OUT, 'llhttp_simd.wasm')).toString('base64')
writeFileSync(
  join(WASM_OUT, 'llhttp_simd-wasm.js'),
  `module.exports = "${base64WasmSimd}";\n`
)
