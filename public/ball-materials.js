import * as THREE from 'three';

const TAU = Math.PI * 2;
const mix = THREE.MathUtils.lerp;
const profiles = [
  { base: [240, 34, 48], accent: [131, 6, 22], roughness: .43, bump: .045 },
  { base: [186, 222, 32], accent: [245, 249, 203], roughness: .91, bump: .022 },
  { base: [14, 50, 164], accent: [31, 169, 255], roughness: .21, clearcoat: .95 },
  { base: [249, 114, 36], accent: [42, 21, 22], roughness: .71, bump: .028 },
  { base: [220, 30, 135], accent: [255, 211, 249], roughness: .32, metalness: .28, clearcoat: .58 },
  { base: [115, 42, 205], accent: [191, 95, 247], roughness: .25, clearcoat: .85 },
  { base: [10, 156, 111], accent: [29, 209, 149], roughness: .20, clearcoat: .92 },
  { base: [244, 180, 15], accent: [255, 222, 81], roughness: .23, clearcoat: .78 },
  { base: [222, 220, 218], accent: [150, 146, 145], roughness: .48, bump: .042 },
  { base: [221, 220, 214], accent: [72, 75, 87], roughness: .22, metalness: .98, bump: .008 },
  { base: [101, 86, 177], accent: [249, 203, 252], roughness: .21, metalness: .25, clearcoat: 1 },
  { base: [243, 240, 236], accent: [28, 28, 31], roughness: .51, bump: .019 },
];

function finish(index, u, v, grain) {
  const longitude = u * TAU;
  const latitude = v * Math.PI;
  switch (index) {
    case 0:
    case 8: {
      const row = Math.round(v * 25);
      const column = u * 48 + (row % 2) * .5;
      const radius = Math.hypot(column - Math.round(column), v * 25 - row);
      const dimple = 1 - THREE.MathUtils.smoothstep(radius, .18, .40);
      return [dimple * .84, grain * .13 - dimple * .70];
    }
    case 1: {
      const distance = Math.abs(v - .5 - .29 * Math.cos(longitude));
      const seam = 1 - THREE.MathUtils.smoothstep(distance, .008, .017);
      return [seam, grain * (1 - seam) - seam * .45];
    }
    case 2: {
      const ripple = Math.sin(5 * longitude + 16 * v + 5 * Math.sin(longitude * 2 - v * 13));
      const vein = Math.sin(11 * longitude - 19 * v + 7 * Math.cos(longitude + v * 9));
      return [(.5 + .5 * ripple) ** 4 * .85 + (.5 + .5 * vein) ** 13 * .22, grain * .12];
    }
    case 3: {
      const x = Math.cos(longitude) * Math.sin(latitude);
      const y = Math.cos(latitude);
      const z = Math.sin(longitude) * Math.sin(latitude);
      const distance = Math.min(Math.abs(x), Math.abs(z), Math.abs(y + .61 * (x * x - z * z)));
      const seam = 1 - THREE.MathUtils.smoothstep(distance, .017, .035);
      return [seam, grain * (1 - seam) - seam * .65];
    }
    case 4:
    case 10: {
      const tileX = Math.floor(u * 183);
      const tileY = Math.floor(v * 103);
      const sparkle = Math.sin(tileX * 111.3 + tileY * 57.27) * 56293.23;
      const glint = sparkle - Math.floor(sparkle);
      return [glint > .986 ? 1 : glint > .93 ? .70 : grain * .14, grain];
    }
    case 9: {
      const x = u * 40;
      const y = v * 21;
      const grout = Math.min(x - Math.floor(x), y - Math.floor(y));
      const variation = Math.sin(Math.floor(x) * 7 + Math.floor(y) * 80.3);
      return [grout < .045 ? .79 : .16 + variation * .15, grout < .045 ? -.8 : variation * .17];
    }
    case 11: {
      const cell = u * 5 + (v > .50 ? .50 : 0);
      const center = cell - Math.floor(cell) - .50;
      const distance = Math.abs(v - (v > .50 ? .70 : .30)) * 5;
      const patch = Math.abs(center) + distance * .82;
      const black = 1 - THREE.MathUtils.smoothstep(patch, .26, .29);
      return [black, grain * .36 - black * .24];
    }
    default:
      return [grain * .13 + Math.sin(longitude * 3 + latitude * 7) * .07, 0];
  }
}

export function ballMaterials(renderer) {
  const width = 512;
  const height = 256;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return profiles.map(({ base, accent, bump, ...surface }, index) => {
    const color = new Uint8Array(width * height * 4);
    const relief = bump ? new Uint8Array(color.length) : null;
    let seed = 94381;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const grain = seed / 4294967296;
        const [pattern, depth] = finish(index, x / width, y / height, grain);
        const offset = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          color[offset + channel] = Math.min(255, mix(base[channel], accent[channel], pattern) * (.87 + grain * .19));
          if (relief) relief[offset + channel] = Math.max(0, Math.min(255, 115 + 100 * depth));
        }
        color[offset + 3] = 255;
        if (relief) relief[offset + 3] = 255;
      }
    }
    function texture(data, colorSpace) {
      const map = new THREE.DataTexture(data, width, height);
      map.colorSpace = colorSpace;
      map.wrapS = THREE.RepeatWrapping;
      map.magFilter = THREE.LinearFilter;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true;
      map.anisotropy = anisotropy;
      map.needsUpdate = true;
      return map;
    }
    return new THREE.MeshPhysicalMaterial({
      ...surface,
      map: texture(color, THREE.SRGBColorSpace),
      bumpMap: relief ? texture(relief, THREE.NoColorSpace) : null,
      bumpScale: bump ?? 0,
    });
  });
}
