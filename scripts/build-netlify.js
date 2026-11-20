import { cp, mkdir, writeFile } from 'node:fs/promises';
import { threeModules } from '../lib/three-modules.js';

const value = process.env.GAME_SERVER_URL;
if (!value) throw new Error('Configurá GAME_SERVER_URL con la URL HTTPS del servidor de partidas.');
const backend = new URL(value);
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname);
if (backend.protocol !== 'https:' && !(loopback && backend.protocol === 'http:')) {
  throw new Error('GAME_SERVER_URL debe usar HTTPS.');
}
if (backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) {
  throw new Error('GAME_SERVER_URL debe contener únicamente el origen, sin credenciales ni ruta.');
}

const output = new URL('../dist/', import.meta.url);
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
await mkdir(new URL('vendor/', output), { recursive: true });
await Promise.all(threeModules.map(([name, source]) => cp(
  new URL(`../node_modules/three/${source}`, import.meta.url), new URL(`vendor/${name}`, output),
)));
await writeFile(new URL('deployment.js', output), `export const gameServer = ${JSON.stringify(backend.origin)};\n`);
await cp(new URL('../node_modules/three/LICENSE', import.meta.url), new URL('vendor/LICENSE.txt', output));
await writeFile(new URL('_redirects', output), '/control/* /control.html 200\n');
