'use strict'

/**
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#name-date-time-formats
 *
 * @param {string} date
 * @param {Date} [now]
 * @returns {Date | undefined}
 */
function parseHttpDate (date, now) {
  // Sun, 06 Nov 1994 08:49:37 GMT    ; IMF-fixdate
  // Sun Nov  6 08:49:37 1994         ; ANSI C's asctime() format
  // Sunday, 06-Nov-94 08:49:37 GMT   ; obsolete RFC 850 format

  switch (date[3]) {
    case ',': return parseImfDate(date)
    case ' ': return parseAscTimeDate(date)
    default: return parseRfc850Date(date, now)
  }
}

/**
 * @see https://httpwg.org/specs/rfc9110.html#preferred.date.format
 *
 * @param {string} date
 * @returns {Date | undefined}
 */
function parseImfDate (date) {
  if (
    date.length !== 29 ||
    date[4] !== ' ' ||
    date[7] !== ' ' ||
    date[11] !== ' ' ||
    date[16] !== ' ' ||
    date[19] !== ':' ||
    date[22] !== ':' ||
    date[25] !== ' ' ||
    date[26] !== 'G' ||
    date[27] !== 'M' ||
    date[28] !== 'T'
  ) {
    return undefined
  }

  if (
    (date[0] !== 'S' || date[1] !== 'u' || date[2] !== 'n') &&
    (date[0] !== 'M' || date[1] !== 'o' || date[2] !== 'n') &&
    (date[0] !== 'T' || date[1] !== 'u' || date[2] !== 'e') &&
    (date[0] !== 'W' || date[1] !== 'e' || date[2] !== 'd') &&
    (date[0] !== 'T' || date[1] !== 'h' || date[2] !== 'u') &&
    (date[0] !== 'F' || date[1] !== 'r' || date[2] !== 'i') &&
    (date[0] !== 'S' || date[1] !== 'a' || date[2] !== 't') &&
    (date[0] !== 'S' || date[1] !== 'u' || date[2] !== 'n')
  ) {
    return undefined
  }

  const dayString = date.substring(5, 7)
  const day = Number.parseInt(dayString)
  if (isNaN(day) || (day < 10 && dayString[0] !== '0')) {
    // Not a number, 0, or it's less than 10 and didn't start with a 0
    return undefined
  }

  let monthIdx = -1

  if (
    (date[8] === 'J' && date[9] === 'a' && date[10] === 'n')
  ) {
    monthIdx = 0 // Jan
  } else if (
    (date[8] === 'F' && date[9] === 'e' && date[10] === 'b')
  ) {
    monthIdx = 1 // Feb
  } else if (
    (date[8] === 'M' && date[9] === 'a' && date[10] === 'r')
  ) {
    monthIdx = 2 // Mar
  } else if (
    (date[8] === 'A' && date[9] === 'p' && date[10] === 'r')
  ) {
    monthIdx = 3 // Apr
  } else if (
    (date[8] === 'M' && date[9] === 'a' && date[10] === 'y')
  ) {
    monthIdx = 4 // May
  } else if (
    (date[8] === 'J' && date[9] === 'u' && date[10] === 'n')
  ) {
    monthIdx = 5 // Jun
  } else if (
    (date[8] === 'J' && date[9] === 'u' && date[10] === 'l')
  ) {
    monthIdx = 6 // Jul
  } else if (
    (date[8] === 'A' && date[9] === 'u' && date[10] === 'g')
  ) {
    monthIdx = 7 // Aug
  } else if (
    (date[8] === 'S' && date[9] === 'e' && date[10] === 'p')
  ) {
    monthIdx = 8 // Sep
  } else if (
    (date[8] === 'O' && date[9] === 'c' && date[10] === 't')
  ) {
    monthIdx = 9 // Oct
  } else if (
    (date[8] === 'N' && date[9] === 'o' && date[10] === 'v')
  ) {
    monthIdx = 10 // Nov
  } else if (
    (date[8] === 'D' && date[9] === 'e' && date[10] === 'c')
  ) {
    monthIdx = 11 // Dec
  } else {
    // Not a valid month
    return undefined
  }

  const year = Number.parseInt(date.substring(12, 16))
  if (isNaN(year)) {
    return undefined
  }

  const hourString = date.substring(17, 19)
  const hour = Number.parseInt(hourString)
  if (isNaN(hour) || (hour < 10 && hourString[0] !== '0')) {
    return undefined
  }

  const minuteString = date.substring(20, 22)
  const minute = Number.parseInt(minuteString)
  if (isNaN(minute) || (minute < 10 && minuteString[0] !== '0')) {
    return undefined
  }

  const secondString = date.substring(23, 25)
  const second = Number.parseInt(secondString)
  if (isNaN(second) || (second < 10 && secondString[0] !== '0')) {
    return undefined
  }

  return new Date(Date.UTC(year, monthIdx, day, hour, minute, second))
}

