'use strict'

/**
 * This module offers an optimized timer implementation designed for scenarios
 * where high precision is not critical.
 *
 * The timer achieves faster performance by using a low-resolution approach,
 * with an accuracy target of within 500ms. This makes it particularly useful
 * for timers with delays of 1 second or more, where exact timing is less
 * crucial.
 *
 * It's important to note that Node.js timers are inherently imprecise, as
 * delays can occur due to the event loop being blocked by other operations.
 * Consequently, timers may trigger later than their scheduled time.
 */

/**
 * The fastNow variable contains the internal fast timer clock value.
 *
 * @type {number}
 */
let fastNow = 0

/**
 * RESOLUTION_MS represents the target resolution time in milliseconds.
 *
 * @type {number}
 * @default 1000
 */
const RESOLUTION_MS = 1e3

/**
 * TICK_MS defines the desired interval in milliseconds between each tick.
 * The target value is set to half the resolution time, minus 1 ms, to account
 * for potential event loop overhead.
 *
 * @type {number}
 * @default 499
 */
const TICK_MS = (RESOLUTION_MS >> 1) - 1

/**
 * fastNowTimeout is a Node.js timer used to manage and process
 * the FastTimers stored in the timer heap.
 *
 * @type {NodeJS.Timeout}
 */
let fastNowTimeout

/**
 * The kFastTimer symbol is used to identify FastTimer instances.
 *
 * @type {Symbol}
 */
const kFastTimer = Symbol('kFastTimer')

/**
 * Simple binary min-heap implementation for timer optimization.
 * Timers are ordered by their expiration time (_idleStart + _idleTimeout).
 * This provides O(log n) insertion/removal and O(1) peek operations.
 */
class TimerHeap {
  /** @type {FastTimer[]} */
  heap = []

  /**
   * Adds a timer to the heap, maintaining the min-heap property.
   * The timer with the earliest expiration time will be at the top.
   *
   * @param {FastTimer} timer - The timer to add to the heap
   * @returns {void}
   */
  push (timer) {
    this.heap.push(timer)
    this._heapifyUp(this.heap.length - 1)
  }

  /**
   * Returns the timer with the earliest expiration time without removing it.
   *
   * @returns {FastTimer|undefined} The timer at the top of the heap, or undefined if empty
   */
  peek () {
    return this.heap[0]
  }

  /**
   * Removes and returns the timer with the earliest expiration time.
   *
   * @returns {FastTimer|undefined} The timer that was at the top of the heap, or undefined if empty
   */
  pop () {
    if (this.heap.length === 0) return undefined
    if (this.heap.length === 1) return this.heap.pop()

    const top = this.heap[0]
    this.heap[0] = this.heap.pop()
    this._heapifyDown(0)
    return top
  }

  /**
   * Removes a specific timer from the heap. This is an O(n) operation
   * as it requires finding the timer first.
   *
   * @param {FastTimer} timer - The timer to remove from the heap
   * @returns {boolean} True if the timer was found and removed, false otherwise
   */
  remove (timer) {
    for (let i = 0; i < this.heap.length; i++) {
      if (this.heap[i] === timer) {
        if (i === this.heap.length - 1) {
          this.heap.pop()
        } else {
          this.heap[i] = this.heap.pop()
          this._heapifyDown(i)
          this._heapifyUp(i)
        }
        return true
      }
    }

    return false
  }

  /**
   * Returns the number of timers in the heap.
   *
   * @returns {number} The number of timers currently in the heap
   */
  get size () {
    return this.heap.length
  }

  /**
   * Removes all timers from the heap.
   *
   * @returns {void}
   */
  clear () {
    this.heap.length = 0
  }

  /**
   * Restores the heap property by moving an element up the heap.
   * Used after insertion to maintain the min-heap property.
   *
   * @param {number} index - The index of the element to move up
   * @returns {void}
   * @private
   */
  _heapifyUp (index) {
    let i = index
    const heap = this.heap
    const node = heap[i]

    while (i > 0) {
      const parentIndex = Math.floor((i - 1) / 2)
      if (this._compare(node, heap[parentIndex]) >= 0) break
      heap[i] = heap[parentIndex]
      i = parentIndex
    }

    heap[i] = node
  }

