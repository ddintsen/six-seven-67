// The reel's three 3D sets, each drawn as a pure function of a state the
// timeline computes, so any frame can be rendered on its own:
//   mark    the 67 built from the same glass cubes as the balance's piles
//   forest  the home page's night forest with the balance (src/landing/forestScene.ts)
//   story   the floating plot that plays the four calls (src/landing/storyScene.ts)
// The forest and story sets are kept in step with those files by hand.
import {
  AdditiveBlending, Box3, BoxGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, InstancedMesh, MathUtils, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping, Object3D, PCFShadowMap,
  PerspectiveCamera, Plane, PlaneGeometry, PointLight, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import {
  GROUND, NIGHT, PILE, PILE_MAX, PILE_SIZE, PILE_STEP, V, bush, glassEnvironment, glassMaterial, hash, pine,
  roundTree, smooth, stand, swayMaterial, voxelMesh,
} from '../src/landing/voxels';
import type { Voxel } from '../src/landing/voxels';
import type { Cell } from '../src/brand/mark';

export interface View { yaw: number; pitch: number; distance: number; target: [number, number, number]; fov: number; shiftX: number; shiftY: number }
export interface MarkState { view: View; cubes: { cell: Cell; side: 'yes' | 'no'; y: number; scale: number; glow: number }[]; light: [number, number] }
export interface PileCube { offset: number; scale: number }
export interface ForestState { view: View; time: number; tilt: number; glowYes: number; piles: [PileCube[], PileCube[]]; fog: [number, number] }
export interface StoryState { view: View; time: number; p: number }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const window01 = (t: number, start: number, length: number) => clamp01((t - start) / length);

function placeCamera(camera: PerspectiveCamera, view: View, width: number, height: number) {
  const [tx, ty, tz] = view.target;
  camera.fov = view.fov;
  camera.aspect = width / height;
  camera.position.set(
    tx + Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance,
    ty + Math.sin(view.pitch) * view.distance,
    tz + Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance,
  );
  camera.lookAt(tx, ty, tz);
  // A lens shift moves the subject across the frame without turning the camera.
  camera.setViewOffset(width, height, -view.shiftX * width, -view.shiftY * height, width, height);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- forest
const RX = 74;
const RZ = 54;
const inClearing = (x: number, z: number) => (x * x) / 420 + (z * z) / 230 < 1;
const PLAZA = { x: 8, z: 4 };
const inPlaza = (x: number, z: number) => Math.abs(x) <= PLAZA.x * 2 - 1 && Math.abs(z) <= PLAZA.z - 1;
function terrain(): Voxel[] {
  const out: Voxel[] = [];
  for (let x = -RX; x <= RX; x++) for (let z = -RZ; z <= RZ; z++) {
    if (inPlaza(x, z)) continue;
    const level = inClearing(x, z) ? 0 : smooth(x, z) > 0.55 ? 1 : 0;
    out.push({ x, y: level, z, color: NIGHT.grass[Math.floor(hash(x, z) * 4)] });
    // For the reel the forest is a floating land, like the story's plot:
    // soil walls under its edge show when the camera rises.
    const edge = Math.abs(x) === RX || Math.abs(z) === RZ;
    if (edge) for (let y = -1; y >= -5; y--) out.push({ x, y, z, color: y === -1 ? '#0C2A20' : y > -4 ? '#0A2019' : '#081812' });
  }
  return out;
}
function forestTrees(): Voxel[] {
  const solid: Voxel[] = [];
  for (let x = -RX + 3; x <= RX - 3; x += 7) for (let z = -RZ + 3; z <= RZ - 3; z += 7) {
    const jx = x + Math.round((hash(x, z) - 0.5) * 5);
    const jz = z + Math.round((hash(z, x) - 0.5) * 5);
    if (inClearing(jx * 0.82, jz * 0.82)) continue;
    const roll = hash(jx * 1.7, jz * 0.3);
    const base = smooth(jx, jz) > 0.55 ? 1 : 0;
    if (roll < 0.3) solid.push(...pine(jx, jz, base, 12 + Math.floor(hash(jz, jx) * 10)));
    else if (roll < 0.42) solid.push(...roundTree(jx, jz, base, 2 + Math.floor(hash(jx, 3) * 2)));
    else if (roll < 0.52) solid.push(...bush(jx, jz, base, 2));
  }
  return solid;
}
function plazaTiles() {
  const out = { yes: [] as Voxel[], no: [] as Voxel[], middle: [] as Voxel[] };
  for (let bx = -PLAZA.x; bx < PLAZA.x; bx++) for (let bz = -PLAZA.z / 2; bz < PLAZA.z / 2; bz++) {
    const v: Voxel = { x: bx * 2 + 1, y: 0, z: bz * 2 + 1, color: '#FFFFFF', sx: 1.86, sy: 0.9, sz: 1.86 };
    if (bx < -1) out.yes.push(v); else if (bx > 0) out.no.push(v); else out.middle.push(v);
  }
  return out;
}
function cloudVoxels(): Voxel[] {
  const out: Voxel[] = [];
  const blobs = [[-30, -12, 9, 5], [8, 10, 7, 4], [36, -20, 10, 6], [-8, 30, 8, 5], [52, 22, 6, 4]];
  for (const [cx, cz, rx, rz] of blobs) for (let x = -rx; x <= rx; x++) for (let z = -rz; z <= rz; z++) {
    const edge = (x * x) / (rx * rx) + (z * z) / (rz * rz) + (hash(cx + x, cz + z) - 0.5) * 0.5;
    if (edge < 1) out.push({ x: (cx + x) * 3, y: 38, z: (cz + z) * 3, color: '#000000', sx: 3, sy: 1, sz: 3 });
  }
  return out;
}

// ---------------------------------------------------------------- story plot
const PX = 22;
const PZ = 14;
const YES_COUNT = 9;
const NO_COUNT = PILE_MAX - YES_COUNT;
const ARRIVALS: ('yes' | 'no')[] = ['yes', 'no', 'yes', 'no', 'yes', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes'];
function plot(): { top: Voxel[]; sides: Voxel[] } {
  const top: Voxel[] = [];
  const sides: Voxel[] = [];
  for (let x = -PX; x <= PX; x++) for (let z = -PZ; z <= PZ; z++) {
    const plaza = Math.abs(x) <= 15 && Math.abs(z) <= 3;
    if (!plaza) top.push({ x, y: 0, z, color: NIGHT.grass[Math.floor(hash(x, z) * 4)] });
    const edge = Math.abs(x) === PX || Math.abs(z) === PZ;
    if (edge) for (let y = -1; y >= -3; y--) sides.push({ x, y, z, color: y === -1 ? '#0C2A20' : '#0A2019' });
  }
  return { top, sides };
}
function plotTrees(): Voxel[] {
  const out: Voxel[] = [];
  const spots: [number, number, 'pine' | 'round' | 'bush', number][] = [
    [-19, -11, 'pine', 17], [-14, -12, 'round', 3], [-7, -12, 'pine', 13], [3, -12, 'bush', 2], [9, -11, 'pine', 19],
    [16, -12, 'round', 2], [20, -9, 'pine', 14], [-20, -4, 'bush', 2], [20, 3, 'bush', 2], [-19, 10, 'pine', 12],
    [17, 11, 'round', 2], [-10, 11, 'bush', 2],
  ];
  for (const [x, z, kind, size] of spots) {
    if (kind === 'pine') out.push(...pine(x, z, 0, size));
    else if (kind === 'round') out.push(...roundTree(x, z, 0, size));
    else out.push(...bush(x, z, 0, size));
  }
  return out;
}

// The balance shared by forest and story: stand, beam, pivot, two pans.
function buildBalance(box: BoxGeometry, matte: MeshStandardMaterial, env: { texture: import('three').Texture }, counts: [number, number], pivotGlow: number) {
  const group = new Group();
  group.add(voxelMesh(stand(), box, matte));
  const ARM = 13 * V;
  const beam = new Group();
  beam.position.set(0, 21.5 * V, 0);
  group.add(beam);
  const arm: Voxel[] = [];
  for (let x = -13; x <= 13; x++) arm.push({ x, y: 0, z: 0, color: NIGHT.stand, sx: 0.8, sy: 0.8, sz: 0.8 });
  beam.add(voxelMesh(arm, box, matte));
  const pivotMaterial = new MeshStandardMaterial({ color: '#DDE6E2', emissive: new Color('#DDE6E2'), emissiveIntensity: pivotGlow, roughness: 0.3 });
  beam.add(new Mesh(new BoxGeometry(V * 1.8, V * 1.8, V * 1.8), pivotMaterial));
  const hang = 9 * V;
  const pans = (['yes', 'no'] as const).map((side, index) => {
    const holder = new Group();
    holder.position.x = (index === 0 ? -1 : 1) * ARM;
    beam.add(holder);
    const rods: Voxel[] = [];
    for (let y = 1; y <= 8; y++) rods.push({ x: 0, y: -y, z: 0, color: NIGHT.stand, sx: 0.35, sy: 1, sz: 0.35 });
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      if (x * x + z * z > 14) continue;
      rods.push({ x, y: -9, z, color: NIGHT.pan });
      if (x * x + z * z > 9) rods.push({ x, y: -8, z, color: NIGHT.pan, sx: 0.7, sy: 0.7, sz: 0.7 });
    }
    holder.add(voxelMesh(rods, box, matte));
    const color = new Color(side === 'yes' ? NIGHT.yesCore : NIGHT.noCore);
    const coreMaterial = new MeshStandardMaterial({ color: '#081510', emissive: color.clone(), emissiveIntensity: 1.3 });
    const shellMaterial = glassMaterial(side === 'yes' ? NIGHT.yes : NIGHT.no, env.texture);
    const count = counts[index];
    const cores = new InstancedMesh(box, coreMaterial, count);
    const shells = new InstancedMesh(box, shellMaterial, count);
    shells.renderOrder = 2;
    const pile = new Group();
    pile.position.y = -hang + V * 0.5 + PILE_STEP * 0.5;
    pile.add(cores, shells);
    holder.add(pile);
    const light = new PointLight(color, 1, 4.5, 1.6);
    light.position.y = -hang + 0.25;
    holder.add(light);
    return { side, holder, pile, cores, shells, coreMaterial, shellMaterial, light, color, shellColor: new Color(side === 'yes' ? NIGHT.yes : NIGHT.no), count };
  });
  return { group, beam, pans, ARM, hang, pivotMaterial };
}

export function createWorld(canvas: HTMLCanvasElement, width: number, height: number, options: { antialias?: boolean; shadows?: boolean } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: options.antialias ?? true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = options.shadows ?? true;
  renderer.shadowMap.type = PCFShadowMap;
  const env = glassEnvironment(renderer);
  const box = new BoxGeometry(V * 0.98, V * 0.98, V * 0.98);
  const helper = new Object3D();

  // ------------------------------------------------------------ mark set
  const mark = new Scene();
  mark.background = new Color(GROUND);
  mark.fog = new Fog(GROUND, 30, 52);
  const markMoon = new DirectionalLight('#A9C2E6', 2.1);
  markMoon.position.set(-8, 16, 10);
  mark.add(markMoon, new HemisphereLight('#2B4260', '#08140F', 0.75));
  const markLights = [new PointLight(NIGHT.yesCore, 0, 9, 1.4), new PointLight(NIGHT.noCore, 0, 9, 1.4)];
  markLights[0].position.set(-2, 2.6, 2.2);
  markLights[1].position.set(2, 1.4, 2.2);
  mark.add(...markLights);
  const floor = new Mesh(new PlaneGeometry(80, 80), new MeshPhysicalMaterial({
    color: '#0C1110', roughness: 0.34, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18, envMap: env.texture, envMapIntensity: 0.35,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.3;
  mark.add(floor);
  const cubeGeometry = new BoxGeometry(0.9, 0.9, 0.9);
  const coreGeometry = new BoxGeometry(0.5, 0.5, 0.5);
  const shells = { yes: glassMaterial(NIGHT.yes, env.texture), no: glassMaterial(NIGHT.no, env.texture) };
  for (const shell of [shells.yes, shells.no]) { shell.opacity = 0.5; shell.envMapIntensity = 2.4; }
  const markCubes = new Map<string, { group: Group; core: MeshStandardMaterial }>();
  function markCube(cell: Cell, side: 'yes' | 'no') {
    const key = `${cell[0]}-${cell[1]}`;
    let cube = markCubes.get(key);
    if (!cube) {
      const group = new Group();
      const core = new MeshStandardMaterial({ color: '#081510', emissive: new Color(side === 'yes' ? NIGHT.yesCore : NIGHT.noCore), emissiveIntensity: 0 });
      const shell = new Mesh(cubeGeometry, shells[side]);
      shell.renderOrder = 2;
      group.add(new Mesh(coreGeometry, core), shell);
      mark.add(group);
      cube = { group, core };
      markCubes.set(key, cube);
    }
    return cube;
  }
  const markCamera = new PerspectiveCamera(22, width / height, 0.5, 120);

  // ------------------------------------------------------------ forest set
  const forest = new Scene();
  forest.background = new Color(GROUND);
  const forestFog = new Fog(GROUND, 12, 21);
  forest.fog = forestFog;
  const moon = new DirectionalLight('#A9C2E6', 1.9);
  moon.position.set(-3.5, 9, 2.5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0006;
  Object.assign(moon.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 26 });
  forest.add(moon, new HemisphereLight('#2B4260', '#08140F', 0.9));
  const matte = new MeshStandardMaterial({ roughness: 0.86, metalness: 0 });
  const time = { value: 0 };
  const woods = swayMaterial(time);
  // The woods in 16 x 16 voxel chunks, so frames and the moon's shadow pass
  // draw only the chunks they can see.
  const chunks = new Map<string, Voxel[]>();
  for (const voxel of [...terrain(), ...forestTrees()]) {
    const key = `${Math.floor(voxel.x / 16)},${Math.floor(voxel.z / 16)}`;
    const list = chunks.get(key);
    if (list) list.push(voxel); else chunks.set(key, [voxel]);
  }
  for (const list of chunks.values()) forest.add(voxelMesh(list, box, woods));
  const shadowOnly = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const sky = new Group();
  const SKY_PERIOD = 26;
  for (const offset of [0, -SKY_PERIOD]) {
    const layer = voxelMesh(cloudVoxels(), box, shadowOnly as unknown as MeshStandardMaterial);
    layer.receiveShadow = false;
    layer.position.x = offset;
    sky.add(layer);
  }
  forest.add(sky);
  const tiles = plazaTiles();
  const tile = (color: string, emissive: string) => new MeshPhysicalMaterial({
    color: new Color(color), roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
    emissive: new Color(emissive), emissiveIntensity: 0.3, envMap: env.texture, envMapIntensity: 0.9,
  });
  const tileYes = tile('#0E1B17', NIGHT.yes);
  const tileNo = tile('#0E161C', NIGHT.no);
  forest.add(voxelMesh(tiles.yes, box, tileYes, false), voxelMesh(tiles.no, box, tileNo, false), voxelMesh(tiles.middle, box, tile('#121816', '#2A3431'), false));
  const forestBalance = buildBalance(box, matte, env, [PILE_MAX, PILE_MAX], 0.25);
  forest.add(forestBalance.group);
  const forestCamera = new PerspectiveCamera(26, width / height, 0.1, 90);

  // ------------------------------------------------------------ story set
  const story = new Scene();
  story.background = new Color(GROUND);
  const storyMoon = new DirectionalLight('#A9C2E6', 1.9);
  storyMoon.position.set(-3, 8, 3);
  storyMoon.castShadow = true;
  storyMoon.shadow.mapSize.set(1536, 1536);
  storyMoon.shadow.bias = -0.0006;
  Object.assign(storyMoon.shadow.camera, { left: -3.5, right: 3.5, top: 3, bottom: -3, near: 1, far: 20 });
  story.add(storyMoon, new HemisphereLight('#2B4260', '#08140F', 0.9));
  const storyWorld = new Group();
  story.add(storyWorld);
  const ground = plot();
  const plotMesh = voxelMesh([...ground.top, ...ground.sides, ...plotTrees()], box, woods);
  storyWorld.add(plotMesh);
  const storyTiles: Voxel[] = [];
  for (let bx = -8; bx < 8; bx++) for (let bz = -2; bz < 2; bz++) storyTiles.push({ x: bx * 2 + 1, y: 0, z: bz * 2 + 0.5, color: '#FFFFFF', sx: 1.86, sy: 0.9, sz: 1.86 });
  storyWorld.add(voxelMesh(storyTiles, box, new MeshPhysicalMaterial({ color: '#101816', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25, envMap: env.texture, envMapIntensity: 0.9 }), false));
  const plaqueMaterial = new MeshPhysicalMaterial({ color: '#C9D6D0', roughness: 0.55, transparent: true, opacity: 0.5, clearcoat: 1, envMap: env.texture, envMapIntensity: 1.2, emissive: new Color('#9FB2AB'), emissiveIntensity: 0.12 });
  const plaque = new Mesh(new BoxGeometry(V * 9, V * 6, V * 0.8), plaqueMaterial);
  const plaqueRest = new Vector3(-4 * V, 4.2 * V, -10.5 * V);
  plaque.castShadow = true;
  storyWorld.add(plaque);
  const sealMaterial = new MeshStandardMaterial({ color: '#E8EEEB', emissive: new Color('#E8EEEB'), emissiveIntensity: 0.6 });
  const seal = new Mesh(new BoxGeometry(V * 1.4, V * 1.4, V * 1.4), sealMaterial);
  seal.position.set(0, 0, V * 0.6);
  plaque.add(seal);
  // The balance and the plaque rise out of the glass floor: whatever is still
  // below it is cut away, so nothing hangs under the floating plot (as on the
  // site). The story balance gets its own matte so the forest is untouched.
  renderer.localClippingEnabled = true;
  const glassFloor = [new Plane(new Vector3(0, 1, 0), -V * 0.5)];
  const storyMatte = matte.clone();
  const storyBalance = buildBalance(box, storyMatte, env, [YES_COUNT, NO_COUNT], 0.35);
  storyWorld.add(storyBalance.group);
  for (const material of [storyMatte, plaqueMaterial, sealMaterial, storyBalance.pivotMaterial, ...storyBalance.pans.flatMap(pan => [pan.coreMaterial, pan.shellMaterial])]) {
    material.clippingPlanes = glassFloor;
    material.clipShadows = true;
  }
  for (const pan of storyBalance.pans) { pan.light.intensity = 0; pan.light.distance = 3.2; pan.coreMaterial.emissiveIntensity = 1.4; }
  const rayMaterial = new MeshBasicMaterial({ color: '#E8F4EE', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const ray = new Mesh(new BoxGeometry(V * 1.1, V * 46, V * 1.1), rayMaterial);
  storyWorld.add(ray);
  const flash = new PointLight('#E8F4EE', 0, 3, 1.4);
  storyWorld.add(flash);
  const storyCamera = new PerspectiveCamera(28, width / height, 0.1, 60);
  const frost = new Color('#5E6B67');
  const holderWorld = new Vector3();

  function arrivalIndex(side: 'yes' | 'no', nth: number) {
    let seen = 0;
    for (let i = 0; i < ARRIVALS.length; i++) if (ARRIVALS[i] === side && seen++ === nth) return i;
    return 0;
  }

  // The story's apply(p), as on the site.
  function applyStory(p: number) {
    const a = clamp01(p);
    const b = clamp01(p - 1);
    const c = clamp01(p - 2);
    const d = clamp01(p - 3);
    const { group: balance, beam, pans, hang } = storyBalance;
    balance.position.y = (1 - easeOut(window01(a, 0, 0.6))) * -2.6;
    const plaqueT = easeOut(window01(a, 0.35, 0.55));
    plaque.position.set(plaqueRest.x, plaqueRest.y - (1 - plaqueT) * 0.9, plaqueRest.z);
    plaque.visible = plaqueT > 0.001;
    plaqueMaterial.opacity = 0.15 + plaqueT * 0.4;
    seal.scale.setScalar(Math.max(0.001, easeOut(window01(a, 0.85, 0.15))));
    let yesIn = 0;
    let noIn = 0;
    for (const pan of pans) {
      for (let n = 0; n < pan.count; n++) {
        const order = arrivalIndex(pan.side, n);
        const fall = easeOut(window01(b, (order / ARRIVALS.length) * 0.82, 0.16));
        if (fall >= 1) { if (pan.side === 'yes') yesIn++; else noIn++; }
        const leaveOrder = pan.side === 'yes' ? (pan.count - 1 - n) / pan.count : 0;
        const leave = pan.side === 'yes' ? easeInOut(window01(d, leaveOrder * 0.75, 0.25)) : 0;
        const [x, y, z] = PILE[n];
        helper.position.set(x * PILE_STEP, y * PILE_STEP + (1 - fall) * 1.6 + leave * 2.4, z * PILE_STEP + leave * 1.6);
        helper.position.x += leave * 1.2;
        const size = PILE_SIZE * (fall > 0 ? 1 : 0.001) * (1 - leave * 0.85);
        helper.scale.setScalar(Math.max(0.001, size));
        helper.updateMatrix();
        pan.shells.setMatrixAt(n, helper.matrix);
        helper.scale.setScalar(Math.max(0.001, size * 0.5));
        helper.updateMatrix();
        pan.cores.setMatrixAt(n, helper.matrix);
        if (pan.side === 'yes' && leave >= 1) yesIn--;
      }
      pan.shells.instanceMatrix.needsUpdate = true;
      pan.cores.instanceMatrix.needsUpdate = true;
    }
    const rayIn = easeOut(window01(c, 0, 0.3));
    const rayOut = window01(c, 0.7, 0.3);
    const strength = rayIn * (1 - rayOut);
    storyWorld.updateMatrixWorld(true);
    pans[0].holder.getWorldPosition(holderWorld);
    ray.position.set(holderWorld.x, holderWorld.y + V * 23 - hang * 0.5 + (1 - rayIn) * 2.2, holderWorld.z);
    rayMaterial.opacity = strength * 0.7;
    ray.visible = strength > 0.001;
    flash.position.set(holderWorld.x, holderWorld.y - hang + 0.4, holderWorld.z);
    flash.intensity = strength * 2.4;
    const dim = easeOut(window01(c, 0.3, 0.4));
    const [yesPan, noPan] = pans;
    noPan.coreMaterial.emissiveIntensity = 1.4 * (1 - dim) + 0.02;
    noPan.shellMaterial.color.copy(noPan.shellColor).lerp(frost, dim);
    noPan.shellMaterial.opacity = 0.42 + dim * 0.25;
    yesPan.coreMaterial.emissiveIntensity = 1.4 + strength * 0.8;
    yesPan.light.intensity = Math.min(yesIn, YES_COUNT) / YES_COUNT * 1.8 * (1 - d * 0.9);
    noPan.light.intensity = Math.min(noIn, NO_COUNT) / NO_COUNT * 1.4 * (1 - dim);
    const tilt = ((Math.max(0, yesIn) - noIn) / PILE_MAX) * 0.9;
    beam.rotation.z = tilt;
    for (const pan of pans) pan.holder.rotation.z = -tilt;
  }

  // Frame the plot so it fills a share of the frame's height, as fit() does
  // on the site, then hand the result back as a view to orbit around.
  const storyBounds = new Box3().setFromObject(plotMesh);
  storyBounds.expandByPoint(new Vector3(-(storyBalance.ARM + 5 * V), 23 * V, 0)).expandByPoint(new Vector3(storyBalance.ARM + 5 * V, 23 * V, 0));
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new Vector3(
    i & 1 ? storyBounds.max.x : storyBounds.min.x, i & 2 ? storyBounds.max.y : storyBounds.min.y, i & 4 ? storyBounds.max.z : storyBounds.min.z));
  function fitStory(yaw: number, pitch: number, fill: number, fov: number): View {
    const target = new Vector3();
    storyBounds.getCenter(target);
    const view: View = { yaw, pitch, distance: 9, target: [target.x, target.y, target.z], fov, shiftX: 0, shiftY: 0 };
    const projected = new Vector3();
    const right = new Vector3();
    const up = new Vector3();
    for (let pass = 0; pass < 6; pass++) {
      view.target = [target.x, target.y, target.z];
      storyCamera.clearViewOffset();
      storyCamera.fov = fov;
      storyCamera.aspect = width / height;
      storyCamera.position.set(
        target.x + Math.sin(yaw) * Math.cos(pitch) * view.distance,
        target.y + Math.sin(pitch) * view.distance,
        target.z + Math.cos(yaw) * Math.cos(pitch) * view.distance,
      );
      storyCamera.lookAt(target);
      storyCamera.updateProjectionMatrix();
      storyCamera.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const corner of corners) {
        projected.copy(corner).project(storyCamera);
        minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
      }
      const halfHeight = Math.tan(MathUtils.degToRad(fov / 2)) * view.distance;
      right.setFromMatrixColumn(storyCamera.matrixWorld, 0);
      up.setFromMatrixColumn(storyCamera.matrixWorld, 1);
      target.addScaledVector(right, ((minX + maxX) / 2) * halfHeight * storyCamera.aspect);
      target.addScaledVector(up, ((minY + maxY) / 2) * halfHeight);
      view.distance *= ((maxY - minY) / 2) / fill;
    }
    view.target = [target.x, target.y, target.z];
    return view;
  }

  const projectedAnchor = new Vector3();
  return {
    renderer,
    fitStory,
    renderMark(state: MarkState) {
      for (const cube of state.cubes) {
        const { group, core } = markCube(cube.cell, cube.side);
        const [col, row] = cube.cell;
        group.position.set(col - 3, 5 - row + 0.45 + cube.y, 0);
        group.scale.setScalar(Math.max(0.001, cube.scale));
        group.visible = cube.scale > 0.002;
        core.emissiveIntensity = cube.glow * 1.9;
      }
      markLights[0].intensity = state.light[0] * 3.2;
      markLights[1].intensity = state.light[1] * 3.0;
      placeCamera(markCamera, state.view, width, height);
      renderer.toneMappingExposure = 1.15;
      renderer.render(mark, markCamera);
    },
    // Where the trademark sign hangs, as on the site: 4% of the mark's width
    // past its right edge, 5.1% below its top, 24.6% of its width wide.
    markAnchor(view: View): [number, number, number] {
      placeCamera(markCamera, view, width, height);
      markCamera.updateMatrixWorld();
      projectedAnchor.set(3.726, 5.594, 0.45).project(markCamera);
      // Fractions of the frame, so the overlay can place it at any render scale.
      const x = (projectedAnchor.x + 1) / 2;
      const y = (1 - projectedAnchor.y) / 2;
      projectedAnchor.set(3.726 + 1.697, 5.594, 0.45).project(markCamera);
      return [x, y, (projectedAnchor.x + 1) / 2 - x];
    },
    renderForest(state: ForestState) {
      time.value = state.time;
      sky.position.x = ((state.time * 0.11) % SKY_PERIOD) + 4;
      forestFog.near = state.fog[0];
      forestFog.far = state.fog[1];
      const { beam, pans } = forestBalance;
      beam.rotation.z = state.tilt;
      for (const pan of pans) pan.holder.rotation.z = -state.tilt;
      pans.forEach((pan, index) => {
        const cubes = state.piles[index];
        pan.cores.count = cubes.length;
        pan.shells.count = cubes.length;
        cubes.forEach((cube, i) => {
          const [x, y, z] = PILE[i];
          helper.position.set(x * PILE_STEP, y * PILE_STEP + cube.offset, z * PILE_STEP);
          helper.scale.setScalar(Math.max(0.001, PILE_SIZE * cube.scale));
          helper.updateMatrix();
          pan.shells.setMatrixAt(i, helper.matrix);
          helper.scale.setScalar(Math.max(0.001, PILE_SIZE * 0.5 * cube.scale));
          helper.updateMatrix();
          pan.cores.setMatrixAt(i, helper.matrix);
        });
        pan.shells.instanceMatrix.needsUpdate = true;
        pan.cores.instanceMatrix.needsUpdate = true;
      });
      const glowYes = state.glowYes;
      const breathYes = 1 + 0.06 * Math.sin(state.time * 1.6);
      const breathNo = 1 + 0.06 * Math.sin(state.time * 1.6 + 2.1);
      pans[0].coreMaterial.emissiveIntensity = (0.5 + glowYes * 1.6) * breathYes;
      pans[1].coreMaterial.emissiveIntensity = (0.5 + (1 - glowYes) * 1.6) * breathNo;
      pans[0].light.intensity = (0.3 + glowYes * 2.2) * breathYes;
      pans[1].light.intensity = (0.25 + (1 - glowYes) * 1.6) * breathNo;
      tileYes.emissiveIntensity = glowYes * 0.05;
      tileNo.emissiveIntensity = (1 - glowYes) * 0.03;
      placeCamera(forestCamera, state.view, width, height);
      // A little brighter than the site: a video is often watched on a phone in daylight.
      renderer.toneMappingExposure = 1.32;
      renderer.render(forest, forestCamera);
    },
    renderStory(state: StoryState) {
      time.value = state.time;
      applyStory(state.p);
      placeCamera(storyCamera, state.view, width, height);
      renderer.toneMappingExposure = 1.28;
      renderer.render(story, storyCamera);
    },
    clear() {
      renderer.setClearColor(GROUND, 1);
      renderer.clear();
    },
  };
}
export type World = ReturnType<typeof createWorld>;
