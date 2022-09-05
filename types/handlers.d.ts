import Dispatcher from "./dispatcher";

export declare class RedirectHandler extends Dispatcher{
  constructor (dispatch: Dispatcher, maxRedirections: number, opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandlers)
}

export declare class DecoratorHandler extends Dispatcher{
  constructor (handler: Dispatcher.DispatchHandlers)
}
