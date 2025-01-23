import {expectAssignable} from "tsd";
import Undici from "../..";
import Dispatcher from "../../types/dispatcher";
import Interceptors from "../../types/interceptors";

expectAssignable<Dispatcher.DispatchInterceptor>(Undici.createRedirectInterceptor({ maxRedirections: 3 }))

expectAssignable<Dispatcher.ComposedDispatcher>(new Dispatcher().compose([Interceptors.dns({maxTTL: 2_000})]));

