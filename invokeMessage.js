const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', function open() {
  const message = {
    jsonrpc: '2.0',
    id: 1,
    method: 'someMethod',
    params: ['param1', 'param2']
  };
  ws.send(JSON.stringify(message));
});