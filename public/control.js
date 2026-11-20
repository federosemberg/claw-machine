import { gameServer } from './deployment.js';
const joystick = document.getElementById('joystick');
const stick = document.getElementById('stick');
const drop = document.getElementById('drop');
const replay = document.getElementById('remote-replay');
const status = document.getElementById('remote-status');
const id = location.pathname.split('/').pop();
const key = location.hash.slice(1);
let socket;
let ready = false;
let pointer;
const neutral = 'move:0,0';
const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const keys = new Set();
let direction = neutral;
let retry = 600;

function send(command) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(command);
}

function position(x, z) {
  const command = `move:${Number(x.toFixed(2))},${Number(z.toFixed(2))}`;
  if (direction !== command) send(command);
  direction = command;
  stick.style.transform = `translate(${x * 43}%, ${z * 43}%)`;
  stick.classList.toggle('off-center', command !== neutral);
  joystick.dataset.horizontal = x < -.24 ? 'left' : x > .24 ? 'right' : '';
  joystick.dataset.vertical = z < -.24 ? 'back' : z > .24 ? 'front' : '';
}

function reset() {
  pointer = undefined;
  keys.clear();
  position(0, 0);
}

function steerWithKeys() {
  const x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  const z = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
  const scale = Math.max(1, Math.hypot(x, z));
  position(x / scale, z / scale);
}

function update(state) {
  ready = state.screenOnline && state.stage === 'ready';
  const finished = state.screenOnline && ['won','missed'].includes(state.stage);
  joystick.setAttribute('aria-disabled', String(!ready));
  drop.disabled = !ready;
  drop.hidden = finished;
  replay.hidden = !finished;
  if (!ready) reset();
  const message = !state.screenOnline ? 'Esperando a la pantalla…'
    : state.stage === 'loading' ? 'Acomodando las pelotas…'
    : ready ? 'Conectado. Mové la garra y soltala.'
    : state.stage === 'won' ? '¡Esfera atrapada! Mirá la pantalla.'
    : state.stage === 'missed' ? 'Terminó el turno. Podés volver a jugar.'
    : 'La garra está en movimiento…';
  if (status.textContent !== message) status.textContent = message;
}

function connect() {
  if (!key) {
    status.textContent = 'Escaneá el QR que aparece en la máquina.';
    return;
  }
  const endpoint = new URL('/live', gameServer);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  endpoint.search = new URLSearchParams({ id, key });
  socket = new WebSocket(endpoint);
  socket.addEventListener('message', event => {
    retry = 600;
    update(JSON.parse(event.data));
  });
  socket.addEventListener('close', event => {
    update({ screenOnline: false });
    if (event.code === 4004) {
      status.textContent = 'La sesión venció. Escaneá el QR actual de la máquina.';
      return;
    }
    if (event.code === 4009) {
      status.textContent = 'Otro celular ya está usando este joystick.';
      return;
    }
    status.textContent = 'Reconectando con la máquina…';
    setTimeout(connect, retry);
    retry = Math.min(5000, retry * 2);
  });
}

function slide(clientX, clientY) {
  const { left, top, width, height } = joystick.getBoundingClientRect();
  const x = clientX - left - width / 2;
  const z = clientY - top - height / 2;
  const distance = Math.hypot(x, z);
  const deadZone = width * .04;
  const travel = width * .20;
  const amount = Math.min(1, Math.max(0, (distance - deadZone) / travel));
  const scale = amount / Math.max(1, distance);
  position(x * scale, z * scale);
}

let fullscreenAttempted = false;
function enterFullscreen(event) {
  const viewport = document.documentElement;
  if (!event.isTrusted || fullscreenAttempted || !document.fullscreenEnabled || !viewport.requestFullscreen) return;
  fullscreenAttempted = true;
  // Touch grants activation on release. Waiting also keeps the first drag intact.
  viewport.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
document.addEventListener('pointerup', enterFullscreen);
document.addEventListener('click', enterFullscreen);

joystick.addEventListener('pointerdown', event => {
  if (!ready || pointer !== undefined) return;
  pointer = event.pointerId;
  joystick.setPointerCapture(pointer);
  slide(event.clientX, event.clientY);
});
joystick.addEventListener('pointermove', event => {
  if (ready && pointer === event.pointerId) slide(event.clientX, event.clientY);
});
for (const name of ['pointerup','pointercancel','lostpointercapture']) {
  joystick.addEventListener(name, event => {
    if (pointer === event.pointerId) reset();
  });
}
joystick.addEventListener('keydown', event => {
  if (!ready || !arrows.includes(event.key)) return;
  event.preventDefault();
  keys.add(event.key);
  steerWithKeys();
});
joystick.addEventListener('keyup', event => {
  if (keys.delete(event.key)) steerWithKeys();
});
joystick.addEventListener('blur', () => { if (pointer === undefined) reset(); });
window.addEventListener('blur', reset);
document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
setInterval(() => { if (ready && direction !== neutral) send(direction); }, 200);
drop.addEventListener('click', () => { reset(); send('drop'); });
replay.addEventListener('click', () => send('replay'));
connect();
