import { expectAssignable } from 'tsd'
import { util } from '../../types/util'

expectAssignable<Record<string, string | string[]>>(
  util.parseHeaders(['content-type', 'text/plain'])
)

expectAssignable<Record<string, string | string[]>>(
  util.parseHeaders([Buffer.from('content-type'), Buffer.from('text/plain')])
)

expectAssignable<Record<string, string | string[]>>(
  util.parseHeaders(
    [Buffer.from('content-type'), Buffer.from('text/plain')],
    {}
  )
)

expectAssignable<Record<string, string | string[]>>(
  util.parseHeaders([Buffer.from('content-type'), [Buffer.from('text/plain')]])
)

expectAssignable<string>(util.headerNameToString('content-type'))

expectAssignable<string>(util.headerNameToString(Buffer.from('content-type')))
