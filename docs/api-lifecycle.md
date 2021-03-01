# Client Lifecycle

An Undici [Client](Client.md) can be best described as a state machine. The following list is a summary of the various state transitions the `Client` will go through in its lifecycle. This document also contains detailed breakdowns of each state.

> This diagram is not a perfect representation of the undici Client. Since the Client class is not actually implemented as a state-machine, actual execution may deviate slightly from what is described below. Consider this as a general resource for understanding the inner workings of the Undici client rather than some kind of formal specification.

## State Transition Overview

* A `Client` begins in the **idle** state with no socket connection and no requests in queue.
  * The *connect* event transitions the `Client` to the **pending** state where requests can be queued prior to processing
  * The *close* and *destroy* events transition the `Client` to the **destroyed** state. Since there are no requests in the queue, the *close* event immediately transitions to the **destroyed** state.
* The **pending** state indicates the underlying socket connection has been successfully established and requests are queueing.
  * The *process* event transitions the `Client` to the **processing** state where requests are processed.
  * If requests are queued, the *close* event transitions to the **processing** state; otherwise, it transitions to the **destroyed** state.
  * The *destroy* event transitions to the **destroyed** state.
* The **processing** state initializes to the **processing.running** state.
  * If the current request requires draining, the *needDrain* event transitions the `Client` into the **processing.busy** state which will return to the **processing.running** state with the *drainComplete* event.
  * After all queued requests are completed, the *keepalive* event transitions the `Client` back to the **pending** state. If no requests are queued during the timeout, the **close** event transitions the `Client` to the **destroyed** state.
  * If the *close* event is fired while the `Client` still has queued requests, the `Client` transitions to the **process.closing** state where it will complete all existing requests before firing the *done* event.
  * The *done* event gracefully transitions the `Client` to the **destroyed** state.
  * At any point in time, the *destroy* event will transition the `Client` from the **processing** state to the **destroyed** state, destroying any queued requests.
* The **destroyed** state is a final state and the `Client` is no longer functional.

![A state diagram representing an Undici Client instance](assets/lifecycle-diagram.png)

