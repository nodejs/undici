import { IncomingHttpHeaders as CoreIncomingHttpHeaders, OutgoingHttpHeaders as CoreOutgoingHttpHeaders } from 'node:http'
import { expectAssignable, expectNotAssignable } from 'tsd'
import { IncomingHttpHeaders, OutgoingHttpHeaders } from '../../types/header'

const headers = {
  authorization: undefined,
  'content-type': 'application/json'
} satisfies CoreIncomingHttpHeaders

expectAssignable<IncomingHttpHeaders>(headers)

// It is why we do not need to add ` | null` to `IncomingHttpHeaders`:
expectNotAssignable<CoreIncomingHttpHeaders>({
  authorization: null,
  'content-type': 'application/json'
})

// `OutgoingHttpHeaders` accepts numeric values (e.g. `content-length`)
// in addition to strings, string arrays, and undefined values.
const outgoingHeaders = {
  'content-length': 42,
  'content-type': 'application/json',
  'set-cookie': ['a=1', 'b=2'],
  authorization: undefined
} satisfies CoreOutgoingHttpHeaders

expectAssignable<OutgoingHttpHeaders>(outgoingHeaders)
expectAssignable<OutgoingHttpHeaders>({ 'content-length': 42 })

// `IncomingHttpHeaders` should still be assignable to `OutgoingHttpHeaders`,
// since every incoming header value (string | string[] | undefined) is also a
// valid outgoing header value.
expectAssignable<OutgoingHttpHeaders>(headers)

// Numeric header values are not assignable to `IncomingHttpHeaders`.
expectNotAssignable<IncomingHttpHeaders>({ 'content-length': 42 })
