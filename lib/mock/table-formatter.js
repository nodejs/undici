const { Transform } = require('stream')
const { Console } = require('console')

module.exports = class TableFormatter {
  constructor ({ disableColors } = {}) {
    this.transform = new Transform({
      transform (chunk, _enc, cb) {
        cb(null, chunk)
      }
    })

    this.logger = new Console({
      stdout: this.transform,
      inspectOptions: {
        colors: !disableColors && process.env.CI == null
      }
    })
  }

  formatTable (...args) {
    this.logger.table(...args)
    return (this.transform.read() || '').toString()
  }
}
