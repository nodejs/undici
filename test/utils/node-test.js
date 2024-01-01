/**
 * A port of tap's `t.type` that can be used with `node:assert`
 * https://github.com/tapjs/tapjs/blob/511019b2ac0fa014370154c3a341a0e632f50b19/src/asserts/src/index.ts#L199
 *
 * LICENSE(https://github.com/tapjs/tapjs/blob/511019b2ac0fa014370154c3a341a0e632f50b19/src/asserts/LICENSE.md):

# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with
this software as possible, while protecting contributors
from liability.

## Acceptance

In order to receive this license, you must agree to its
rules.  The rules of this license are both obligations
under that agreement and conditions to your license.
You must not do anything with this software that triggers
a rule that you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this
software that would otherwise infringe that contributor's
copyright in it.

## Notices

You must ensure that everyone who gets a copy of
any part of this software from you, with or without
changes, also gets the text of this license or a link to
<https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not
complied with [Notices](#notices), you can keep your
license by taking all practical steps to comply within 30
days after the notice.  If you do not do so, your license
ends immediately.

## Patent

Each contributor licenses you to do everything with this
software that would otherwise infringe any patent claims
they can license or become able to license.

## Reliability

No contributor can revoke this license.

## No Liability

***As far as the law allows, this software comes as is,
without any warranty or condition, and no contributor
will be liable to anyone for any damages related to this
software or this license, under any kind of legal claim.***
 */
function ttype (obj, klass) {
  const name =
        typeof klass === 'function'
          ? klass.name || '(anonymous constructor)'
          : klass

  if (obj === klass) {
    return true
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
    return true
  }

  // simplest case, it literally is the same thing
  if (type === 'object' && klass !== 'object') {
    if (typeof klass === 'function') {
      return obj instanceof klass
    }

    // check prototype chain for name
    // at this point, we already know klass is not a function
    // if the klass specified is an obj in the proto chain, pass
    // if the name specified is the name of a ctor in the chain, pass
    for (let p = obj; p; p = Object.getPrototypeOf(p)) {
      const ctor = p.constructor && p.constructor.name
      if (p === klass || ctor === name) {
        return true
      }
    }
  }

  return type === name
}

module.exports = {
  ttype
}