/**
 * @see https://httpwg.org/specs/rfc9110.html#obsolete.date.formats
 *
 * @param {string} date
 * @returns {Date | undefined}
 */
function parseAscTimeDate (date) {
  // This is assumed to be in UTC

  if (
    date.length !== 24 &&
    date[3] !== ' ' &&
    date[7] !== ' ' &&
    date[10] !== ' ' &&
    date[19] !== ' '
  ) {
    return undefined
  }

  if (
    (date[0] !== 'S' || date[1] !== 'u' || date[2] !== 'n') &&
    (date[0] !== 'M' || date[1] !== 'o' || date[2] !== 'n') &&
    (date[0] !== 'T' || date[1] !== 'u' || date[2] !== 'e') &&
    (date[0] !== 'W' || date[1] !== 'e' || date[2] !== 'd') &&
    (date[0] !== 'T' || date[1] !== 'h' || date[2] !== 'u') &&
    (date[0] !== 'F' || date[1] !== 'r' || date[2] !== 'i') &&
    (date[0] !== 'S' || date[1] !== 'a' || date[2] !== 't') &&
    (date[0] !== 'S' || date[1] !== 'u' || date[2] !== 'n')
  ) {
    return undefined
  }

  let monthIdx = -1
  if (
    (date[4] === 'J' && date[5] === 'a' && date[6] === 'n')
  ) {
    monthIdx = 0 // Jan
  } else if (
    (date[4] === 'F' && date[5] === 'e' && date[6] === 'b')
  ) {
    monthIdx = 1 // Feb
  } else if (
    (date[4] === 'M' && date[5] === 'a')
  ) {
    if (date[6] === 'r') {
      monthIdx = 2 // Mar
    } else if (date[6] === 'y') {
      monthIdx = 4 // May
    } else {
      return undefined // Invalid month
    }
  } else if (
    (date[4] === 'J')
  ) {
    if (date[5] === 'a' && date[6] === 'n') {
      monthIdx = 0 // Jan
    } else if (date[5] === 'u') {
      if (date[6] === 'n') {
        monthIdx = 5 // Jun
      } else if (date[6] === 'l') {
        monthIdx = 6 // Jul
      } else {
        return undefined // Invalid month
      }
    } else {
      return undefined // Invalid month
    }
  } else if (
    (date[4] === 'A')
  ) {
    if (date[5] === 'p' && date[6] === 'r') {
      monthIdx = 3 // Apr
    } else if (date[5] === 'u' && date[6] === 'g') {
      monthIdx = 7 // Aug
    } else {
      return undefined // Invalid month
    }
  } else if (
    (date[4] === 'S' && date[5] === 'e' && date[6] === 'p')
  ) {
    monthIdx = 8 // Sep
  } else if (
    (date[4] === 'O' && date[5] === 'c' && date[6] === 't')
  ) {
    monthIdx = 9 // Oct
  } else if (
    (date[4] === 'N' && date[5] === 'o' && date[6] === 'v')
  ) {
    monthIdx = 10 // Nov
  } else if (
    (date[4] === 'D' && date[5] === 'e' && date[6] === 'c')
  ) {
    monthIdx = 11 // Dec
  } else {
    // Not a valid month
    return undefined
  }

  let day = 0
  if (date[8] === ' ') {
    // Single digit day, e.g. "Sun Nov 6 08:49:37 1994"
    const code = date.charCodeAt(9)
    if (code < 49 || code > 57) {
      return undefined // Not a digit
    }
    day = code - 48 // Convert ASCII code to number
  } else {
    const code1 = date.charCodeAt(8)
    if (code1 < 49 || code1 > 51) {
      return undefined // Not a digit between 1 and 3
    }
    const code2 = date.charCodeAt(9)
    if (code2 < 48 || code2 > 57) {
      return undefined // Not a digit
    }
    day = (code1 - 48) * 10 + (code2 - 48) // Convert ASCII codes to number
  }

  let hour = 0
  if (date[8] === '0') {
    const code = date.charCodeAt(12)
    if (code < 48 || code > 57) {
      return undefined // Not a digit
    }
    hour = code - 48 // Convert ASCII code to number
  } else {
    const code1 = date.charCodeAt(11)
    if (code1 < 48 || code1 > 50) {
      return undefined // Not a digit between 0 and 2
    }
    const code2 = date.charCodeAt(12)
    if (code2 < 48 || code2 > 57) {
      return undefined // Not a digit
    }
    if (code1 === 50 && code2 > 51) {
      return undefined // Hour cannot be greater than 23
    }
    hour = (code1 - 48) * 10 + (code2 - 48) // Convert ASCII codes to number
  }

  let minute = 0
  if (date[14] === '0') {
    const code = date.charCodeAt(15)
    if (code < 48 || code > 57) {
      return undefined // Not a digit
    }
    minute = code - 48 // Convert ASCII code to number
  } else {
    const code1 = date.charCodeAt(14)
    if (code1 < 48 || code1 > 53) {
      return undefined // Not a digit between 0 and 5
    }
    const code2 = date.charCodeAt(15)
    if (code2 < 48 || code2 > 57) {
      return undefined // Not a digit
    }
    minute = (code1 - 48) * 10 + (code2 - 48) // Convert ASCII codes to number
  }

  let second = 0
  if (date[17] === '0') {
    const code = date.charCodeAt(18)
    if (code < 48 || code > 57) {
      return undefined // Not a digit
    }
    second = code - 48 // Convert ASCII code to number
  } else {
    const code1 = date.charCodeAt(17)
    if (code1 < 48 || code1 > 53) {
      return undefined // Not a digit between 0 and 5
    }
    const code2 = date.charCodeAt(18)
    if (code2 < 48 || code2 > 57) {
      return undefined // Not a digit
    }
    second = (code1 - 48) * 10 + (code2 - 48) // Convert ASCII codes to number
  }

  const yearDigit1 = date.charCodeAt(20)
  if (yearDigit1 < 48 || yearDigit1 > 57) {
    return undefined // Not a digit
  }
  const yearDigit2 = date.charCodeAt(21)
  if (yearDigit2 < 48 || yearDigit2 > 57) {
    return undefined // Not a digit
  }
  const yearDigit3 = date.charCodeAt(22)
  if (yearDigit3 < 48 || yearDigit3 > 57) {
    return undefined // Not a digit
  }
  const yearDigit4 = date.charCodeAt(23)
  if (yearDigit4 < 48 || yearDigit4 > 57) {
    return undefined // Not a digit
  }
  const year = (yearDigit1 - 48) * 1000 + (yearDigit2 - 48) * 100 + (yearDigit3 - 48) * 10 + (yearDigit4 - 48)

  return new Date(Date.UTC(year, monthIdx, day, hour, minute, second))
}

