/* global fetch marked */

import '../../asset/marked.min.js'
import * as display from './display.mjs'
import { testLookup } from './results.mjs'

export function loadResults (index) {
  return Promise.all(index.map(item =>
    fetch(`results/${item.file}`)
      .then(response => {
        return response.json()
      })
      .then(results => {
        item.results = results
        return item
      }
      ))
  )
}

export function showResults (target, testSuites, results, testIds, suiteIds) {
  const isDefault = testIds.length === 0 && suiteIds.length === 0
  testSuites.forEach(testSuite => {
    const selectedTests = []
    const suiteTestIds = []
    testSuite.tests.forEach(test => {
      if (isDefault || suiteIds.includes(testSuite.id)) {
        selectedTests.push(test)
        suiteTestIds.push(test.id)
      }
      if (isDefault === 0 || testIds.includes(test.id)) {
        if (!suiteTestIds.includes(test.id)) {
          selectedTests.push(test)
        }
      }
    })
    if (selectedTests.length) {
      showHeader(testSuite, results).forEach(row => {
        target.appendChild(row)
      })
      selectedTests.forEach(test => {
        const result = showTest(testSuites, test.id, results)
        if (target.childElementCount % 2) {
          result.setAttribute('class', 'shade')
        }
        target.appendChild(result)
      })
    }
  })
}

export function showToC (target, testSuites) {
  testSuites.forEach(testSuite => {
    const suiteLink = document.createElement('a')
    suiteLink.href = '#' + testSuite.id
    suiteLink.appendChild(document.createTextNode(testSuite.name))
    const suiteLi = document.createElement('li')
    suiteLi.appendChild(suiteLink)
    target.appendChild(suiteLi)
  })
}

function showHeader (testSuite, results) {
  const rows = []
  const numCols = results.length + 2
  const blankRow = tableRow()
  blankRow.appendChild(emptyCell(numCols))
  rows.push(blankRow)
  const headerRow = tableRow()
  headerRow.appendChild(tableCell('th', '\xa0', 'name category'))
  const headerLink = document.createElement('a')
  headerLink.href = '#' + testSuite.id
  headerLink.appendChild(document.createTextNode(testSuite.name))
  const firstHeader = tableCell('th', headerLink, 'name category')
  firstHeader.id = testSuite.id
  headerRow.appendChild(firstHeader)
  results.forEach(implementation => {
    headerRow.appendChild(tableCell('th', implementation.name, 'category', implementation.version, implementation.link))
  })
  rows.push(headerRow)
  if (testSuite.description !== undefined) {
    const descriptionRow = tableRow()
    const drCells = emptyCell(numCols)
    drCells.innerHTML = marked.parse(testSuite.description).slice(3, -5)
    descriptionRow.appendChild(drCells)
    rows.push(descriptionRow)
  }
  return rows
}

function showTest (testSuites, testId, results) {
  const test = testLookup(testSuites, testId)
  const testRow = tableRow()
  testRow.appendChild(tableCell('td', testSelector(test.id)))
  testRow.appendChild(tableCell('th', display.showTestName(test), 'name'))
  results.forEach(implementation => {
    testRow.appendChild(
      tableCell('th', display.showTestResult(testSuites, test.id, implementation.results)))
  })
  return testRow
}

function tableRow (CssClass) {
  const rowElement = document.createElement('tr')
  if (CssClass) {
    rowElement.setAttribute('class', CssClass)
  }
  return rowElement
}

function tableCell (cellType, content, CssClass, hint, link, colspan) {
  const cellElement = document.createElement(cellType)
  if (CssClass) {
    cellElement.setAttribute('class', CssClass)
  }
  if (colspan) {
    cellElement.colSpan = colspan
  }
  let contentNode
  if (typeof (content) === 'string') {
    contentNode = document.createTextNode(content)
  } else {
    contentNode = content
  }
  if (link) {
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', link)
    linkElement.appendChild(contentNode)
    cellElement.appendChild(linkElement)
  } else {
    cellElement.appendChild(contentNode)
  }
  if (hint) {
    cellElement.title = hint
  }
  return cellElement
}

function testSelector (testId) {
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.name = 'id'
  checkbox.value = testId
  checkbox.style.display = 'none'
  checkbox.setAttribute('class', 'select')
  return checkbox
}

export function selectClickListen () {
  const select = document.getElementById('select')
  select.addEventListener('click', selectClick, {
    once: true
  })
}

function selectClick () {
  const selectBoxes = document.getElementsByClassName('select')
  for (const selectBox of selectBoxes) {
    selectBox.style.display = 'inherit'
  }
  const submit = document.createElement('input')
  submit.type = 'submit'
  submit.value = 'Show only selected tests'
  const select = document.getElementById('select')
  select.replaceWith(submit)
}

export function selectClearShow () {
  const clear = document.createElement('a')
  clear.href = '?'
  clear.appendChild(document.createTextNode('Clear selections'))
  const select = document.getElementById('select')
  select.replaceWith(clear)
}

function emptyCell (numCols = 1) {
  return tableCell('td', '\xa0', undefined, undefined, undefined, numCols)
}