  /**
   * Restores the heap property by moving an element down the heap.
   * Used after removal to maintain the min-heap property.
   *
   * @param {number} index - The index of the element to move down
   * @returns {void}
   * @private
   */
  _heapifyDown (index) {
    let i = index
    const heap = this.heap
    const node = heap[i]
    const len = heap.length

    while (true) {
      const left = 2 * i + 1
      const right = left + 1
      let smallest = i

      if (left < len && this._compare(heap[left], heap[smallest]) < 0) smallest = left
      if (right < len && this._compare(heap[right], heap[smallest]) < 0) smallest = right
      if (smallest === i) break

      heap[i] = heap[smallest]
      i = smallest
    }

    heap[i] = node
  }

  /**
   * Compares two timers based on their expiration time.
   * Returns a negative value if timer 'a' should expire before timer 'b',
   * positive if 'a' should expire after 'b', or zero if they expire at the same time.
   *
   * @param {FastTimer} a - First timer to compare
   * @param {FastTimer} b - Second timer to compare
   * @returns {number} Comparison result (-1, 0, or 1)
   * @private
   */
  _compare (a, b) {
    if (a._idleStart === -1) return 1
    if (b._idleStart === -1) return -1
    return a._executionTime - b._executionTime
  }
}

/**
 * The timerHeap contains all active FastTimers ordered by expiration time.
 *
 * @type {TimerHeap}
 */
const timerHeap = new TimerHeap()

/**
 * The pendingTimers set contains FastTimers that are waiting to be moved
 * to the timerHeap. These timers need their _idleStart value set first.
 *
 * @type {Set<FastTimer>}
 */
const pendingTimers = new Set()

/**
 * These constants represent the various states of a FastTimer.
 */

/**
 * The `NOT_IN_LIST` constant indicates that the FastTimer is not included
 * in the `timerHeap` or `pendingTimers`. Timers with this status will not be processed
 * during the next tick by the `onTick` function.
 *
 * A FastTimer can be re-added by invoking the `refresh` method on the FastTimer instance.
 */
const NOT_IN_LIST = /** @type {const} */ (-2)

/**
 * The `TO_BE_CLEARED` constant indicates that the FastTimer is scheduled
 * for removal. A FastTimer in this state will be skipped in the next tick
 * by the `onTick` function and will no longer be processed.
 *
 * This status is also set when the `clear` method is called on the FastTimer instance.
 */
const TO_BE_CLEARED = /** @type {const} */ (-1)

/**
 * The `PENDING` constant signifies that the FastTimer is awaiting processing
 * in the next tick by the `onTick` function. Timers with this status will have
 * their `_idleStart` value set and their status updated to `ACTIVE` in the next tick.
 */
const PENDING = /** @type {const} */ (0)

/**
 * The `ACTIVE` constant indicates that the FastTimer is active and waiting
 * for its timer to expire. During the next tick, the `onTick` function will
 * check if the timer has expired, and if so, it will execute the associated callback.
 */
const ACTIVE = /** @type {const} */ (1)

/** @typedef {typeof NOT_IN_LIST|typeof TO_BE_CLEARED|typeof PENDING|typeof ACTIVE} FastTimerState */

/**
 * @param {NodeJS.Timeout|FastTimer} timer
 * @returns {timer is FastTimer}
 */
function isFastTimer (timer) {
  return timer[kFastTimer] === true
}

/**
 * The onTick function processes pending timers and expired timers from the heap.
 *
 * @returns {void}
 */
