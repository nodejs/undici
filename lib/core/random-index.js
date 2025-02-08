'use strict'

const {
  wellknownHeaderNames
} = require('./constants')

function shuffleArray (arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
const indexes = []
wellknownHeaderNames.forEach((key, idx) => {
  indexes.push(idx)
})
console.log(shuffleArray(indexes))
