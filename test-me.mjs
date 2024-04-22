import { fetch } from './index.js'

console.time('fetch')
for (let i = 0; i < 100000; i++) {
  const res = await fetch('http://localhost:3000')
  // console.log(await res.text())
  await res.text()
}
console.timeEnd('fetch')