function onTick () {
  /**
   * Increment the fastNow value by the TICK_MS value, despite the actual time
   * that has passed since the last tick. This approach ensures independence
   * from the system clock and delays caused by a blocked event loop.
   */
  fastNow += TICK_MS

  for (const fastTimer of pendingTimers) {
    if (fastTimer._state === PENDING) {
      // Set the _idleStart value to the fastNow value minus the TICK_MS value
      // to account for the time the timer was in the PENDING state.
      fastTimer._idleStart = fastNow - TICK_MS
      // Set the _executionTime to avoid re-calculating it multiple times
      fastTimer._executionTime = fastTimer._idleStart + fastTimer._idleTimeout
      fastTimer._state = ACTIVE
      timerHeap.push(fastTimer)
    }
  }
  pendingTimers.clear()

  // Process expired timers from the heap
  const expiredTimers = []
  while (timerHeap.size > 0) {
    const fastTimer = timerHeap.peek()

    // Check if this timer has expired
    if (fastNow < fastTimer._executionTime) {
      // This timer hasn't expired yet
      break
    }

    // Remove expired timer and add to processing list
    expiredTimers.push(timerHeap.pop())
  }

  // Execute expired timers
  for (const fastTimer of expiredTimers) {
    // Skip if timer was cleared
    if (fastTimer._state === TO_BE_CLEARED) {
      continue
    }

    if (fastTimer._state === ACTIVE &&
        fastNow >= fastTimer._idleStart + fastTimer._idleTimeout) {
      fastTimer._state = TO_BE_CLEARED
      fastTimer._idleStart = -1
      fastTimer._executionTime = -1
      fastTimer._onTimeout(fastTimer._timerArg)
    }
  }

  // If there are still active FastTimers, refresh the Timer.
  if (timerHeap.size !== 0 || pendingTimers.size !== 0) {
    refreshTimeout()
  }
}

/**
 * Refresh or create the fastNowTimeout timer.
 *
 * @returns {void}
 */
function refreshTimeout () {
  // If the fastNowTimeout is already set and the Timer has the refresh()-
  // method available, call it to refresh the timer.
  if (fastNowTimeout?.refresh) {
    fastNowTimeout.refresh()
    // fastNowTimeout is not instantiated yet or refresh is not available,
    // create a new Timer.
  } else {
    clearTimeout(fastNowTimeout)
    fastNowTimeout = setTimeout(onTick, TICK_MS)
    // If the Timer has an unref method, call it to allow the process to exit,
    // if there are no other active handles. When using fake timers or mocked
    // environments (like Jest), .unref() may not be defined.
    fastNowTimeout.unref?.()
  }
}

/**
 * The `FastTimer` class is a data structure designed to store and manage
 * timer information.
 */
class FastTimer {
  [kFastTimer] = true

  /**
   * The state of the timer, which can be one of the following:
   * - NOT_IN_LIST
   * - TO_BE_CLEARED
   * - PENDING
   * - ACTIVE
   *
   * @type {FastTimerState}
   * @private
   */
  _state = NOT_IN_LIST

  /**
   * The number of milliseconds to wait before calling the callback.
   *
   * @type {number}
   * @private
   */
  _idleTimeout = -1

  /**
   * The time in milliseconds when the timer was started. This value is used to
   * calculate when the timer should expire.
   *
   * @type {number}
   * @default -1
   * @private
   */
  _idleStart = -1

  /**
   * The time in milliseconds when the timer was scheduled to execute.
   * This is calculated as _idleStart + _idleTimeout.
   * @type {number}
   * @default -1
   * @private
   */
  _executionTime = -1

  /**
   * The function to be executed when the timer expires.
   * @type {Function}
   * @private
   */
  _onTimeout

  /**
   * The argument to be passed to the callback when the timer expires.
   *
   * @type {*}
   * @private
   */
  _timerArg

  /**
   * @constructor
   * @param {Function} callback A function to be executed after the timer
   * expires.
   * @param {number} delay The time, in milliseconds that the timer should wait
   * before the specified function or code is executed.
   * @param {*} arg
   */
  constructor (callback, delay, arg) {
    this._onTimeout = callback
    this._idleTimeout = delay
    this._timerArg = arg

    this.refresh()
  }

  /**
   * Sets the timer's start time to the current time, and reschedules the timer
   * to call its callback at the previously specified duration adjusted to the
   * current time.
   * Using this on a timer that has already called its callback will reactivate
   * the timer.
   *
   * @returns {void}
   */
  refresh () {
    // Remove from heap if currently active
    if (this._state === ACTIVE) {
      timerHeap.remove(this)
    }

    // Add to pending timers if not already there
    if (this._state === NOT_IN_LIST || this._state === TO_BE_CLEARED) {
      pendingTimers.add(this)
    } else if (this._state === ACTIVE) {
      // Was active, now pending again
      pendingTimers.add(this)
    }

    // If this is the first timer or only timer, refresh the fastNowTimeout for better resolution.
    if (!fastNowTimeout || (timerHeap.size + pendingTimers.size) === 1) {
      refreshTimeout()
    }

    // Setting the state to PENDING will cause the timer to be reset in the next tick
    this._state = PENDING

    // Set the _idleStart and _executionTime to -1 to indicate that the timer is pending
    this._idleStart = -1
    this._executionTime = -1
  }

