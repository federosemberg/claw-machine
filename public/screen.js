import { gameServer } from './deployment.js';
import { ballPreview } from './ball-preview.js';

const get = id => document.getElementById(id);
const canvas = get('arena');
let render;
async function loadArena() {
  try {
    const { createArena3D } = await import('./arena-3d.js');
    render = createArena3D(canvas);
  } catch (error) {
    console.warn('No se pudo iniciar la vista 3D.', error);
  }
  if (render) {
    canvas.dataset.renderer = 'three';
    return;
  }
  // A canvas that already acquired a WebGL context cannot switch to 2D.
  const fallback = canvas.cloneNode();
  canvas.replaceWith(fallback);
  const { createArena } = await import('./arena.js');
  render = createArena(fallback);
  fallback.dataset.renderer = '2d';
  get('machine-status').parentElement.title = 'Vista desde arriba por compatibilidad con el navegador';
}
const status = get('connection');
const fullscreen = get('fullscreen');
const machine = get('machine');
const result = get('result');
const pairing = get('pair-overlay');
const controlLink = get('open-control');
const keys = new Set();
let socket;
let session;
let state;
let previousState;
let arrivedAt = 0;
let reconnectTime = 600;
let paired = false;
let keyboardUntil = 0;
const neutral = 'move:0,0';
const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
let direction = neutral;
const storageKey = `grab-lab-screen:${gameServer}`;

const send = command => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(command);
};

function connection(text, live = false) {
  status.replaceChildren(document.createElement('i'), document.createTextNode(` ${text}`));
  status.classList.toggle('live', live);
}

const labels = {
  loading: 'CARGANDO PELOTAS', ready: 'LISTA PARA JUGAR', braking: 'DETENIENDO', resetting: 'PREPARANDO', descending: 'BAJANDO', closing: 'CERRANDO', lifting: 'LEVANTANDO',
  returning: 'REGRESANDO', releasing: 'ENTREGANDO', won: 'ESFERA CAPTURADA', missed: 'FIN DEL TURNO',
};

function showPairing() {
  const waiting = Boolean(session && state?.stage === 'ready' && !paired
    && direction === neutral && performance.now() >= keyboardUntil);
  if (pairing.hidden === !waiting) return;
  if (!waiting && pairing.contains(document.activeElement)) get('arena').focus({ preventScroll: true });
  pairing.hidden = !waiting;
  document.body.classList.toggle('waiting-for-player', waiting);
}

function update(next) {
  const stageChanged = state?.stage !== next.stage;
  const pairingChanged = state?.paired !== next.paired;
  previousState = state;
  state = next;
  arrivedAt = performance.now();
  paired = next.paired;
  if (pairingChanged) {
    connection(paired ? 'Celular conectado' : 'Máquina en línea', true);
    if (paired) stop();
  }
  showPairing();
  if (!stageChanged) return;
  get('machine-status').textContent = labels[next.stage];
  if (next.stage === 'ready') {
    keyboardUntil = 0;
    stop();
    showPairing();
  }
  if (next.stage !== 'won' && next.stage !== 'missed') {
    if (!result.hidden) {
      const restoreFocus = result.contains(document.activeElement);
      result.hidden = true;
      if (restoreFocus) get('arena').focus();
    }
    return;
  }
  stop();
  const { prize, texture } = next.result ?? {};
  const ball = get('result-ball');
  ball.hidden = texture === undefined;
  if (!ball.hidden) ball.src = ballPreview(texture);
  get('result-label').textContent = prize?.label ?? (next.stage === 'won' ? 'CAPTURA' : 'FIN DEL TURNO');
  get('result-title').textContent = prize?.title ?? (next.stage === 'won' ? '¡Atrapaste una esfera!' : '¡Casi!');
  get('result-description').textContent = prize?.description ?? (next.stage === 'won'
    ? 'Esta esfera venía sin premio. Podés volver a intentar.'
    : 'La garra no entregó una esfera. Probá apuntar al centro de una de las pelotas.');
  result.hidden = false;
  if (!paired) get('replay').focus();
}

function showSession(data) {
  session = data;
  get('qr').src = data.qr;
  controlLink.href = data.controlPath;
}

