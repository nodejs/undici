const assert = require('node:assert');
const {describe, test, beforeEach, afterEach} = require('node:test');
const { WebSocketServer } = require('ws');
const { WebSocket } = require('../..');

describe('Close', () => {

  let server;
  beforeEach(() => {
    return new Promise((resolve) => {
      server = new WebSocketServer({ port: 0 });
      server.on('listening', resolve);
    })
  });

  afterEach(() => server.close());

  test('Close with code', () => {
    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('close', (code) => {
          assert.equal(code, 1000);
          resolve();
        });
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.addEventListener('open', () => ws.close(1000));
    })
  });

  test('Close with code and reason', () => {
    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('close', (code, reason) => {
          assert.equal(code, 1000);
          assert.deepStrictEqual(reason, Buffer.from('Goodbye'));
          resolve();
        });
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.addEventListener('open', () => ws.close(1000, 'Goodbye'));
    })
  });

  test('Close with invalid code', () => {
   return new Promise((resolve) => {
     const ws = new WebSocket(`ws://localhost:${server.address().port}`);
     ws.addEventListener('open', () => {
       assert.throws(
         () => ws.close(2999),
         {
           name: 'InvalidAccessError',
           message: 'invalid code'
         }
       );

       assert.throws(
         () => ws.close(5000),
         {
           name: 'InvalidAccessError',
           message: 'invalid code'
         }
       );

       resolve();
     });
   })
  });

  test('Close with invalid reason', () => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.addEventListener('open', () => {
        assert.throws(
          () => ws.close(1000, 'a'.repeat(124)),
          {
            name: 'SyntaxError',
            message: 'Reason must be less than 123 bytes; received 124'
          }
        );

        resolve();
      });
    })
  });

  test('Close with no code or reason', () => {
    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('close', (code, reason) => {
          assert.equal(code, 1005);
          assert.deepStrictEqual(reason, Buffer.alloc(0));
          resolve()
        });
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.addEventListener('open', () => ws.close());
    })
  });

  test('Close with a 3000 status code', () => {
    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('close', (code, reason) => {
          assert.equal(code, 3000);
          assert.deepStrictEqual(reason, Buffer.alloc(0));
          resolve();
        });
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.addEventListener('open', () => ws.close(3000));
    })
  });

});

