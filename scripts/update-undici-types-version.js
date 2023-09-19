const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')

const packageJSONPath = path.join(__dirname, '..', 'package.json')
const packageJSONRaw = fs.readFileSync(packageJSONPath, 'utf-8')
const packageJSON = JSON.parse(packageJSONRaw)
const version = packageJSON.version

const packageTypesJSONPath = path.join(__dirname, '..', 'types', 'package.json')
const packageTypesJSONRaw = fs.readFileSync(packageTypesJSONPath, 'utf-8')
const packageTypesJSON = JSON.parse(packageTypesJSONRaw)
packageTypesJSON.version = version

fs.writeFileSync(packageTypesJSONPath, JSON.stringify(packageTypesJSON, null, 2))

childProcess.execSync('git add types/package.json', { cwd: path.join(__dirname, '..') })
childProcess.execSync(`git commit -n -m 'undici-type@${version}'`, { cwd: path.join(__dirname, '..') })