/**
 * @see https://httpwg.org/specs/rfc9110.html#obsolete.date.formats
 *
 * @param {string} date
 * @param {Date} [now]
 * @returns {Date | undefined}
 */
function parseRfc850Date (date, now = new Date()) {
  const commaIndex = date.indexOf(',')
  if (commaIndex === -1) {
    return undefined
  }

  if (
    (date.length - commaIndex - 1) !== 23 ||
    date[commaIndex + 1] !== ' ' ||
    date[commaIndex + 4] !== '-' ||
    date[commaIndex + 8] !== '-' ||
    date[commaIndex + 11] !== ' ' ||
    date[commaIndex + 14] !== ':' ||
    date[commaIndex + 17] !== ':' ||
    date[commaIndex + 20] !== ' ' ||
    date[commaIndex + 21] !== 'G' ||
    date[commaIndex + 22] !== 'M' ||
    date[commaIndex + 23] !== 'T'
  ) {
    return undefined
  }

  if (
    (date[0] !== 'S' || date[1] !== 'u' || date[2] !== 'n' || date[3] !== 'd' || date[4] !== 'a' || date[5] !== 'y') &&
    (date[0] !== 'M' || date[1] !== 'o' || date[2] !== 'n' || date[3] !== 'd' || date[4] !== 'a' || date[5] !== 'y') &&
    (date[0] !== 'T' || date[1] !== 'u' || date[2] !== 'e' || date[3] !== 's' || date[4] !== 'd' || date[5] !== 'a' || date[6] !== 'y') &&
    (date[0] !== 'W' || date[1] !== 'e' || date[2] !== 'd' || date[3] !== 'n' || date[4] !== 'e' || date[5] !== 's' || date[6] !== 'd' || date[7] !== 'a' || date[8] !== 'y') &&
    (date[0] !== 'T' || date[1] !== 'h' || date[2] !== 'u' || date[3] !== 'r' || date[4] !== 's' || date[5] !== 'd' || date[6] !== 'a' || date[7] !== 'y') &&
    (date[0] !== 'F' || date[1] !== 'r' || date[2] !== 'i' || date[3] !== 'd' || date[4] !== 'a' || date[5] !== 'y') &&
    (date[0] !== 'S' || date[1] !== 'a' || date[2] !== 't' || date[3] !== 'u' || date[4] !== 'r' || date[5] !== 'd' || date[6] !== 'a' || date[7] !== 'y')
  ) {
    return undefined
  }

  const dayString = date.substring(commaIndex + 2, commaIndex + 4)
  const day = Number.parseInt(dayString)
  if (isNaN(day) || (day < 10 && dayString[0] !== '0')) {
    // Not a number, or it's less than 10 and didn't start with a 0
    return undefined
  }

  let monthIdx = -1
  if (
    (date[commaIndex + 5] === 'J' && date[commaIndex + 6] === 'a' && date[commaIndex + 7] === 'n')
  ) {
    monthIdx = 0 // Jan
  } else if (
    (date[commaIndex + 5] === 'F' && date[commaIndex + 6] === 'e' && date[commaIndex + 7] === 'b')
  ) {
    monthIdx = 1 // Feb
  } else if (
    (date[commaIndex + 5] === 'M' && date[commaIndex + 6] === 'a' && date[commaIndex + 7] === 'r')
  ) {
    monthIdx = 2 // Mar
  } else if (
    (date[commaIndex + 5] === 'A' && date[commaIndex + 6] === 'p' && date[commaIndex + 7] === 'r')
  ) {
    monthIdx = 3 // Apr
  } else if (
    (date[commaIndex + 5] === 'M' && date[commaIndex + 6] === 'a' && date[commaIndex + 7] === 'y')
  ) {
    monthIdx = 4 // May
  } else if (
    (date[commaIndex + 5] === 'J' && date[commaIndex + 6] === 'u' && date[commaIndex + 7] === 'n')
  ) {
    monthIdx = 5 // Jun
  } else if (
    (date[commaIndex + 5] === 'J' && date[commaIndex + 6] === 'u' && date[commaIndex + 7] === 'l')
  ) {
    monthIdx = 6 // Jul
  } else if (
    (date[commaIndex + 5] === 'A' && date[commaIndex + 6] === 'u' && date[commaIndex + 7] === 'g')
  ) {
    monthIdx = 7 // Aug
  } else if (
    (date[commaIndex + 5] === 'S' && date[commaIndex + 6] === 'e' && date[commaIndex + 7] === 'p')
  ) {
    monthIdx = 8 // Sep
  } else if (
    (date[commaIndex + 5] === 'O' && date[commaIndex + 6] === 'c' && date[commaIndex + 7] === 't')
  ) {
    monthIdx = 9 // Oct
  } else if (
    (date[commaIndex + 5] === 'N' && date[commaIndex + 6] === 'o' && date[commaIndex + 7] === 'v')
  ) {
    monthIdx = 10 // Nov
  } else if (
    (date[commaIndex + 5] === 'D' && date[commaIndex + 6] === 'e' && date[commaIndex + 7] === 'c')
  ) {
    monthIdx = 11 // Dec
  } else {
    // Not a valid month
    return undefined
  }

  // As of this point year is just the decade (i.e. 94)
  let year = Number.parseInt(date.substring(commaIndex + 9, commaIndex + 11))
  if (isNaN(year)) {
    return undefined
  }

  const currentYear = now.getUTCFullYear()
  const currentDecade = currentYear % 100
  const currentCentury = Math.floor(currentYear / 100)

  if (year > currentDecade && year - currentDecade >= 50) {
    // Over 50 years in future, go to previous century
    year += (currentCentury - 1) * 100
  } else {
    year += currentCentury * 100
  }

  const hourString = date.substring(commaIndex + 12, commaIndex + 14)
  const hour = Number.parseInt(hourString)
  if (isNaN(hour) || (hour < 10 && hourString[0] !== '0')) {
    return undefined
  }

  const minuteString = date.substring(commaIndex + 15, commaIndex + 17)
  const minute = Number.parseInt(minuteString)
  if (isNaN(minute) || (minute < 10 && minuteString[0] !== '0')) {
    return undefined
  }

  const secondString = date.substring(commaIndex + 18, commaIndex + 20)
  const second = Number.parseInt(secondString)
  if (isNaN(second) || (second < 10 && secondString[0] !== '0')) {
    return undefined
  }

  return new Date(Date.UTC(year, monthIdx, day, hour, minute, second))
}

module.exports = {
  parseHttpDate
}
