import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../lib/game.js';
import { Quaternion, Vec3 } from 'cannon-es';
import { FIELD, GRIP_OFFSET, HOME } from '../public/playfield.js';

function seeded(seed) {
  return () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
}

const demo = { title: 'Premio de prueba' };
const catalog = { draw: () => demo };
const run = (game, frames) => { for (let i = 0; i < frames; i++) game.tick(); };

function finishLoading(game) {
  for (let i = 0; i < 660 && game.snapshot().stage === 'loading'; i++) game.tick();
  assert.equal(game.snapshot().stage, 'ready');
}

test('al iniciar caen 102 pelotas dentro del gabinete de profundidad reducida', () => {
  const game = createGame({ random: seeded(5), catalog });
  assert.equal(FIELD.halfDepth * 2, 2.46);
  assert.equal(game.snapshot().stage, 'loading');
  assert.equal(game.snapshot().balls.length, 0);
  game.tick();
  const first = game.snapshot().balls[0];
  assert(first.y > 3);
  run(game, 28);
  const falling = game.snapshot();
  assert(falling.balls.length > 3 && falling.balls.length < 102);
  assert(falling.balls.find(ball => ball.id === first.id).y < first.y);
  finishLoading(game);
  const ready = game.snapshot();
  assert.equal(ready.balls.length, 102);
  assert(ready.balls.every(ball => Math.abs(ball.z) + ball.radius <= FIELD.halfDepth + .04));
});

test('la sensibilidad cambia el resultado de un mismo intento', () => {
  const easy = createGame({ sensitivity: 1, random: seeded(3), catalog });
  const hard = createGame({ sensitivity: 0, random: seeded(3), catalog });
  for (const game of [easy, hard]) {
    finishLoading(game);
    game.drop();
    run(game, 550);
  }
  assert.equal(easy.snapshot().stage, 'won');
  assert.equal(hard.snapshot().stage, 'missed');
});

test('el premio se revela después de que la esfera cae por la salida y se limpia al repetir', () => {
  const game = createGame({ sensitivity: 1, random: seeded(3), catalog });
  finishLoading(game);
  game.drop();
  let visibleBeforeWin;
  for (let i = 0; i < 550 && game.snapshot().stage !== 'won'; i++) {
    const frame = game.snapshot();
    assert.equal(frame.result, undefined);
    visibleBeforeWin = frame.balls.length;
    game.tick();
  }
  const won = game.snapshot();
  assert.equal(won.stage, 'won');
  assert.deepEqual(won.result.prize, demo);
  assert.equal(won.balls.length, visibleBeforeWin - 1);
  assert.equal(won.claw.x, FIELD.chuteX);
  assert.equal(won.claw.z, FIELD.chuteZ);
  game.replay();
  assert.equal(game.snapshot().stage, 'resetting');
  run(game, 55);
  const replay = game.snapshot();
  assert.equal(replay.stage, 'ready');
  assert.equal(replay.result, undefined);
  assert.equal(replay.claw.x, HOME.x);
  assert.equal(replay.claw.z, HOME.z);
});


test('se mueve en diagonal y frena gradualmente antes de descender', () => {
  const game = createGame({ random: seeded(5), catalog });
  finishLoading(game);
  game.move(-1, 1);
  run(game, 22);
  const moving = game.snapshot().claw;
  assert(moving.x < -.45 && moving.z > .45);
  game.drop();
  game.tick();
  const braking = game.snapshot();
  assert.equal(braking.stage, 'braking');
  assert(braking.claw.x < moving.x && braking.claw.z > moving.z);
  run(game, 24);
  const stopped = game.snapshot();
  assert.equal(stopped.stage, 'descending');
  run(game, 12);
  const lowered = game.snapshot();
  assert.equal(lowered.claw.x, stopped.claw.x);
  assert.equal(lowered.claw.z, stopped.claw.z);
  assert(lowered.claw.y < stopped.claw.y);
});

test('durante la subida y el traslado la esfera se mantiene dentro de la pinza', () => {
  const game = createGame({ sensitivity: 1, random: seeded(5), catalog });
  const stages = new Set();
  let heldId;
  finishLoading(game);
  game.drop();
  for (let i = 0; i < 450; i++) {
    game.tick();
    const frame = game.snapshot();
    if (!['lifting', 'returning'].includes(frame.stage)) continue;
    stages.add(frame.stage);
    heldId ??= frame.gripId;
    assert.equal(frame.gripId, heldId);
    const claw = frame.claw;
    const ball = frame.balls.find(item => item.id === heldId);
    const position = new Vec3(ball.x - claw.x, ball.y - claw.y, ball.z - claw.z);
    const rotation = new Quaternion().setFromEuler(claw.pitch, 0, claw.roll);
    const local = rotation.conjugate().vmult(position);
    assert(local.distanceTo(new Vec3(0, -GRIP_OFFSET, 0)) < .031);
    assert.equal(claw.jawRadius, ball.radius);
    assert.equal(frame.result, undefined);
  }
  assert.deepEqual([...stages], ['lifting', 'returning']);
  assert.equal(game.snapshot().stage, 'won');
});
