/**
 * A port of tap's `t.type` that can be used with `node:assert`
 * https://github.com/tapjs/tapjs/blob/511019b2ac0fa014370154c3a341a0e632f50b19/src/asserts/src/index.ts#L199
 */
function ttype (plan, obj, klass) {
  const name =
        typeof klass === 'function'
          ? klass.name || '(anonymous constructor)'
          : klass

  if (obj === klass) {
    return plan.ok(1)
  }

  const tof = typeof obj
  const type =
        !obj && tof === 'object'
          ? 'null'
          // treat as object, but not Object
          // t.type(() => {}, Function)
          : tof === 'function' &&
            typeof klass === 'function' &&
            klass !== Object
            ? 'object'
            : tof

  if (
    (type === 'number' && klass === Number) ||
      (type === 'string' && klass === String) ||
      (type === 'bigint' && klass === BigInt) ||
      (klass === 'array' && Array.isArray(obj)) ||
      (type === 'symbol' && klass === Symbol)
  ) {
    return plan.ok(1)
  }

  // simplest case, it literally is the same thing
  if (type === 'object' && klass !== 'object') {
    if (typeof klass === 'function') {
      return plan.ok(obj instanceof klass)
    }

    // check prototype chain for name
    // at this point, we already know klass is not a function
    // if the klass specified is an obj in the proto chain, pass
    // if the name specified is the name of a ctor in the chain, pass
    for (let p = obj; p; p = Object.getPrototypeOf(p)) {
      const ctor = p.constructor && p.constructor.name
      if (p === klass || ctor === name) {
        return plan.ok(1)
      }
    }
  }

  return plan.strictEqual(type, name)
}

module.exports = {
  ttype
}
