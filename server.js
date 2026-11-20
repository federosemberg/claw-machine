import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { createGame } from './lib/game.js';
import { threeModules } from './lib/three-modules.js';

const port = Number(process.env.PORT || 3000);
const sensitivity = Number(process.env.GRIP_SENSITIVITY ?? .65);
if (!Number.isFinite(sensitivity) || sensitivity < 0 || sensitivity > 1) {
  throw new Error('GRIP_SENSITIVITY debe estar entre 0 y 1.');
}
const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : undefined;
const lan = Object.values(networkInterfaces()).flat()
  .filter(item => item.family === 'IPv4' && !item.internal)
  .map(item => item.address);
const sessions = new Map();
const token = () => randomBytes(18).toString('base64url');
const json = (response, code, value) => {
  response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

function getOrigin(request) {
  if (publicOrigin) return publicOrigin;
  const host = request.headers.host || `localhost:${port}`;
  const origin = new URL(`http://${host}`);
  if (lan[0] && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) origin.hostname = lan[0];
  return origin.origin;
}

const contentTypes = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  webp: 'image/webp', woff2: 'font/woff2', svg: 'image/svg+xml',
};

const vendorFiles = new Map(threeModules.map(([name, source]) => [`/vendor/${name}`, source]));

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const { pathname } = url;
    if (request.method === 'POST' && pathname === '/api/session') {
      const origin = request.headers.origin;
      if (publicOrigin && origin) {
        if (origin !== publicOrigin) return json(response, 403, { error: 'Origen no autorizado.' });
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (sessions.size >= 60) return json(response, 503, { error: 'Máquinas ocupadas. Volvé a intentar.' });
      const id = token();
      const screenKey = token();
      const controlKey = token();
      const controlPath = `/control/${id}#${controlKey}`;
      const controlUrl = new URL(controlPath, getOrigin(request)).href;
      sessions.set(id, { screenKey, controlKey, game: createGame({ sensitivity }), touched: Date.now() });
      return json(response, 201, {
        id, screenKey, controlPath,
        qr: await QRCode.toDataURL(controlUrl, { errorCorrectionLevel: 'M', margin: 4, scale: 6 }),
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'Método no admitido.' });
    const vendorFile = vendorFiles.get(pathname);
    if (vendorFile) {
      const module = await readFile(new URL(`./node_modules/three/${vendorFile}`, import.meta.url));
      response.writeHead(200, {
        'Content-Type': contentTypes.js, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      });
      return response.end(request.method === 'HEAD' ? undefined : module);
    }
    const file = pathname === '/' ? 'index.html'
      : /^\/control\/[\w-]+$/.test(pathname) ? 'control.html'
      : /^\/(?:[a-z0-9-]+\.(?:js|css)|assets\/[\w-]+\.(?:webp|woff2|svg))$/.test(pathname) ? pathname.slice(1) : null;
    if (!file) return json(response, 404, { error: 'Página desconocida.' });
    const data = await readFile(new URL(`./public/${file}`, import.meta.url));
    response.writeHead(200, {
      'Content-Type': contentTypes[file.split('.').pop()],
      'Cache-Control': file.startsWith('assets/') ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error.code === 'ENOENT') return json(response, 404, { error: 'Archivo desconocido.' });
    console.error(error);
    json(response, 500, { error: 'La máquina tuvo un problema.' });
  }
});

const sockets = new WebSocketServer({ server, path: '/live', maxPayload: 1024 });
const send = (socket, value) => {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536) socket.send(JSON.stringify(value));
};

sockets.on('connection', (socket, request) => {
  const query = new URL(request.url, 'http://localhost').searchParams;
  const session = sessions.get(query.get('id'));
  const key = query.get('key');
  const role = session && (key === session.screenKey ? 'screen' : key === session.controlKey ? 'control' : null);
  if (!role) return socket.close(4004, 'Sesión vencida');
  if (session[role]?.readyState === WebSocket.OPEN) return socket.close(4009, 'Ya hay un dispositivo conectado');
  session[role] = socket;
  session.game.move(0);
  session.touched = Date.now();
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('error', () => socket.terminate());
  socket.on('close', () => {
    if (session[role] !== socket) return;
    session[role] = undefined;
    session.game.move(0);
    session.touched = Date.now();
  });
  socket.on('message', data => {
    if (session[role] !== socket || !session.screen) return;
    const command = data.toString();
    if (session.control && role === 'screen' && command !== 'replay') return;
    const motion = /^move:([-+]?\d(?:\.\d{1,2})?),([-+]?\d(?:\.\d{1,2})?)$/.exec(command);
    if (motion) {
      const [x, z] = motion.slice(1).map(Number);
      if (Math.abs(x) <= 1 && Math.abs(z) <= 1) {
        session.movementUntil = Date.now() + 750;
        session.game.move(x, z);
      }
      return;
    }
    if (command === 'drop') session.game.drop();
    if (command === 'replay') session.game.replay();
  });
});

let frame = 0;
const tickDuration = 1000 / 60;
let nextTick = performance.now();
setInterval(() => {
  const now = performance.now();
  let steps = 0;
  while (now >= nextTick && steps++ < 5) {
    frame++;
    for (const session of sessions.values()) {
      if (!session.screen) continue;
      if (session.movementUntil && Date.now() > session.movementUntil) {
        session.movementUntil = undefined;
        session.game.move(0);
      }
      session.game.tick();
      if (frame % 2 !== 0) continue;
      const { balls, ...state } = session.game.snapshot();
      const status = { ...state, paired: Boolean(session.control), screenOnline: true };
      send(session.screen, { ...status, balls });
      send(session.control, status);
    }
    nextTick += tickDuration;
  }
  if (now >= nextTick) nextTick = now + tickDuration;
}, 8).unref();

setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.isAlive) socket.terminate();
    else {
      socket.isAlive = false;
      socket.ping();
    }
  }
  for (const [id, session] of sessions) {
    if (!session.screen) send(session.control, { screenOnline: false });
    if (!session.screen && Date.now() - session.touched > 20 * 60 * 1000) {
      session.control?.close(4004, 'Sesión vencida');
      sessions.delete(id);
    }
  }
}, 10000).unref();

server.listen(port, '0.0.0.0', () => {
  const address = server.address();
  console.log(`Grab Lab · http://localhost:${address.port}`);
  for (const ip of lan) console.log(`Red local · http://${ip}:${address.port}`);
});
