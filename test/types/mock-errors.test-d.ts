import { expectAssignable } from 'tsd'
import { mockErrors, errors } from '../..'

expectAssignable<errors.UndiciError>(new mockErrors.MockNotMatchedError())
expectAssignable<mockErrors.MockNotMatchedError>(new mockErrors.MockNotMatchedError())
expectAssignable<mockErrors.MockNotMatchedError>(new mockErrors.MockNotMatchedError('kaboom'))
expectAssignable<'MockNotMatchedError'>(new mockErrors.MockNotMatchedError().name)
expectAssignable<'UND_MOCK_ERR_MOCK_NOT_MATCHED'>(new mockErrors.MockNotMatchedError().code)

{
  // @ts-ignore
  function f (): mockErrors.MockNotMatchedError { }

  const e = f()

  if (e.code === 'UND_MOCK_ERR_MOCK_NOT_MATCHED') {
    expectAssignable<mockErrors.MockNotMatchedError>(e)
  }
}
