import { World, Body, Box, Sphere, Vec3, Quaternion, SAPBroadphase, Material, ContactMaterial } from 'cannon-es';
import { DEFAULT_JAW_RADIUS, FIELD, GRIP_OFFSET, HOME } from '../public/playfield.js';
import { demoPrizeCatalog } from './prizes.js';

const STEP = 1 / 60;
const BALL_COUNT = 102;
const INTRO_BATCH = 3;
const INTRO_INTERVAL = 3;
const SETTLE_TIME = 120;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createGame({ sensitivity = .65, catalog = demoPrizeCatalog, random = Math.random } = {}) {
  const world = new World({ gravity: new Vec3(0, -10.3, 0), allowSleep: true });
  world.broadphase = new SAPBroadphase(world);
  world.solver.iterations = 10;
  const rubber = new Material('ball');
  const cabinet = new Material('cabinet');
  world.addContactMaterial(new ContactMaterial(rubber, rubber, { restitution: .52, friction: .29 }));
  world.addContactMaterial(new ContactMaterial(rubber, cabinet, { restitution: .41, friction: .39 }));

  function wall(x, y, z, width, height, depth) {
    const body = new Body({
      mass: 0, material: cabinet, position: new Vec3(x, y, z),
      shape: new Box(new Vec3(width / 2, height / 2, depth / 2)),
    });
    world.addBody(body);
  }

  const { halfWidth, halfDepth, chuteEdge, chuteBack, chuteWallHeight, chuteX, chuteZ } = FIELD;
  wall(halfWidth + .10, 1.9, 0, .20, 5.6, 2 * halfDepth + .40);
  wall(-halfWidth - .10, 1.9, 0, .20, 5.6, 2 * halfDepth + .40);
  wall(0, 1.9, halfDepth + .10, 10.2, 5.6, .20);
  wall(0, 1.9, -halfDepth - .10, 10.2, 5.6, .20);
  wall((halfWidth + chuteEdge) / 2, -.09, 0, halfWidth - chuteEdge, .18, 2 * halfDepth);
  wall((-halfWidth + chuteEdge) / 2, -.09, (-halfDepth + chuteBack) / 2,
    halfWidth + chuteEdge, .18, halfDepth + chuteBack);
  const chuteFloor = -1.22;
  const chuteWallCenter = (chuteWallHeight + chuteFloor) / 2;
  const chuteWallSpan = chuteWallHeight - chuteFloor;
  wall(chuteEdge + .02, chuteWallCenter, (halfDepth + chuteBack) / 2, .15, chuteWallSpan, halfDepth - chuteBack);
  wall((-halfWidth + chuteEdge) / 2, chuteWallCenter, chuteBack - .02, halfWidth + chuteEdge, chuteWallSpan, .15);

  const balls = [];
  let nextId = 0;
  function addBall(x, y, z, radius, texture) {
    const body = new Body({
      mass: radius ** 3 * 13, material: rubber, shape: new Sphere(radius),
      position: new Vec3(x, y, z), linearDamping: .18, angularDamping: .46,
      sleepSpeedLimit: .12, sleepTimeLimit: .55,
    });
    body.quaternion.setFromEuler(random() * 5, random() * 5, random() * 5);
    const ball = { id: nextId++, body, radius, texture, prize: random() < .78 ? catalog.draw(random) : null };
    balls.push(ball);
    world.addBody(body);
  }

  const spawnPoints = [];
  const rowZ = halfDepth - .44;
  for (const z of [-rowZ, 0, rowZ]) {
    for (let column = 0; column < 12; column++) {
      const x = -4.48 + column * .82;
      if (x < chuteEdge + .50 && z > chuteBack - .50) continue;
      spawnPoints.push({ x, z });
    }
  }

  function dropBall() {
    const { x, z } = spawnPoints[(nextId * 13) % spawnPoints.length];
    addBall(x + (random() - .5) * .12, 3.55 + random() * .87,
      z + (random() - .5) * .06, .24 + random() * .19, nextId % 12);
  }

  const claw = { ...HOME, open: .82, pitch: 0, roll: 0, jawRadius: DEFAULT_JAW_RADIUS };
  const input = { x: 0, z: 0 };
  const velocity = { x: 0, z: 0 };
  const offset = { x: 0, z: 0 };
  const offsetVelocity = { x: 0, z: 0 };
  const rotation = new Quaternion();
  const localSeat = new Vec3();
  const seat = new Vec3();
  const releaseVelocity = new Vec3();
  let result;
  let candidate;
  let grip;
  let deliveredBall;
  let stage = 'loading';
  let lastFillTick = 0;
  let clock = 0;
  let motion;
  let fromOpen = claw.open;
  let fromJaw = claw.jawRadius;
  let lastX = claw.x;
  let lastZ = claw.z;
  let lastVX = 0;
  let lastVZ = 0;

  function enter(next) {
    stage = next;
    clock = 0;
    fromOpen = claw.open;
    fromJaw = claw.jawRadius;
  }

  function travel(next, target, duration) {
    motion = { from: { ...claw }, target, duration };
    enter(next);
  }

  function follow() {
    const t = ease(Math.min(1, clock / motion.duration));
    for (const axis of ['x', 'y', 'z']) {
      const { from, target } = motion;
      claw[axis] = mix(from[axis], target[axis] ?? from[axis], t);
    }
    return clock >= motion.duration;
  }

  function servo(axis, bound, speed) {
    const drive = input[axis];
    const braking = 11.5;
    const excess = Math.max(0, bound - Math.abs(claw[axis]) - .015);
    const approaching = drive * claw[axis] > 0;
    const target = approaching ? Math.min(speed, Math.sqrt(2 * braking * excess)) * drive : speed * drive;
    velocity[axis] += clamp(target - velocity[axis], -braking * STEP, braking * STEP);
    claw[axis] = clamp(claw[axis] + velocity[axis] * STEP, -bound, bound);
    if (Math.abs(claw[axis]) >= bound) velocity[axis] = 0;
  }

  function selectBall() {
    const targets = balls
      .filter(({ body, radius }) => body.position.y >= radius - .04 && !inChute(body.position)
        && near(claw, body.position) <= radius + .22)
      .map(ball => ({ ball, score: ball.body.position.y + ball.radius - near(claw, ball.body.position) * 1.65 }));
    targets.sort((a, b) => b.score - a.score);
    return targets[0]?.ball;
  }

  function inChute(position) {
    return position.x < chuteEdge && position.z > chuteBack;
  }

  function beginDescent() {
    candidate = selectBall();
    const floorClearance = GRIP_OFFSET + .28;
    const y = candidate ? Math.max(floorClearance, candidate.body.position.y + GRIP_OFFSET) : floorClearance;
    travel('descending', { y }, 53 + Math.round(Math.abs(HOME.y - y) * 6));
  }

  function tryGrip() {
    if (!candidate) return;
    const { body, radius } = candidate;
    const alignment = near(claw, body.position);
    const reach = radius * (.52 + sensitivity * .72) + .06;
    const chance = .30 + sensitivity * .70 + (1 - alignment / reach) * .19 - radius * .18;
    if (alignment > reach || Math.abs(body.position.y + GRIP_OFFSET - claw.y) > .24 || random() > chance) return;
    body.wakeUp();
    body.type = Body.KINEMATIC;
    body.updateMassProperties();
    body.velocity.setZero();
    body.angularVelocity.setZero();
    grip = { ball: candidate, from: body.position.clone(), clock: 0 };
    offset.x = offset.z = offsetVelocity.x = offsetVelocity.z = 0;
  }

  function release() {
    if (!grip) return;
    const { ball } = grip;
    const { body } = ball;
    body.type = Body.DYNAMIC;
    body.updateMassProperties();
    body.wakeUp();
    body.velocity.copy(releaseVelocity);
    deliveredBall = ball;
    grip = undefined;
  }

  function updateInertia() {
    const vx = (claw.x - lastX) / STEP;
    const vz = (claw.z - lastZ) / STEP;
    const ax = (vx - lastVX) / STEP;
    const az = (vz - lastVZ) / STEP;
    claw.roll = mix(claw.roll, clamp(-ax * .007, -.051, .051), .14);
    claw.pitch = mix(claw.pitch, clamp(az * .007, -.051, .051), .14);
    lastX = claw.x;
    lastZ = claw.z;
    lastVX = vx;
    lastVZ = vz;
    if (!grip) return;
    for (const [axis, acceleration] of [['x', ax], ['z', az]]) {
      const target = clamp(-acceleration * .0017, -.018, .018);
      offsetVelocity[axis] += ((target - offset[axis]) * 104 - offsetVelocity[axis] * 19) * STEP;
      offset[axis] += offsetVelocity[axis] * STEP;
    }
    localSeat.set(offset.x, -GRIP_OFFSET, offset.z);
    rotation.setFromEuler(claw.pitch, 0, claw.roll);
    rotation.vmult(localSeat, seat);
    seat.x += claw.x;
    seat.y += claw.y;
    seat.z += claw.z;
    const { body, radius } = grip.ball;
    const t = ease(Math.min(1, ++grip.clock / 13));
    const previous = body.position;
    const nextX = mix(grip.from.x, seat.x, t);
    const nextY = Math.max(radius, mix(grip.from.y, seat.y, t));
    const nextZ = mix(grip.from.z, seat.z, t);
    releaseVelocity.set((nextX - previous.x) / STEP, (nextY - previous.y) / STEP, (nextZ - previous.z) / STEP);
    body.position.set(nextX, nextY, nextZ);
    body.aabbNeedsUpdate = true;
  }

  function tick() {
    clock++;
    switch (stage) {
      case 'loading':
        if (balls.length < BALL_COUNT && clock % INTRO_INTERVAL === 1) {
          for (let count = 0; count < INTRO_BATCH && balls.length < BALL_COUNT; count++) dropBall();
          lastFillTick = clock;
        }
        break;
      case 'ready':
      case 'braking':
        servo('x', 4.52, 3.85);
        servo('z', halfDepth - .45, 2.25);
        if (stage === 'braking' && !velocity.x && !velocity.z) beginDescent();
        break;
      case 'descending':
        claw.open = mix(fromOpen, 1, ease(Math.min(1, clock / 22)));
        claw.jawRadius = mix(fromJaw, candidate?.radius ?? DEFAULT_JAW_RADIUS, ease(Math.min(1, clock / 28)));
        if (follow()) enter('closing');
        break;
      case 'closing':
        if (clock === 7) tryGrip();
        claw.open = mix(fromOpen, grip ? .04 : .12, ease(Math.min(1, clock / 24)));
        if (clock >= 26) travel('lifting', { y: HOME.y }, 65);
        break;
      case 'lifting':
        if (follow()) {
          const target = grip ? { x: chuteX, z: chuteZ } : HOME;
          travel('returning', target, Math.max(28, Math.round(near(claw, target) * 15)));
        }
        break;
      case 'returning':
        if (follow()) enter(grip ? 'releasing' : 'missed');
        break;
      case 'releasing':
        claw.open = mix(fromOpen, 1, ease(Math.min(1, clock / 31)));
        if (clock > 156) enter('missed');
        break;
      case 'resetting':
        claw.open = mix(fromOpen, .82, ease(Math.min(1, clock / 26)));
        claw.jawRadius = mix(fromJaw, DEFAULT_JAW_RADIUS, ease(Math.min(1, clock / 26)));
        if (follow()) enter('ready');
        break;
    }

    updateInertia();
    if (stage === 'releasing' && clock === 18) release();
    world.step(STEP);

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (ball === grip?.ball || ball.body.position.y > -1.08) continue;
      world.removeBody(ball.body);
      balls.splice(i, 1);
      if (ball === deliveredBall && inChute(ball.body.position) && stage === 'releasing') {
        result = { prize: ball.prize, texture: ball.texture };
        enter('won');
      }
    }
    if (stage === 'loading' && balls.length === BALL_COUNT && clock - lastFillTick >= SETTLE_TIME) {
      enter('ready');
    }
    if (stage === 'ready' && balls.length < BALL_COUNT && clock > 65 && clock % 30 === 0) dropBall();
  }

  return {
    tick,
    drop() {
      if (stage !== 'ready') return;
      input.x = input.z = 0;
      enter('braking');
    },
    move(x, z = 0) {
      const scale = Math.max(1, Math.hypot(x, z));
      input.x = stage === 'ready' ? x / scale : 0;
      input.z = stage === 'ready' ? z / scale : 0;
    },
    replay() {
      if (stage !== 'won' && stage !== 'missed') return;
      result = candidate = deliveredBall = undefined;
      travel('resetting', HOME, 51);
    },
    snapshot() {
      return {
        stage, claw: { ...claw }, gripId: grip?.ball.id, result, sensitivity,
        balls: balls.map(({ body, id, radius, texture }) => ({
          id, x: body.position.x, y: body.position.y, z: body.position.z,
          q: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w], radius, texture,
        })),
      };
    },
  };
}
