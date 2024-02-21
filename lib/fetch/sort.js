'use strict'

/** **binary insertion sort**
 * - Best -> O(n)
 * - Average -> O(n^2)
 * - Worst -> O(n^2)
 * - Memory -> O(n) total, O(1) auxiliary
 * - Stable -> true
 * @param {any[]} array
 * @param {number} begin begin
 * @param {number} end end
 * @param {(a: any, b: any) => number} compare
 */
function binaryInsertionSort (array, begin, end, compare) {
  for (
    let i = begin + 1, j = 0, right = 0, left = 0, pivot = 0, x;
    i < end;
    ++i
  ) {
    x = array[i]
    left = 0
    right = i
    // binary search
    while (left < right) {
      // middle index
      pivot = left + ((right - left) >> 1)
      if (compare(array[pivot], x) <= 0) {
        left = pivot + 1
      } else {
        right = pivot
      }
    }
    if (i !== pivot) {
      j = i
      while (j > left) {
        array[j] = array[--j]
      }
      array[left] = x
    }
  }
  return array
}

/**
 * @param {number} num
 */
function log2 (num) {
  // Math.floor(Math.log2(n))
  let log = 0
  // eslint-disable-next-line no-cond-assign
  while ((num >>= 1)) ++log
  return log
}

/** **intro sort**
 * - Average -> O(n log n)
 * - Worst -> O(n log n)
 * - Stable -> false
 * @param {any[]} array
 * @param {number} begin begin
 * @param {number} end end
 * @param {(a: any, b: any) => number} compare
 */
function introSort (array, begin, end, compare) {
  return _introSort(array, begin, end, log2(end - begin) << 1, compare)
}

/**
 * @param {any[]} array
 * @param {number} begin
 * @param {number} end
 * @param {number} depth
 * @param {(a: any, b: any) => number} compare
 */
function _introSort (array, begin, end, depth, compare) {
  if (end - begin <= 32) {
    return binaryInsertionSort(array, begin, end, compare)
  }
  if (depth-- <= 0) {
    return heapSort(array, begin, end, compare)
  }
  // median of three quick sort
  let i = begin
  let j = end - 1
  const pivot = medianOf3(
    array[i],
    array[i + ((j - i) >> 1)],
    array[j],
    compare
  )
  while (true) {
    while (compare(array[i], pivot) < 0) ++i
    while (compare(pivot, array[j]) < 0) --j
    if (i >= j) break;
    [array[i], array[j]] = [array[j], array[i]]
    ++i
    --j
  }
  if (i - begin > 1) _introSort(array, begin, i, depth, compare)
  // if (end - (j + 1) > 1) ...
  if (end - j > 2) _introSort(array, j + 1, end, depth, compare)
  return array
}

/** **heap sort (bottom up)**
 * - Best -> Ω(n)
 * - Average -> O(n log n)
 * - Worst -> O(n log n)
 * - Memory -> O(n) total, O(1) auxiliary
 * - Stable -> false
 * @param {any[]} array
 * @param {number} begin
 * @param {number} end
 * @param {(a: any, b: any) => number} compare
 */
function heapSort (array, begin, end, compare) {
  const N = end - begin
  let p = N >> 1
  let q = N - 1
  let x
  while (p > 0) {
    downHeap(array, array[begin + p - 1], begin, --p, q, compare)
  }
  while (q > 0) {
    x = array[begin + q]
    array[begin + q] = array[begin]
    downHeap(array, (array[begin] = x), begin, 0, --q, compare)
  }
  return array
}

/**
 * @param {any[]} array
 * @param {any} x
 * @param {number} begin
 * @param {number} p
 * @param {number} q
 * @param {(a: any, b: any) => number} compare
 */
function downHeap (array, x, begin, p, q, compare) {
  let c
  while ((c = (p << 1) + 1) <= q) {
    if (c < q && compare(array[begin + c], array[begin + c + 1]) < 0) ++c
    if (compare(x, array[begin + c]) >= 0) break
    array[begin + p] = array[begin + c]
    p = c
  }
  array[begin + p] = x
}

/**
 * @param {any} x
 * @param {any} y
 * @param {any} z
 * @param {(a: any, b: any) => number} compare
 */
function medianOf3 (x, y, z, compare) {
  return compare(x, y) < 0
    ? compare(y, z) < 0
      ? y
      : compare(z, x) < 0
        ? x
        : z
    : compare(z, y) < 0
      ? y
      : compare(x, z) < 0
        ? x
        : z
}

/**
 * @param {any[]} array
 * @param {(a: any, b: any) => number} compare
 */
function sort (array, compare) {
  const length = array.length
  if (length <= 128) {
    return _introSort(array, 0, length, log2(length) << 1, compare)
  }
  // For sorted arrays, intro sort is slow, so use the native implementation.
  // TODO: fix performance regression for sorted arrays.
  return array.sort(compare)
}

module.exports = {
  sort,
  binaryInsertionSort,
  introSort,
  heapSort
}
