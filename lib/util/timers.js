'use strict'

/**
 * This module provides a fast timer implementation,
 *
 * The timer is "faster" because it is a low resolution timer that only
 * tries to be accurate to within 500ms. This is useful for timers that
 * are expected to be set with a delay of 1 second or more. Node.js
 * timers are not guaranteed to be precise as the event loop could be
 * blocked by other tasks, and thus the timers could be refreshed later
 * than expected.
 */

const nativeSetTimeout = global.setTimeout
const nativeClearTimeout = global.clearTimeout

/**
 * The fastNow variable is used to store the current time in milliseconds
 * since the process started.
 *
 * @type {number}
 */
let fastNow = 0

/**
 * The RESOLUTION_MS is the desired time in milliseconds.
 *
 * @type {number}
 * @default 1000
 */
const RESOLUTION_MS = 1e3

/**
 * TICK_MS is the desired time in milliseconds between each tick. Target
 * is the half of the resolution time minus 1 ms to account for a potential
 * overhead of the event loop.
 *
 * @type {number}
 * @default 499
 */
const TICK_MS = (RESOLUTION_MS >> 1) - 1

/**
 * The fastNowTimeout is one Node.js timer that will be used to process
 * the FastTimers in the fastTimers array.
 *
 * @type {NodeJS.Timeout}
 */
let fastNowTimeout

/**
 * The kFastTimer symbol is used to identify the FastTimer instances.
 * @type {Symbol}
 */
const kFastTimer = Symbol('kFastTimer')

/**
 * The fastTimers array contains all the active FastTimers.
 *
 * @type {FastTimer[]}
 */
const fastTimers = []

/**
 * The following constants are used to represent the state of a FastTimer.
 */

/**
 * The NOT_IN_LIST constant is used to mark the FastTimer as not in the
 * fastTimers array. A FastTimer with this status will not be processed in the
 * next tick by the onTick function.
 *
 * A FastTimer can be added back to the fastTimers array by calling the refresh
 * method on the FastTimer instance.
 *
 * @type {-2}
 */
const NOT_IN_LIST = -2

/**
 * The TO_BE_CLEARED constant is used to mark the FastTimer as to be planned to
 * be removed from the fastTimers array. A FastTimer with this status will be
 * removed from the fastTimers array in the next tick by the onTick function,
 * thus it will not be processed again by the onTick function.
 *
 * A FastTimer can also be set to the TO_BE_CLEARED state if the clear method is
 * called on the FastTimer instance.
 *
 * @type {-1}
 */
const TO_BE_CLEARED = -1

/**
 * The PENDING constant is used to mark the FastTimer as waiting to be processed
 * in the next tick by the onTick function. A FastTimer with this status will
 * have their _idleStart value set accordingly and the status set to ACTIVE in
 * the next tick by the onTick function.
 *
 * @type {0}
 */
const PENDING = 0

/**
 * The ACTIVE constant is used to mark the FastTimer as active and waiting for
 * the timer to expire. A FastTimer with this status will be checked in the next
 * tick by the onTick function and if the timer has expired it will execute the
 * callback.
 *
 * @type {1}
 */
const ACTIVE = 1

/**
 * The onTick function is called every TICK_MS milliseconds and is responsible
 * for processing the fastTimers array.
 *
 * @returns {void}
 */
function onTick () {
  /**
   * The fastNow variable is used to store the current time in milliseconds
   * since the process started.
   *
   * @type {number}
   */
  fastNow = Math.trunc(performance.now())

  /**
   * The idx variable is used to iterate over the fastTimers array.
   * Expired fastTimers will be removed from the array by being
   * replaced with the last element in the array. Thus, the idx variable
   * will only be incremented if the current element is not removed.
   *
   * @type {number}
   */
  let idx = 0

  /**
   * The len variable will contain the length of the fastTimers array
   * and will be decremented when a FastTimer has to be removed the fastTimers
   * array.
   *
   * @type {number}
   */
  let len = fastTimers.length

  while (idx < len) {
    /**
     * @type {FastTimer}
     */
    const timer = fastTimers[idx]

    // If the timer is in the PENDING state, set the _idleStart accordingly and
    // set the state to ACTIVE.
    // If the timer is in the ACTIVE state and the timer has expired, it will
    // be processed in the next tick.
    if (timer._state === PENDING) {
      // Set the _idleStart value to the fastNow value minus the TICK_MS value
      // to account for the time the timer was in the PENDING state.
      timer._idleStart = fastNow - TICK_MS
      timer._state = ACTIVE
    } else if (
      timer._state === ACTIVE &&
      fastNow >= timer._idleStart + timer._idleTimeout
    ) {
      timer._state = TO_BE_CLEARED
      timer._idleStart = -1
      timer._onTimeout(timer._timerArg)
    }

    if (timer._state === TO_BE_CLEARED) {
      timer._state = NOT_IN_LIST

      // Move the last element to the current index and decrement len if it is
      // not the only element in the array.
      // After the while loop completed the excess elements will be removed.
      if (--len !== 0) {
        fastTimers[idx] = fastTimers[len]
      }
    } else {
      ++idx
    }
  }

  // Set the length of the fastTimers array to the new length and thus
  // removing the excess FastTimers from the array.
  fastTimers.length = len

  // If there are still active FastTimers in the array, refresh the Timer.
  // If there are no active FastTimers, the timer will be refreshed again
  // when a new FastTimer is instantiated.
  if (fastTimers.length !== 0) {
    refreshTimeout()
  }
}

