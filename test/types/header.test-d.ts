import { IncomingHttpHeaders as CoreIncomingHttpHeaders } from "http";
import { expectAssignable, expectNotAssignable } from "tsd";
import {
  IncomingHttpHeaders,
  IncomingH2PseudoHeaders,
} from "../../types/header";

const headers = {
  authorization: undefined,
  ["content-type"]: "application/json",
} satisfies CoreIncomingHttpHeaders;

const pseudoHeaders = {
  ":status": 200,
} satisfies IncomingH2PseudoHeaders;

expectAssignable<IncomingHttpHeaders>(headers);

expectAssignable<IncomingH2PseudoHeaders>(pseudoHeaders);

// It is why we do not need to add ` | null` to `IncomingHttpHeaders`:
expectNotAssignable<CoreIncomingHttpHeaders>({
  authorization: null,
  ["content-type"]: "application/json",
});
