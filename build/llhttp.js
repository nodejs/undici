'use strict'

const { join, resolve } = require('path')
const { copyFileSync, rmSync } = require('fs')
const { execSync } = require('child_process')
const TMP = require('os').tmpdir()

const REPO = 'git@github.com:dnlup/llhttp.git'
const CHECKOUT = 'undici_wasm'
const REPO_PATH = join(TMP, 'llhttp')
const WASM_OUT = resolve(__dirname, '../lib/llhttp')

let code = 0

try {
  execSync(`git clone ${REPO}`, { stdio: 'inherit', cwd: TMP })
  execSync(`git checkout ${CHECKOUT}`, { stdio: 'inherit', cwd: REPO_PATH })
  // https://docs.npmjs.com/cli/v7/commands/npm-ci
  // Performs a clean install using the lockfile, this makes the installation faster.
  execSync('npm ci', { stdio: 'inherit', cwd: REPO_PATH })
  execSync('npm run build-wasm', { stdio: 'inherit', cwd: REPO_PATH })
  copyFileSync(join(REPO_PATH, 'build', 'wasm', 'llhttp.wasm'), join(WASM_OUT, 'llhttp.wasm'))
  copyFileSync(join(REPO_PATH, 'build', 'wasm', 'constants.js'), join(WASM_OUT, 'constants.js'))
} catch (error) {
  console.error(error)
  code = 1
} finally {
  rmSync(REPO_PATH, { recursive: true, force: true })
  process.exit(code)
}