async function initialize() {
  try {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
    if (!saved) {
      const response = await fetch(new URL('/api/session', gameServer), { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo abrir la sesión.');
      saved = await response.json();
      try { sessionStorage.setItem(storageKey, JSON.stringify(saved)); } catch {}
    }
    showSession(saved);
    connect();
  } catch {
    connection('Reconectando la máquina…');
    setTimeout(initialize, 2000);
  }
}

function connect() {
  const endpoint = new URL('/live', gameServer);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  endpoint.search = new URLSearchParams({ id: session.id, key: session.screenKey });
  socket = new WebSocket(endpoint);
  socket.addEventListener('message', event => {
    reconnectTime = 600;
    update(JSON.parse(event.data));
  });
  socket.addEventListener('close', event => {
    state = previousState = undefined;
    paired = false;
    showPairing();
    result.hidden = true;
    stop();
    connection('Reconectando la máquina…');
    get('machine-status').textContent = 'RECONECTANDO';
    if (event.code === 4004 || event.code === 4009) {
      try { sessionStorage.removeItem(storageKey); } catch {}
      session = undefined;
      initialize();
      return;
    }
    setTimeout(connect, reconnectTime);
    reconnectTime = Math.min(5000, reconnectTime * 2);
  });
}

function draw(now) {
  if (render && state && previousState) {
    const fraction = Math.min(1, (now - arrivedAt) / 33.33);
    const lerp = (a,b) => a + (b - a) * fraction;
    const prior = new Map(previousState.balls.map(ball => [ball.id, ball]));
    const balls = state.balls.map(ball => {
      const before = prior.get(ball.id);
      return before ? {
        ...ball, x: lerp(before.x, ball.x), y: lerp(before.y, ball.y), z: lerp(before.z, ball.z),
        priorQ: before.q, fraction,
      } : ball;
    });
    const claw = Object.fromEntries(Object.entries(state.claw).map(([key, value]) => [key, lerp(previousState.claw[key], value)]));
    render({ ...state, balls, claw });
  } else render?.(state);
  requestAnimationFrame(draw);
}

function stop() {
  keys.clear();
  if (direction !== neutral) send(neutral);
  direction = neutral;
}

function move() {
  const x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  const z = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
  direction = `move:${x},${z}`;
  keyboardUntil = performance.now() + 8000;
  showPairing();
  send(direction);
}

window.addEventListener('keydown', event => {
  if (paired || state?.stage !== 'ready') return;
  if (arrows.includes(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    move();
  } else if (event.code === 'Space' && !['BUTTON','A'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    if (!event.repeat) {
      keyboardUntil = performance.now() + 8000;
      showPairing();
      send('drop');
    }
  }
});
window.addEventListener('keyup', event => {
  if (keys.delete(event.code)) move();
});
window.addEventListener('blur', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
setInterval(() => { if (direction !== neutral) send(direction); }, 200);
get('replay').addEventListener('click', () => send('replay'));

function updateFullscreen() {
  const expanded = document.fullscreenElement === machine || document.body.classList.contains('machine-expanded');
  const label = expanded ? 'Salir de pantalla completa' : 'Pantalla completa';
  fullscreen.title = label;
  fullscreen.setAttribute('aria-label', label);
  fullscreen.setAttribute('aria-pressed', String(expanded));
  if (expanded) get('arena').focus({ preventScroll: true });
  else fullscreen.focus({ preventScroll: true });
}

fullscreen.addEventListener('click', async () => {
  if (document.fullscreenElement === machine) {
    await document.exitFullscreen();
    return;
  }
  if (document.body.classList.contains('machine-expanded')) {
    document.body.classList.remove('machine-expanded');
    updateFullscreen();
    return;
  }
  if (document.fullscreenEnabled && machine.requestFullscreen) {
    try {
      await machine.requestFullscreen();
      return;
    } catch {
      // Embedded browsers can block native fullscreen even when the API is present.
    }
  }
  document.body.classList.add('machine-expanded');
  updateFullscreen();
});
document.addEventListener('fullscreenchange', updateFullscreen);
window.addEventListener('keydown', event => {
  if (event.code !== 'Escape' || !document.body.classList.contains('machine-expanded')) return;
  document.body.classList.remove('machine-expanded');
  updateFullscreen();
});

loadArena().finally(initialize);
requestAnimationFrame(draw);
