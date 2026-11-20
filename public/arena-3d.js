import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/RoomEnvironment.js';
import { ballMaterials } from './ball-materials.js';
import { makeCabinet, makeClaw } from './cabinet.js';

import { DEFAULT_JAW_RADIUS, FIELD, HOME } from './playfield.js';

const idleClaw = { ...HOME, open: .82, pitch: 0, roll: 0, jawRadius: DEFAULT_JAW_RADIUS };

export function createArena3D(canvas) {
  const context = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!context) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
  renderer.setClearColor(0x080b13, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.09;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const studio = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, .07).texture;
  scene.environmentIntensity = 1.02;
  studio.dispose();
  pmrem.dispose();

  const ambient = new THREE.HemisphereLight(0xf9f0ec, 0x888381, 1.19);
  const key = new THREE.DirectionalLight(0xfff7ef, 2.07);
  key.position.set(-3, 6.9, 3.9);
  key.target.position.set(0, 1.6, 0);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 4.5, bottom: -4.5, near: .5, far: 17 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.normalBias = .027;
  key.shadow.radius = 2;
  const fill = new THREE.DirectionalLight(0xe2e6ff, 1.12);
  fill.position.set(5, 3, 6);
  scene.add(ambient, key, key.target, fill);

  makeCabinet(scene);
  const moveClaw = makeClaw(scene);
  const geometry = new THREE.SphereGeometry(1, 36, 24);
  const materials = ballMaterials(renderer);
  const objects = new Map();
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 48);
  camera.position.set(0, 4.03, FIELD.halfDepth + 7.26);
  camera.lookAt(0, 2.69, -.20);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.24, .276, 48),
    new THREE.MeshBasicMaterial({ color: 0xf4ff8b, transparent: true, opacity: .50, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  let width = 0;
  let height = 0;
  let dpr = 0;

  const priorRotation = new THREE.Quaternion();
  const currentRotation = new THREE.Quaternion();

  function syncBalls(balls) {
    const visibleIds = new Set();
    for (const ball of balls) {
      visibleIds.add(ball.id);
      let mesh = objects.get(ball.id);
      if (!mesh) {
        mesh = new THREE.Mesh(geometry, materials[ball.texture]);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.scale.setScalar(ball.radius);
        objects.set(ball.id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(ball.x, ball.y, ball.z);
      currentRotation.fromArray(ball.q);
      if (ball.priorQ) {
        mesh.quaternion.slerpQuaternions(priorRotation.fromArray(ball.priorQ), currentRotation, ball.fraction);
      } else mesh.quaternion.copy(currentRotation);
    }
    for (const [id, mesh] of objects) {
      if (!visibleIds.has(id)) {
        scene.remove(mesh);
        objects.delete(id);
      }
    }
  }

  return function render(state) {
    const newWidth = canvas.clientWidth;
    const newHeight = canvas.clientHeight;
    const newDpr = Math.min(devicePixelRatio || 1, 1.65);
    if (!newWidth || !newHeight || context.isContextLost()) return;
    if (width !== newWidth || height !== newHeight || dpr !== newDpr) {
      width = newWidth;
      height = newHeight;
      dpr = newDpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // On narrow displays fit the cabinet without changing the camera angle.
      camera.zoom = Math.min(1.09, camera.aspect / 1.49);
      camera.updateProjectionMatrix();
    }
    const balls = state?.balls ?? [];
    const claw = state?.claw ?? idleClaw;
    syncBalls(balls);
    moveClaw(claw);
    ring.visible = state?.stage === 'ready';
    if (ring.visible) {
      const nearby = balls.filter(ball => Math.hypot(ball.x - claw.x, ball.z - claw.z) < ball.radius + .16);
      ring.position.set(claw.x, Math.max(.014, ...nearby.map(ball => ball.y + ball.radius + .045)), claw.z);
    }
    renderer.render(scene, camera);
  };
}