  /**
   * The `clear` method cancels the timer, preventing it from executing.
   *
   * @returns {void}
   */
  clear () {
    if (this._state === ACTIVE) {
      // Don't remove from heap immediately (expensive O(n) operation)
      // Just mark as TO_BE_CLEARED and let onTick skip it
      this._state = TO_BE_CLEARED
    } else if (this._state === PENDING) {
      // Remove from pendingTimers set (fast O(1) operation)
      pendingTimers.delete(this)
      this._state = NOT_IN_LIST
    } else {
      // Already cleared or not in list
      this._state = NOT_IN_LIST
    }

    // Reset the _idleStart value to -1 to indicate that the timer is no longer active.
    this._idleStart = -1
    // Reset the _executionTime value to -1 to indicate that the timer is no longer scheduled.
    this._executionTime = -1
  }
}

/**
 * This module exports a setTimeout and clearTimeout function that can be
 * used as a drop-in replacement for the native functions.
 */
module.exports = {
  /**
   * The setTimeout() method sets a timer which executes a function once the
   * timer expires.
   * @param {Function} callback A function to be executed after the timer
   * expires.
   * @param {number} delay The time, in milliseconds that the timer should
   * wait before the specified function or code is executed.
   * @param {*} [arg] An optional argument to be passed to the callback function
   * when the timer expires.
   * @returns {NodeJS.Timeout|FastTimer}
   */
  setTimeout (callback, delay, arg) {
    // If the delay is less than or equal to the RESOLUTION_MS value return a
    // native Node.js Timer instance.
    return delay <= RESOLUTION_MS
      ? setTimeout(callback, delay, arg)
      : new FastTimer(callback, delay, arg)
  },
  /**
   * The clearTimeout method cancels an instantiated Timer previously created
   * by calling setTimeout.
   *
   * @param {NodeJS.Timeout|FastTimer} timeout
   */
  clearTimeout (timeout) {
    // If the timeout is a FastTimer, call its own clear method.
    if (isFastTimer(timeout)) {
      timeout.clear()
      // Otherwise it is an instance of a native NodeJS.Timeout, so call the
      // Node.js native clearTimeout function.
    } else {
      clearTimeout(timeout)
    }
  },
  isFastTimer,
  /**
   * The setFastTimeout() method sets a fastTimer which executes a function once
   * the timer expires.
   * @param {Function} callback A function to be executed after the timer
   * expires.
   * @param {number} delay The time, in milliseconds that the timer should
   * wait before the specified function or code is executed.
   * @param {*} [arg] An optional argument to be passed to the callback function
   * when the timer expires.
   * @returns {FastTimer}
   */
  setFastTimeout (callback, delay, arg) {
    return new FastTimer(callback, delay, arg)
  },
  /**
   * The clearFastTimeout method cancels an instantiated FastTimer previously
   * created by calling setFastTimeout.
   *
   * @param {FastTimer} timeout
   */
  clearFastTimeout (timeout) {
    timeout.clear()
  },
  /**
   * The now method returns the value of the internal fast timer clock.
   *
   * @returns {number}
   */
  now () {
    return fastNow
  },
  /**
   * Trigger the onTick function to process the timers.
   * Exported for testing purposes only.
   * Marking as deprecated to discourage any use outside of testing.
   * @deprecated
   * @param {number} [delay=0] The delay in milliseconds to add to the now value.
   */
  tick (delay = 0) {
    fastNow += delay - RESOLUTION_MS + 1
    onTick()
    onTick()
  },
  /**
   * Reset FastTimers.
   * Exported for testing purposes only.
   * Marking as deprecated to discourage any use outside of testing.
   * @deprecated
   */
  reset () {
    fastNow = 0
    timerHeap.clear()
    pendingTimers.clear()
    clearTimeout(fastNowTimeout)
    fastNowTimeout = null
  },
  /**
   * Exporting for testing purposes only.
   * Marking as deprecated to discourage any use outside of testing.
   * @deprecated
   */
  kFastTimer
}
