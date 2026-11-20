import * as THREE from 'three';
import { RoundedBoxGeometry } from '/vendor/RoundedBoxGeometry.js';
import { FIELD, GRIP_OFFSET, JAW_PROFILE } from './playfield.js';

const steel = (color, metalness = .88, roughness = .27) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

function mesh(parent, geometry, material, position) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  parent.add(item);
  return item;
}

function box(parent, material, size, position, bevel = 0) {
  const geometry = bevel ? new RoundedBoxGeometry(...size, 2, bevel) : new THREE.BoxGeometry(...size);
  return mesh(parent, geometry, material, position);
}

function cylinder(parent, material, radius, height, position, segments = 28) {
  return mesh(parent, new THREE.CylinderGeometry(radius, radius, height, segments), material, position);
}

function lamp(cabinet, x, z, chrome) {
  const glow = new THREE.MeshBasicMaterial({ color: 0xfffaf6, toneMapped: false });
  box(cabinet, chrome, [2.60, .12, 1.15], [x, 5.14, z], .047);
  box(cabinet, glow, [2.47, .018, 1.04], [x, 5.072, z]);
  for (let i = -8; i <= 8; i++) {
    box(cabinet, chrome, [.022, .021, 1.02], [x + i * .142, 5.061, z]);
  }
}

function chuteLabel(cabinet, x, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.fillStyle = '#242629';
  context.font = 'bold 50px ui-monospace, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('↓ SALIDA', 256, 48);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  mesh(cabinet, new THREE.PlaneGeometry(1.32, .246),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }), [x, -.26, z]);
}

export function makeCabinet(scene) {
  const cabinet = new THREE.Group();
  scene.add(cabinet);
  const { halfWidth, halfDepth, chuteBack, chuteWallHeight, chuteEdge, chuteX } = FIELD;
  const chrome = steel(0xd8d7d7, .97, .17);
  const frame = steel(0xaaa6a4, .77, .35);
  const rear = steel(0xc2bdbd, .10, .68);
  const tray = steel(0xa19b99, .79, .37);
  const dark = steel(0x29272a, .47, .53);
  const clear = new THREE.MeshPhysicalMaterial({
    color: 0xe3e6ef, metalness: .40, roughness: .11, side: THREE.DoubleSide,
    opacity: .17, transparent: true, depthWrite: false,
  });
  const clearEdge = new THREE.MeshPhysicalMaterial({
    color: 0xefedf5, metalness: .25, roughness: .16, opacity: .61, transparent: true, depthWrite: false,
  });

  box(cabinet, rear, [10.26, 5.37, .15], [0, 2.64, -halfDepth - .095], .03).receiveShadow = true;
  box(cabinet, frame, [10.39, .37, 2 * halfDepth + .17], [0, 5.38, 0], .08);
  for (const x of [-halfWidth, halfWidth]) {
    box(cabinet, frame, [.13, 5.23, 2 * halfDepth + .09], [x * 1.018, 2.61, 0], .027).receiveShadow = true;
    for (const z of [-halfDepth, halfDepth]) {
      cylinder(cabinet, chrome, .084, 5.22, [x, 2.64, z]);
      for (const y of [.14, 4.85, 5.13]) {
        box(cabinet, frame, [.24, .20, .21], [x, y, z], .029);
        const screw = cylinder(cabinet, chrome, .045, .039, [x, y, z + .108], 12);
        screw.rotation.x = Math.PI / 2;
      }
    }
    const guide = cylinder(cabinet, chrome, .057, 2 * halfDepth - .13, [x * .974, 4.96, 0]);
    guide.rotation.x = Math.PI / 2;
  }
  lamp(cabinet, -2.77, halfDepth * .39, chrome);
  lamp(cabinet, 2.77, halfDepth * .39, chrome);

  const rightWidth = halfWidth - chuteEdge;
  const leftWidth = halfWidth + chuteEdge;
  const rearDepth = chuteBack + halfDepth;
  const chuteDepth = halfDepth - chuteBack;
  const splitX = (-halfWidth + chuteEdge) / 2;
  const splitZ = (chuteBack + halfDepth) / 2;
  box(cabinet, tray, [rightWidth, .18, 2 * halfDepth], [(halfWidth + chuteEdge) / 2, -.09, 0], .022).receiveShadow = true;
  box(cabinet, tray, [leftWidth, .18, rearDepth], [splitX, -.09, (chuteBack - halfDepth) / 2], .017).receiveShadow = true;
  box(cabinet, dark, [leftWidth, .13, chuteDepth], [splitX, -1.19, splitZ], .02);
  box(cabinet, frame, [rightWidth, .45, .13], [(halfWidth + chuteEdge) / 2, -.24, halfDepth], .03);
  box(cabinet, frame, [leftWidth, .22, .12], [splitX, -.60, halfDepth], .019);
  for (const x of [-halfWidth, chuteEdge]) {
    box(cabinet, clear, [.047, chuteWallHeight, chuteDepth], [x, chuteWallHeight / 2, splitZ]);
    box(cabinet, clearEdge, [.057, .035, chuteDepth], [x, chuteWallHeight, splitZ], .008);
    for (const z of [chuteBack + .13, halfDepth - .12]) {
      const screw = cylinder(cabinet, chrome, .037, .068, [x, .15, z], 12);
      screw.rotation.z = Math.PI / 2;
    }
  }
  box(cabinet, clear, [leftWidth, chuteWallHeight, .046], [splitX, chuteWallHeight / 2, chuteBack]);
  box(cabinet, clearEdge, [leftWidth, .033, .055], [splitX, chuteWallHeight, chuteBack], .008);
  box(cabinet, clear, [leftWidth, .55, .046], [splitX, .25, halfDepth]);
  box(cabinet, clearEdge, [leftWidth, .036, .057], [splitX, .534, halfDepth], .008);
  chuteLabel(cabinet, chuteX, halfDepth + .071);
}

