import baseTests from '../tests/index.mjs'

const SUITE = 'suite'
const TEST = 'id'

function populateLinks () {
  const anchors = new AnchorMap()
  baseTests.forEach(suite => {
    if (suite.spec_anchors) {
      suite.spec_anchors.forEach(anchor => {
        anchors.push(anchor, [SUITE, suite.id])
      })
    }
    suite.tests.forEach(test => {
      if (test.spec_anchors) {
        test.spec_anchors.forEach(anchor => {
          anchors.push(anchor, [TEST, test.id])
        })
      }
    })
  })
  for (const [anchor, ids] of anchors.map.entries()) {
    adornSpecSection(anchor, ids)
  }
}

function adornSpecSection (anchor, ids) {
  const anchorNode = document.getElementById(anchor)
  if (!anchorNode) {
    console.log(`Anchor ${anchor} not found.`)
    return
  }
  const headerNode = anchorNode.children[0]
  const wrapper = document.createElement('span')
  wrapper.classList.add('adornment')
  const adornment = document.createTextNode('ℹ️')
  wrapper.appendChild(adornment)
  wrapper.addEventListener('click', function (event) {
    event.preventDefault()
    showTests(ids)
    this.scrollIntoView(true)
  })
  headerNode.appendChild(wrapper)
}

function showTests (ids) {
  // modify the spec HTML to make room for the test results
  const specNode = document.getElementById('top')
  specNode.classList.add('half')
  const mainNode = document.querySelector('div[role="main"]')
  mainNode.classList.remove('col-lg-8')
  mainNode.classList.add('col-lg-11')
  const tocNode = document.getElementById('sidebar')
  tocNode.classList.remove('d-lg-block')
  tocNode.classList.add('d-none')
  const iframeNode = document.createElement('iframe')
  iframeNode.id = 'resultsFrame'
  const query = ids.map(id => `${id[0]}=${id[1]}`).join('&')
  iframeNode.setAttribute('src', `/index.html?${query}&frame=1`)
  document.body.appendChild(iframeNode)
}

class AnchorMap {
  constructor () {
    this.map = new Map()
  }

  push (k, v) {
    const val = this.map.get(k)
    if (val) {
      val.push(v)
      this.map.set(k, val)
    } else {
      this.map.set(k, [v])
    }
  }
}

populateLinks()
