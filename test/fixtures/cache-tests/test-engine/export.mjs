import fs from 'fs'

import Ajv from 'ajv'

import tests from '../tests/index.mjs'

if (process.argv[2] === 'validate') {
  const ajv = new Ajv()
  const schema = JSON.parse(fs.readFileSync('test-engine/lib/testsuite-schema.json', 'utf8'))
  const validate = ajv.compile(schema)
  const valid = validate(tests)
  if (!valid) {
    console.log(validate.errors)
    process.exit(1)
  }
} else {
  console.log(JSON.stringify(tests, null, 2))
}
