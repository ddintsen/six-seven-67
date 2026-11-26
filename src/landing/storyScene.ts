// "Four calls settle a market", played by a small floating plot of the same
// night forest. Scroll position drives one number, p from 0 to 4, and the
// scene is a pure function of it, so scrolling back plays everything in
// reverse:
//   0–1 CreateMarket      the balance rises from the glass floor; the question plaque follows and locks
//   1–2 Buy               sixteen glass cubes drop in, nine Yes and seven No; the beam follows the weight
//   2–3 FinalizeByOracle  a beam of light marks the Yes pan; the No cubes go dark and frosted
//   3–4 Claim             the winning cubes leave one by one, each worth 1 GNOT; the beam swings back
// Rendering happens only when p moves. Reduced motion shows the finished
// state of the current step without tweening.
import {
  AdditiveBlending, Box3, BoxGeometry, Color, DirectionalLight, Group, HemisphereLight, InstancedMesh, MathUtils, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping, Object3D, PCFShadowMap,
  PerspectiveCamera, Plane, PointLight, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import {
  GROUND, NIGHT, PILE, PILE_MAX, PILE_SIZE, PILE_STEP, V, bush, glassEnvironment, glassMaterial, hash, isSoftware, pine,
  renderFlags, roundTree, stand, swayMaterial, voxelMesh,
} from './voxels';
import type { Voxel } from './voxels';

export interface StoryHandle { setProgress(p: number): void; dispose(): void }

const PX = 22;
const PZ = 14;
const YES_COUNT = 9;
const NO_COUNT = PILE_MAX - YES_COUNT;
// The order cubes arrive in: mostly alternating, Yes slightly ahead.
const ARRIVALS: ('yes' | 'no')[] = ['yes', 'no', 'yes', 'no', 'yes', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes', 'no', 'yes'];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const window01 = (t: number, start: number, length: number) => clamp01((t - start) / length);

function plot(): { top: Voxel[]; sides: Voxel[] } {
  const top: Voxel[] = [];
  const sides: Voxel[] = [];
  for (let x = -PX; x <= PX; x++) {
    for (let z = -PZ; z <= PZ; z++) {
      const inPlaza = Math.abs(x) <= 15 && Math.abs(z) <= 3;
      if (!inPlaza) top.push({ x, y: 0, z, color: NIGHT.grass[Math.floor(hash(x, z) * 4)] });
      const edge = Math.abs(x) === PX || Math.abs(z) === PZ;
      if (edge) for (let y = -1; y >= -3; y--) sides.push({ x, y, z, color: y === -1 ? '#0C2A20' : '#0A2019' });
    }
  }
  return { top, sides };
}

function trees(): Voxel[] {
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

export function mountStory(container: HTMLElement, options: { onFallback?: () => void; onReady?: () => void }): StoryHandle {
  const { allowSoftware, reduced } = renderFlags();
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !allowSoftware });
  } catch {
    options.onFallback?.();
    return { setProgress() { /* no renderer */ }, dispose() { /* nothing to free */ } };
  }
  if (!allowSoftware && isSoftware(renderer)) {
    renderer.dispose();
    renderer.forceContextLoss();
    options.onFallback?.();
    return { setProgress() { /* text only */ }, dispose() { /* nothing to free */ } };
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'story-canvas';
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = new Color(GROUND);
  const env = glassEnvironment(renderer);
  const moon = new DirectionalLight('#A9C2E6', 1.9);
  moon.position.set(-3, 8, 3);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.bias = -0.0006;
  Object.assign(moon.shadow.camera, { left: -3.5, right: 3.5, top: 3, bottom: -3, near: 1, far: 20 });
  scene.add(moon, new HemisphereLight('#2B4260', '#08140F', 0.9));

  const box = new BoxGeometry(V * 0.98, V * 0.98, V * 0.98);
  const matte = new MeshStandardMaterial({ roughness: 0.86, metalness: 0 });
  const time = { value: 0 };
  const woods = swayMaterial(time);
  const world = new Group();
  scene.add(world);
  const ground = plot();
  world.add(voxelMesh([...ground.top, ...ground.sides, ...trees()], box, woods));

  // Glass floor, frosted plaque and the balance.
  const tileMaterial = new MeshPhysicalMaterial({ color: '#101816', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25, envMap: env.texture, envMapIntensity: 0.9 });
  const tiles: Voxel[] = [];
  for (let bx = -8; bx < 8; bx++) for (let bz = -2; bz < 2; bz++) tiles.push({ x: bx * 2 + 1, y: 0, z: bz * 2 + 0.5, color: '#FFFFFF', sx: 1.86, sy: 0.9, sz: 1.86 });
  world.add(voxelMesh(tiles, box, tileMaterial, false));

  const plaqueMaterial = new MeshPhysicalMaterial({ color: '#C9D6D0', roughness: 0.55, transmission: 0, transparent: true, opacity: 0.5, clearcoat: 1, envMap: env.texture, envMapIntensity: 1.2, emissive: new Color('#9FB2AB'), emissiveIntensity: 0.12 });
  const plaque = new Mesh(new BoxGeometry(V * 9, V * 6, V * 0.8), plaqueMaterial);
  const plaqueRest = new Vector3(-4 * V, 4.2 * V, -10.5 * V);
  plaque.castShadow = true;
  world.add(plaque);
  const sealMaterial = new MeshStandardMaterial({ color: '#E8EEEB', emissive: new Color('#E8EEEB'), emissiveIntensity: 0.6 });
  const seal = new Mesh(new BoxGeometry(V * 1.4, V * 1.4, V * 1.4), sealMaterial);
  seal.position.set(0, 0, V * 0.6);
  plaque.add(seal);

  const balance = new Group();
  world.add(balance);
  balance.add(voxelMesh(stand(), box, matte));
  const ARM = 13 * V;
  const beam = new Group();
  beam.position.set(0, 21.5 * V, 0);
  balance.add(beam);
  const arm: Voxel[] = [];
  for (let x = -13; x <= 13; x++) arm.push({ x, y: 0, z: 0, color: NIGHT.stand, sx: 0.8, sy: 0.8, sz: 0.8 });
  beam.add(voxelMesh(arm, box, matte));
  const pivotMaterial = new MeshStandardMaterial({ color: '#DDE6E2', emissive: new Color('#DDE6E2'), emissiveIntensity: 0.35, roughness: 0.3 });
  beam.add(new Mesh(new BoxGeometry(V * 1.8, V * 1.8, V * 1.8), pivotMaterial));

  const hang = 9 * V;
  const frost = new Color('#5E6B67');
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
    const coreMaterial = new MeshStandardMaterial({ color: '#081510', emissive: color.clone(), emissiveIntensity: 1.4 });
    const shellMaterial = glassMaterial(side === 'yes' ? NIGHT.yes : NIGHT.no, env.texture);
    const count = side === 'yes' ? YES_COUNT : NO_COUNT;
    const cores = new InstancedMesh(box, coreMaterial, count);
    const shells = new InstancedMesh(box, shellMaterial, count);
    shells.renderOrder = 2;
    const pile = new Group();
    pile.position.y = -hang + V * 0.5 + PILE_STEP * 0.5;
    pile.add(cores, shells);
    holder.add(pile);
    const light = new PointLight(color, 0, 3.2, 1.6);
    light.position.y = -hang + 0.25;
    holder.add(light);
    const shellColor = new Color(side === 'yes' ? NIGHT.yes : NIGHT.no);
    return { side, holder, pile, cores, shells, coreMaterial, shellMaterial, light, color, shellColor, count };
  });

  // The balance and the plaque rise out of the glass floor: whatever is still
  // below it is cut away, so nothing hangs under the floating plot.
  renderer.localClippingEnabled = true;
  const floor = [new Plane(new Vector3(0, 1, 0), -V * 0.5)];
  for (const material of [matte, plaqueMaterial, sealMaterial, pivotMaterial, ...pans.flatMap(pan => [pan.coreMaterial, pan.shellMaterial])]) {
    material.clippingPlanes = floor;
    material.clipShadows = true;
  }

  // The oracle: a column of light that descends onto the Yes pan.
  const rayMaterial = new MeshBasicMaterial({ color: '#E8F4EE', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const ray = new Mesh(new BoxGeometry(V * 1.1, V * 46, V * 1.1), rayMaterial);
  world.add(ray);
  const flash = new PointLight('#E8F4EE', 0, 3, 1.4);
  world.add(flash);

  const camera = new PerspectiveCamera(28, 1, 0.1, 60);
  const target = new Vector3(0.1, 0.95, 0);
  const view = { yaw: 0.38, pitch: 0.6, distance: 7.6 };
  // Everything that must stay in frame: the plot with its trees and the
  // balance at full height with both pans. Cubes may fall in from above and
  // the oracle's light may come from beyond the frame.
  const bounds = new Box3().setFromObject(world.children[0]);
  bounds.expandByPoint(new Vector3(-(ARM + 5 * V), 23 * V, 0)).expandByPoint(new Vector3(ARM + 5 * V, 23 * V, 0));
  const frameCorners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new Vector3(
    i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
  const projected = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const helper = new Object3D();
  const holderWorld = new Vector3();
  let shown = 0;
  let wanted = 0;
  let tilt = 0;

  // Where each cube is at progress p. Cubes count up in their pan's pile order.
  function arrivalIndex(side: 'yes' | 'no', nth: number) {
    let seen = 0;
    for (let i = 0; i < ARRIVALS.length; i++) if (ARRIVALS[i] === side && seen++ === nth) return i;
    return 0;
  }

  function apply(p: number) {
    const a = clamp01(p);
    const b = clamp01(p - 1);
    const c = clamp01(p - 2);
    const d = clamp01(p - 3);

    // CreateMarket: the balance rises, then the plaque rises and seals.
    balance.position.y = (1 - easeOut(window01(a, 0, 0.6))) * -2.6;
    const plaqueT = easeOut(window01(a, 0.35, 0.55));
    plaque.position.set(plaqueRest.x, plaqueRest.y - (1 - plaqueT) * 0.9, plaqueRest.z);
    plaque.visible = plaqueT > 0.001;
    plaqueMaterial.opacity = 0.15 + plaqueT * 0.4;
    seal.scale.setScalar(Math.max(0.001, easeOut(window01(a, 0.85, 0.15))));

    // Buy: cubes fall in their arrival order.
    let yesIn = 0;
    let noIn = 0;
    for (const pan of pans) {
      for (let n = 0; n < pan.count; n++) {
        const order = arrivalIndex(pan.side, n);
        const fall = easeOut(window01(b, (order / ARRIVALS.length) * 0.82, 0.16));
        if (fall >= 1) { if (pan.side === 'yes') yesIn++; else noIn++; }
        // Claim: winning cubes leave in reverse pile order.
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

    // Oracle: light descends on the Yes pan; No goes dark and frosted.
    const rayIn = easeOut(window01(c, 0, 0.3));
    const rayOut = window01(c, 0.7, 0.3);
    const strength = rayIn * (1 - rayOut);
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

    // The beam follows the weight that is in the pans, and stops moving
    // once the oracle has spoken until the winners leave.
    const weight = (Math.max(0, yesIn) - noIn) / PILE_MAX;
    tilt = weight * 0.9;
    beam.rotation.z = tilt;
    for (const pan of pans) pan.holder.rotation.z = -tilt;
  }

  function place() {
    camera.position.set(
      target.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance,
      target.y + Math.sin(view.pitch) * view.distance,
      target.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance,
    );
    camera.lookAt(target);
  }

  let frame = 0;
  let last = 0;
  let disposed = false;
  let visible = true;
  function draw() { if (disposed) return; place(); apply(shown); renderer.render(scene, camera); }
  function step(now: number) {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 15);
    last = now;
    shown = MathUtils.damp(shown, wanted, 5, dt);
    if (Math.abs(shown - wanted) < 0.0008) shown = wanted;
    draw();
    if (shown !== wanted) request();
  }
  function request() {
    if (frame || disposed || !visible) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  }

  // Frame the plot for any stage shape: project its corners, then move the
  // camera back (or in) and re-centre until the plot's box fills 92% of the
  // narrower side, so it is never cut and never lost in empty space.
  function fit() {
    bounds.getCenter(target);
    view.distance = 9;
    for (let pass = 0; pass < 6; pass++) {
      place();
      camera.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const corner of frameCorners) {
        projected.copy(corner).project(camera);
        minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
      }
      const extent = Math.max((maxX - minX) / 2, (maxY - minY) / 2);
      // Re-centre: shift the target by the projected offset, in world units at
      // the target's depth.
      const halfHeight = Math.tan(MathUtils.degToRad(camera.fov / 2)) * view.distance;
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(right, ((minX + maxX) / 2) * halfHeight * camera.aspect);
      target.addScaledVector(up, ((minY + maxY) / 2) * halfHeight);
      view.distance *= extent / 0.92;
    }
  }

  function resize() {
    if (disposed) return;
    const { width, height } = container.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fit();
    draw();
  }

  const resizer = new ResizeObserver(resize);
  resizer.observe(container);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) request(); });
  observer.observe(container);
  const onLost = (event: Event) => event.preventDefault();
  canvas.addEventListener('webglcontextlost', onLost);

  const handle: StoryHandle = {
    setProgress(p: number) {
      if (disposed) return;
      const next = Math.min(4, Math.max(0, p));
      // Reduced motion: the finished state of the step being read.
      wanted = reduced ? Math.min(4, Math.ceil(next - 0.15)) : next;
      if (reduced) { shown = wanted; draw(); } else request();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizer.disconnect();
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      scene.traverse(object => {
        if (object instanceof InstancedMesh) object.dispose();
        if (object instanceof Mesh) object.geometry.dispose();
      });
      [matte, woods, tileMaterial, plaqueMaterial, sealMaterial, pivotMaterial, rayMaterial, ...pans.flatMap(pan => [pan.coreMaterial, pan.shellMaterial])].forEach(material => material.dispose());
      box.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };

  // Local visual checks (loopback flag only) can jump straight to a frame.
  if (allowSoftware) Object.assign(window, { __67story: (p: number) => { wanted = p; shown = p; draw(); } });
  resize();
  void renderer.compileAsync(scene, camera).catch(() => undefined).then(() => {
    if (disposed) return;
    const started = performance.now();
    draw();
    renderer.getContext().finish();
    if (!allowSoftware && performance.now() - started > 120) { handle.dispose(); options.onFallback?.(); return; }
    options.onReady?.();
  });
  return handle;
}
