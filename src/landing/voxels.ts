// Shared voxel language for the 67 scenes: palette, tree builders, the
// balance's stand, pile layout, glass and the ambient sway shader.
import {
  BackSide, BoxGeometry, Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, PlaneGeometry, PMREMGenerator, Scene, WebGLRenderer,
} from 'three';
import type { Texture } from 'three';

export const GROUND = '#0B0E0D';
export const V = 0.1; // one voxel
export const NIGHT = {
  grass: ['#0F3327', '#113629', '#0E3025', '#123A2C'],
  step: '#0E2F24',
  pine: ['#16483A', '#195040', '#1B5443'],
  round: ['#1A5340', '#1D5A46'],
  trunk: '#2B211B',
  stand: '#1A211F',
  pan: '#33403C',
  yes: '#1FA571',
  no: '#3A63E8',
  yesCore: '#3BE09A',
  noCore: '#5C86FF',
};

// Deterministic noise: the same forest on every visit.
export function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function smooth(x: number, z: number) {
  return Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.09 - 0.4) + Math.sin((x + z) * 0.045) * 0.8 + Math.cos(x * 0.13 - z * 0.05) * 0.35;
}

export interface Voxel { x: number; y: number; z: number; color: string; sx?: number; sy?: number; sz?: number }

export function pine(cx: number, cz: number, base: number, height: number): Voxel[] {
  const out: Voxel[] = [{ x: cx, y: base + 1, z: cz, color: NIGHT.trunk }, { x: cx, y: base + 2, z: cz, color: NIGHT.trunk }];
  const maxR = Math.max(2, Math.round(height / 7));
  for (let y = 3; y < height; y++) {
    const t = (y - 3) / (height - 3);
    const r = maxR * (1 - t) ** 0.9;
    const ri = Math.ceil(r);
    for (let x = -ri; x <= ri; x++) for (let z = -ri; z <= ri; z++) {
      if (x * x + z * z > r * r + 0.6) continue;
      out.push({ x: cx + x, y: base + y, z: cz + z, color: NIGHT.pine[(x + y + z + 9) % 3] });
    }
  }
  return out;
}

export function roundTree(cx: number, cz: number, base: number, r: number): Voxel[] {
  const out: Voxel[] = [];
  for (let y = 1; y <= 3; y++) out.push({ x: cx, y: base + y, z: cz, color: NIGHT.trunk });
  const cy = base + 3 + r * 1.3;
  for (let x = -r; x <= r; x++) for (let y = -Math.ceil(r * 1.4); y <= Math.ceil(r * 1.4); y++) for (let z = -r; z <= r; z++) {
    if ((x * x) / (r * r) + (y * y) / ((r * 1.4) ** 2) + (z * z) / (r * r) > 1) continue;
    out.push({ x: cx + x, y: Math.round(cy + y), z: cz + z, color: NIGHT.round[(x + y + z + 20) & 1] });
  }
  return out;
}

export function bush(cx: number, cz: number, base: number, r: number): Voxel[] {
  const out: Voxel[] = [];
  for (let x = -r; x <= r; x++) for (let y = 0; y <= r; y++) for (let z = -r; z <= r; z++) {
    if (x * x + y * y * 1.6 + z * z > r * r + 0.5) continue;
    out.push({ x: cx + x, y: base + 1 + y, z: cz + z, color: NIGHT.round[(x + z + y) & 1] });
  }
  return out;
}

// The balance's fixed parts: base and post.
export function stand(): Voxel[] {
  const out: Voxel[] = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) out.push({ x, y: 1, z, color: NIGHT.stand });
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) out.push({ x, y: 2, z, color: NIGHT.stand });
  for (let y = 3; y <= 20; y++) out.push({ x: 0, y, z: 0, color: NIGHT.stand });
  return out;
}

export function voxelMesh(voxels: Voxel[], geometry: BoxGeometry, material: MeshStandardMaterial | MeshPhysicalMaterial, shadows = true) {
  const mesh = new InstancedMesh(geometry, material, voxels.length);
  const m = new Matrix4();
  const color = new Color();
  voxels.forEach((v, i) => {
    m.makeScale(v.sx ?? 1, v.sy ?? 1, v.sz ?? 1).setPosition(v.x * V, v.y * V, v.z * V);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.set(v.color));
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

// Pile positions in a pan: a 3x3 floor, then 2x2, then a pair and a top.
export const PILE: [number, number, number][] = [];
for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) PILE.push([x, 0, z]);
for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) PILE.push([x, 1, z]);
PILE.push([0, 2, -0.5], [0, 2, 0.5], [0, 3, 0]);
export const PILE_MAX = PILE.length; // 16 cubes share the two pans
export const PILE_SIZE = 1.45;
export const PILE_STEP = V * PILE_SIZE;

export function glassEnvironment(renderer: WebGLRenderer) {
  // A dark room with soft boxes, used only by the glass: edges catch clean
  // highlights while the forest keeps its moonlight.
  const room = new Scene();
  room.add(new Mesh(new BoxGeometry(20, 12, 20), new MeshBasicMaterial({ color: '#020303', side: BackSide })));
  const panel = (w: number, h: number, intensity: number, position: [number, number, number]) => {
    const mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color('#FFFFFF').multiplyScalar(intensity) }));
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
  };
  panel(7, 2.2, 6, [-4, 5.5, 3]);
  panel(1.2, 8, 2.6, [7.5, 1, -1]);
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, 0.02);
  room.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); (object.material as MeshBasicMaterial).dispose(); } });
  pmrem.dispose();
  return target;
}


export function glassMaterial(tint: string, env: Texture) {
  return new MeshPhysicalMaterial({
    color: new Color(tint), transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 1.6, depthWrite: false,
  });
}

// Matte voxels whose instances above the ground lean with a slow wind. Each
// cube moves as a whole, so trees sway in steps like the voxels they are.
export function swayMaterial(time: { value: number }) {
  const material = new MeshStandardMaterial({ roughness: 0.86, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 voxelAt = instanceMatrix[3].xyz;
  float lift = max(voxelAt.y - 0.25, 0.0);
  float gust = sin(uTime * 0.9 + voxelAt.x * 1.7 + voxelAt.z * 1.3) + 0.45 * sin(uTime * 2.3 + voxelAt.z * 3.1);
  transformed.x += gust * lift * 0.018;
  transformed.z += gust * lift * 0.008;
#endif`);
  };
  material.customProgramCacheKey = () => 'voxel-sway';
  return material;
}

// Software rasterizers make every frame slow; scenes keep their still picture
// there. A loopback-only flag lets local visual checks render anyway.
export function renderFlags() {
  let allowSoftware = false;
  let poster = false;
  try {
    const loopback = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname);
    allowSoftware = loopback && localStorage.getItem('67.scale.software') === '1';
    poster = loopback && localStorage.getItem('67.scale.poster') === '1';
  } catch { /* storage unavailable */ }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { allowSoftware, poster, reduced };
}

export function isSoftware(renderer: WebGLRenderer) {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  return /swiftshader|llvmpipe|software|microsoft basic render/i.test(name);
}
