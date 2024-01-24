const WebSocket = require('ws');

function createWebSocketServer() {
  const wss = new WebSocket.Server({ noServer: true });

  wss.on('connection', ws => {
    ws.on('message', message => {
      console.log(`Received message: ${message}`);
      ws.send('Received your message!');
    });
  });

  return wss;
}

module.exports = createWebSocketServer;