function jawBlade() {
  const curve = new THREE.CatmullRomCurve3(JAW_PROFILE.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const points = curve.getPoints(23);
  const edges = [-1, 1].map(sign => points.map((point, index) => {
    const tangent = points[Math.min(index + 1, points.length - 1)].clone().sub(points[Math.max(0, index - 1)]).normalize();
    const width = THREE.MathUtils.lerp(.072, .023, index / (points.length - 1)) * sign;
    return new THREE.Vector2(point.x - width * tangent.y, point.y + width * tangent.x);
  }));
  const shape = new THREE.Shape([...edges[0], ...edges[1].reverse()]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .13, bevelSize: .028, bevelThickness: .025, bevelSegments: 2 });
  geometry.translate(0, 0, -.065);
  return geometry;
}

export function makeClaw(scene) {
  const chrome = steel(0xd0cbca, .99, .19);
  const frame = steel(0x928d8b, .86, .27);
  const cableMaterial = steel(0x17171a, .24, .42);
  const gantry = new THREE.Group();
  const carriage = new THREE.Group();
  const head = new THREE.Group();
  scene.add(gantry, head);
  gantry.add(carriage);

  for (const z of [-.26, .26]) {
    const rail = cylinder(gantry, chrome, .058, 9.83, [0, 4.96, z]);
    rail.rotation.z = Math.PI / 2;
  }
  for (const x of [-4.83, 4.83]) {
    box(gantry, frame, [.22, .23, .73], [x, 4.96, 0], .042);
  }
  box(carriage, frame, [.87, .21, .68], [0, 4.96, 0], .061);
  box(carriage, chrome, [.61, .097, .55], [0, 4.845, 0], .025);
  const cable = cylinder(carriage, cableMaterial, .031, 1, [0, 0, 0], 12);
  const coilCenters = [];
  for (let i = 0; i <= 187; i++) {
    const t = i / 187;
    const angle = t * Math.PI * 24;
    const swing = Math.sin(t * Math.PI);
    const r = .087 * swing ** .3;
    coilCenters.push(new THREE.Vector3(-swing * .38 + Math.cos(angle) * r, t, Math.sin(angle) * r));
  }
  const coil = mesh(carriage, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilCenters), 200, .023, 7),
    cableMaterial, [-.14, 0, -.09]);

  cylinder(head, chrome, .21, .34, [0, .08, 0]);
  cylinder(head, frame, .238, .055, [0, -.10, 0]);
  cylinder(head, chrome, .122, .071, [0, .27, 0]);
  cylinder(head, cableMaterial, .075, .36, [0, -.22, 0]);
  cylinder(head, chrome, .168, .067, [0, -.38, 0]);

  const blade = jawBlade();
  const jaws = [];
  for (const yaw of [Math.PI * .60, Math.PI * 1.267, Math.PI * 1.933]) {
    const assembly = new THREE.Group();
    assembly.rotation.y = yaw;
    head.add(assembly);
    const finger = new THREE.Group();
    assembly.add(finger);
    const shell = mesh(finger, blade, chrome, [0, 0, 0]);
    shell.rotation.y = -Math.PI / 2;
    shell.castShadow = true;
    const pin = cylinder(finger, frame, .116, .23, [0, 0, 0], 16);
    pin.rotation.z = Math.PI / 2;
    const link = cylinder(assembly, chrome, .036, 1, [0, 0, 0], 12);
    jaws.push({ finger, link });
  }

  const up = new THREE.Vector3(0, 1, 0);
  const linkDirection = new THREE.Vector3();
  return function moveClaw({ x, y, z, open, pitch, roll, jawRadius }) {
    gantry.position.z = z;
    carriage.position.x = x;
    head.position.set(x, y, z);
    head.rotation.set(pitch, 0, roll);
    const top = 4.80;
    const bottom = y + .28;
    cable.position.y = (top + bottom) / 2;
    cable.scale.y = top - bottom;
    coil.position.y = bottom - .06;
    coil.scale.y = top - bottom + .07;
    const hingeY = -GRIP_OFFSET + jawRadius * 1.62;
    const hingeZ = jawRadius * .50;
    for (const { finger, link } of jaws) {
      finger.position.set(0, hingeY, hingeZ);
      finger.scale.setScalar(jawRadius);
      finger.rotation.x = -.78 * open;
      link.position.set(0, (hingeY - .094) / 2, (hingeZ + .186) / 2);
      linkDirection.set(0, hingeY + .094, hingeZ - .186);
      link.scale.y = linkDirection.length();
      link.quaternion.setFromUnitVectors(up, linkDirection.normalize());
    }
  };
}
