import {expectAssignable} from "tsd";
import Undici from "../..";
import Dispatcher from "../../types/dispatcher";

expectAssignable<Dispatcher.DispatchInterceptor>(Undici.createRedirectInterceptor({ maxRedirections: 3 }))
