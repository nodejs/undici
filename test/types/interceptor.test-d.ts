import {expectAssignable} from "tsd";
import Undici from "../..";
import Dispatcher, {DispatchInterceptor} from "../../types/dispatcher";

expectAssignable<DispatchInterceptor>(Undici.createRedirectInterceptor({ maxRedirections: 3 }))
