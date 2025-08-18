export function AssertionError (options) {
  this.name = 'Assertion'
  this.message = options.message
}

export function SetupError (options) {
  this.name = 'Setup'
  this.message = options.message
}

export function assert (isSetup, expr, message) {
  if (expr) return
  if (isSetup) {
    throw new SetupError({ message })
  } else {
    throw new AssertionError({ message })
  }
}

export function token () {
  return [toHex(randInt(32), 8),
    toHex(randInt(16), 4),
    toHex(0x4000 | randInt(12), 4),
    toHex(0x8000 | randInt(14), 4),
    toHex(randInt(48), 12)].join('-')
}

function randInt (bits) {
  if (bits < 1 || bits > 53) {
    throw new TypeError()
  } else {
    if (bits >= 1 && bits <= 30) {
      return 0 | ((1 << bits) * Math.random())
    } else {
      const high = (0 | ((1 << (bits - 30)) * Math.random())) * (1 << 30)
      const low = 0 | ((1 << 30) * Math.random())
      return high + low
    }
  }
}

function toHex (x, length) {
  let rv = x.toString(16)
  while (rv.length < length) {
    rv = '0' + rv
  }
  return rv
}

const rfc850day = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
}

const rfc850month = {
  0: 'Jan',
  1: 'Feb',
  2: 'Mar',
  3: 'Apr',
  4: 'May',
  5: 'Jun',
  6: 'Jul',
  7: 'Aug',
  8: 'Sep',
  9: 'Oct',
  10: 'Nov',
  11: 'Dec'
}

export function httpDate (now, deltaSecs, format) {
  const instant = new Date(now + (deltaSecs * 1000))
  if (format && format === 'rfc850') {
    const day = rfc850day[instant.getUTCDay()]
    const date = instant.getUTCDate().toString().padStart(2, '0')
    const month = rfc850month[instant.getUTCMonth()]
    const year = instant.getUTCFullYear().toString().slice(2)
    const hours = instant.getUTCHours().toString().padStart(2, '0')
    const mins = instant.getUTCMinutes().toString().padStart(2, '0')
    const secs = instant.getUTCSeconds().toString().padStart(2, '0')
    // Sunday, 06-Nov-94 08:49:37 GMT
    return `${day}, ${date}-${month}-${year} ${hours}:${mins}:${secs} GMT`
  }
  return instant.toGMTString()
}
