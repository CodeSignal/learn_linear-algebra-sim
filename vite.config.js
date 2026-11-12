import { defineConfig } from 'vite';
import net from 'net';

const API_PORT = 3001;

// The app opens its WebSocket on the page origin (`ws://host/`). Forward those
// upgrades to the API server and leave Vite's own `vite-hmr` socket alone.
function forwardAppWebSocket() {
  return {
    name: 'forward-app-websocket',
    configureServer(server) {
      server.httpServer.on('upgrade', (req, socket, head) => {
        const protocol = req.headers['sec-websocket-protocol'] || '';
        const isViteSocket = protocol.split(',').some(entry => {
          const name = entry.trim();
          return name === 'vite-hmr' || name === 'vite-ping';
        });
        if (isViteSocket) return;

        const target = net.connect(API_PORT, '127.0.0.1', () => {
          const headers = [`GET ${req.url || '/'} HTTP/1.1`, `Host: localhost:${API_PORT}`];
          for (const [key, value] of Object.entries(req.headers)) {
            if (key.toLowerCase() === 'host') continue;
            const values = Array.isArray(value) ? value : [value];
            values.forEach(item => {
              if (item != null) headers.push(`${key}: ${item}`);
            });
          }
          target.write(`${headers.join('\r\n')}\r\n\r\n`);
          if (head && head.length) target.write(head);
          socket.pipe(target);
          target.pipe(socket);
        });

        const closeBoth = () => {
          socket.destroy();
          target.destroy();
        };
        target.on('error', closeBoth);
        socket.on('error', closeBoth);
      });
    }
  };
}

export default defineConfig({
  root: './client',
  plugins: [forwardAppWebSocket()],
  server: {
    host: '0.0.0.0',
    hmr: true,
    allowedHosts: true,
    port: 3000,
    // Match the endpoint exactly. A "/log" prefix would also catch /logger.js.
    proxy: {
      '^/log(\\?|$)': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true
      },
      '^/message(\\?|$)': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true
      }
    }
  }
});