function refreshTimeout () {
  // If the fastNowTimeout is already set, refresh it.
  if (fastNowTimeout) {
    fastNowTimeout.refresh()
  // fastNowTimeout is not instantiated yet, create a new Timer.
  } else {
    clearTimeout(fastNowTimeout)
    fastNowTimeout = setTimeout(onTick, TICK_MS)

    // If the Timer has an unref method, call it to allow the process to exit if
    // there are no other active handles.
    if (fastNowTimeout.unref) {
      fastNowTimeout.unref()
    }
  }
}

/**
 * The FastTimer class is a low resolution timer.
 */
class FastTimer {
  [kFastTimer] = true

  /**
   * If the state of the timer is a non-negative number, it represents the
   * time in milliseconds when the timer should expire. Values equal or less
   * than zero represent the following states:
   * - NOT_IN_LIST: The timer is not in the list of active timers.
   * - TO_BE_CLEARED: The timer is in the list of active timers but is marked
   *  to be cleared and removed from the fastTimers array in the next tick.
   * - PENDING: The timer is in the list of active timers and is waiting for
   *  the next tick to be activated.
   * - ACTIVE: The timer is in the list of active timers and is waiting for
   *  the timer to expire.
   * @type {number}
   * @private
   */
  _state = NOT_IN_LIST

  /**
   * The time in milliseconds when the timer should expire.
   *
   * @type {number}
   * @private
   */
  _idleTimeout = -1

  /**
   * The time in milliseconds when the timer was started. This value is used to
   * calculate when the timer should expire. If the timer is in the PENDING
   * state, this value is set to the fastNow value in the next tick by the
   * onTick function.
   *
   * @type {number}
   * @private
   */
  _idleStart = -1

  /**
   * The function to be executed when the timer expires.
   * @type {Function}
   * @private
   */
  _onTimeout

  /**
   * The argument to be passed to the function when the timer expires.
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
    // In the special case that the timer is not in the list of active timers,
    // add it back to the array to be processed in the next tick by the onTick
    // function.
    if (this._state === NOT_IN_LIST) {
      fastTimers.push(this)
    }

    // If the timer is the only active timer, refresh the fastNowTimeout for
    // better resolution.
    if (!fastNowTimeout || fastTimers.length === 1) {
      refreshTimeout()
    }

    // Setting the state to PENDING will cause the timer to be reset in the
    // next tick by the onTick function.
    this._state = PENDING
  }

  /**
   * The clear method marks the timer as to be cleared, by setting the _state
   * properly. The timer will be removed from the list of active timers in the
   * next tick by the onTick function
   *
   * @returns {void}
   * @private
   */
  clear () {
    this._state = TO_BE_CLEARED
    this._idleStart = -1
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
      ? nativeSetTimeout(callback, delay, arg)
      : new FastTimer(callback, delay, arg)
  },
  /**
   * The clearTimeout method cancels an instantiated Timer previously created
   * by calling setTimeout.
   *
   * @param {FastTimer} timeout
   */
  clearTimeout (timeout) {
    // If the timeout is a FastTimer, call its own clear method.
    if (timeout[kFastTimer]) {
      /**
       * @type {FastTimer}
       */
      timeout.clear()
      // Otherwise it an instance of a native NodeJS.Timeout, so call the
      // Node.js native clearTimeout function.
    } else {
      nativeClearTimeout(timeout)
    }
  },
  /**
   * The now method returns the value of the cached performance.now() value.
   *
   * @returns {number}
   */
  now () {
    return fastNow
  },
  /**
   * Exporting for testing purposes only.
   * Marking as deprecated to discourage any use outside of testing.
   * @deprecated
   */
  kFastTimer
}
