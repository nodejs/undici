import { IncomingHttpHeaders as CoreIncomingHttpHeaders } from "http";
import { expectAssignable, expectNotAssignable } from "tsd";
import { IncomingHttpHeaders } from "../../types/header";

const headers = {
  authorization: undefined,
  ["content-type"]: "application/json",
} satisfies CoreIncomingHttpHeaders;

expectAssignable<IncomingHttpHeaders>(headers);

// It is why we do not need to add ` | null` to `IncomingHttpHeaders`:
expectNotAssignable<CoreIncomingHttpHeaders>({
  authorization: null,
  ["content-type"]: "application/json",
});
