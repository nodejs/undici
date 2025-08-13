const contentSeed = 1
const contentStore = {}
export function httpContent (csKey, contentLength = 15) {
  if (csKey in contentStore) {
    return contentStore[csKey]
  } else {
    let keySeed = 0
    for (let i = 0; i < csKey.length; i++) {
      keySeed += csKey.charCodeAt(i)
    }
    const contents = []
    for (let i = 0; i < contentLength; ++i) {
      const idx = ((i * keySeed * contentSeed) % 26) + 97
      contents.push(String.fromCharCode(idx))
    }
    const content = contents.join('')
    contentStore[csKey] = content
    return content
  }
}
