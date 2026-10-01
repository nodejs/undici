'use strict'

const { execFileSync } = require('node:child_process')
const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '../')
const OUT = join(ROOT, 'lib/milo')
const PACKAGE = '@perseveranza-pets/milo-cjs@latest'
const PACKAGE_DIR = process.env.MILO_PACKAGE_DIR

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

if (PACKAGE_DIR) {
  cpSync(PACKAGE_DIR, OUT, { recursive: true })
} else {
  const packResult = JSON.parse(execFileSync('npm', ['pack', PACKAGE, '--json'], { cwd: OUT, encoding: 'utf8' }))

  const tarball = join(OUT, packResult[0].filename)
  if (!existsSync(tarball)) {
    throw new Error('Failed to download milo package')
  }

  execFileSync('tar', ['-xzf', tarball, '-C', OUT, '--strip-components=1'], {
    stdio: 'inherit'
  })
  rmSync(tarball)
}