> The diagram was generated using Mermaid.js Live Editor. Modify the state diagram [here](https://mermaid-js.github.io/mermaid-live-editor/#/edit/eyJjb2RlIjoic3RhdGVEaWFncmFtLXYyXG4gICAgWypdIC0tPiBpZGxlXG4gICAgaWRsZSAtLT4gcGVuZGluZyA6IGNvbm5lY3RcbiAgICBpZGxlIC0tPiBkZXN0cm95ZWQgOiBkZXN0cm95L2Nsb3NlXG4gICAgXG4gICAgcGVuZGluZyAtLT4gaWRsZSA6IHRpbWVvdXRcbiAgICBwZW5kaW5nIC0tPiBkZXN0cm95ZWQgOiBkZXN0cm95XG5cbiAgICBzdGF0ZSBjbG9zZV9mb3JrIDw8Zm9yaz4-XG4gICAgcGVuZGluZyAtLT4gY2xvc2VfZm9yayA6IGNsb3NlXG4gICAgY2xvc2VfZm9yayAtLT4gcHJvY2Vzc2luZ1xuICAgIGNsb3NlX2ZvcmsgLS0-IGRlc3Ryb3llZFxuXG4gICAgcGVuZGluZyAtLT4gcHJvY2Vzc2luZyA6IHByb2Nlc3NcblxuICAgIHByb2Nlc3NpbmcgLS0-IHBlbmRpbmcgOiBrZWVwYWxpdmVcbiAgICBwcm9jZXNzaW5nIC0tPiBkZXN0cm95ZWQgOiBkb25lXG4gICAgcHJvY2Vzc2luZyAtLT4gZGVzdHJveWVkIDogZGVzdHJveVxuXG4gICAgc3RhdGUgcHJvY2Vzc2luZyB7XG4gICAgICAgIHJ1bm5pbmcgLS0-IGJ1c3kgOiBuZWVkRHJhaW5cbiAgICAgICAgYnVzeSAtLT4gcnVubmluZyA6IGRyYWluQ29tcGxldGVcbiAgICAgICAgcnVubmluZyAtLT4gWypdIDoga2VlcGFsaXZlXG4gICAgICAgIHJ1bm5pbmcgLS0-IGNsb3NpbmcgOiBjbG9zZVxuICAgICAgICBjbG9zaW5nIC0tPiBbKl0gOiBkb25lXG4gICAgICAgIFsqXSAtLT4gcnVubmluZ1xuICAgIH1cbiAgICAiLCJtZXJtYWlkIjp7InRoZW1lIjoiYmFzZSJ9LCJ1cGRhdGVFZGl0b3IiOmZhbHNlfQ)

## State details

### idle

The **idle** state is the initial state of a `Client` instance. While an `origin` is required for instantiating a `Client` instance, the underlying socket connection will not be established until a request is queued using [`Client.dispatch()`](#clientdispatchoptions-handlers). By calling `Client.dispatch()` directly or using one of the multiple implementations ([`Client.connect()`](#clientconnectoptions--callback), [`Client.pipeline()`](#clientpipelineoptions-handler), [`Client.request()`](#clientrequestoptions--callback), [`Client.stream()`](#clientstreamoptions-factory--callback), and [`Client.upgrade()`](#clientupgradeoptions-callback)), the `Client` instance will transition from **idle** to [**pending**](#pending) and then most likely directly to [**processing**](#processing).

Calling [`Client.close()`](#clientclose-callback-) or [`Client.destroy()`](#clientdestroyerror) transitions directly to the [**destroyed**](#destroyed) state since the `Client` instance will have no queued requests in this state.

### pending

The **pending** state signifies a non-processing `Client`. Upon entering this state, the `Client` establishes a socket connection and emits the [`'connect'`](Client.md#event-connect) event signalling a connection was successfully established with the `origin` provided during `Client` instantiation. The internal queue is initially empty, and requests can start queueing.

Calling [`Client.close()`](#clientclose-callback-) with queued requests, transitions the `Client` to the [**processing**](#processing) state. Without queued requests, it transitions to the [**destroyed**](#destroyed) state.

Calling [`Client.destroy()`](#clientdestroyerror) transitions directly to the [**destroyed**](#destroyed) state regardless of existing requests.

### processing

The **processing** state is machine within itself. It initializes to the [**processing.running**](#running) state. The [`Client.dispatch()`](#clientdispatchoptions-handlers), [`Client.close()`](#clientclose-callback-), and [`Client.destroy()`](#clientdestroyerror) can be called at any time while the `Client` is in this state. `Client.dispatch()` will add more requests to the queue while existing requests continue to be processed. `Client.close()` will transition to the **processing.closing** state. And `Client.destroy()` will transition to **destroyed**.

#### running

In the **processing.running** sub-state, queued requests are being processed one at a time (unless pipelining has been enabled). If a request body requires draining, the *needDrain* event transitions to the **prcoessing.busy** sub-state.
#### busy

#### closing

### destroyed


<!-- Old description ## Processing state

A `Client` transitions to the **processing** state during the [`Client.dispatch()`](#clientdispatchoptions-handlers) method. The [`Client.connect()`](#clientconnectoptions--callback), [`Client.pipeline()`](#clientpipelineoptions-handler), [`Client.request()`](#clientrequestoptions--callback), [`Client.stream()`](#clientstreamoptions-factory--callback), and [`Client.upgrade()`](#clientupgradeoptions-callback) methods are all based on [`Client.dispatch()`](#clientdispatchoptions-handlers); thus, they all cause a **processing** state transition when called.

Upon entering this state, the `Client` establishes a socket connection and emits the [`'connect'`](Client.md#event-connect) event signalling a connection was successfully established with the `origin` provided during `Client` instantiation.

While in this state, the `Client` is actively processing requests stored in the internal queue. If pipelining is enabled, the `Client` is processing the requests in parallel. Once all of the requests have been processed, the `Client` will remain in this state until the end of the `keepAliveTimeout`. Once the socket connection timeout ends, the `Client` emits a [`'disconnect'`](#event-disconnect) event and returns to the **idle** state. More requests may be queued, and the `Client` will once again transition to the **processing** state. -->
