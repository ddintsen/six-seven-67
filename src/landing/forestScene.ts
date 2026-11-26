// Night in a voxel forest, in the spirit of the Gno.land documentation world
// (high camera, spire pines, round trees, one-voxel terraces) but redrawn for
// 67: no pond or mushrooms, our dark ground, and a clearing paved with glass
// blocks. In the clearing stands a balance. Its two pans hold
// glass cubes (Yes glass on the left, No glass on the right); each pile glows
// from inside with its side's price and lights the woods around it, so the
// market literally colours the forest. The beam tilts toward the outcome
// priced higher. Rendering is on demand; reduced motion draws one still frame.
// The scene also lives on its own for five seconds at a time: voxel cloud
// shadows drift over the woods, trees lean in a slow wind, and the glowing
// cores breathe a little. A pass starts on arrival, when the stage scrolls
// back into view, while the pointer moves over it and when another market is
// weighed, then slows to a stop (WCAG 2.2.2). It is capped at 30 frames a
// second, stops offscreen and in hidden tabs, switches itself off on slow
// devices and never runs with reduced motion.
import {
  BoxGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, InstancedMesh, MathUtils, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping, Object3D, PCFShadowMap,
  PerspectiveCamera, PointLight, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import {
  GROUND, NIGHT, PILE, PILE_MAX, PILE_SIZE, PILE_STEP, V, bush, glassEnvironment, glassMaterial, hash, isSoftware, pine,
  renderFlags, roundTree, smooth, stand, swayMaterial, voxelMesh,
} from './voxels';
import type { Voxel } from './voxels';

export { GROUND };

export interface ScaleHandle { setYes(price: number): void; dispose(): void }

const RX = 74;
const RZ = 54;
const inClearing = (x: number, z: number) => (x * x) / 420 + (z * z) / 230 < 1;
// The glass-block floor under the balance: columns left of the post sit
// under the Yes pan, right of it under the No pan.
const PLAZA = { x: 8, z: 4 };
const inPlaza = (x: number, z: number) => Math.abs(x) <= PLAZA.x * 2 - 1 && Math.abs(z) <= PLAZA.z - 1;

function terrain(): Voxel[] {
  const out: Voxel[] = [];
  for (let x = -RX; x <= RX; x++) {
    for (let z = -RZ; z <= RZ; z++) {
      if (inPlaza(x, z)) continue;
      // One-voxel terraces with jagged edges, flat in the clearing.
      const level = inClearing(x, z) ? 0 : smooth(x, z) > 0.55 ? 1 : 0;
      out.push({ x, y: level, z, color: NIGHT.grass[Math.floor(hash(x, z) * 4)] });
    }
  }
  return out;
}

function forest(): Voxel[] {
  const solid: Voxel[] = [];
  for (let x = -RX + 3; x <= RX - 3; x += 7) {
    for (let z = -RZ + 3; z <= RZ - 3; z += 7) {
      const jx = x + Math.round((hash(x, z) - 0.5) * 5);
      const jz = z + Math.round((hash(z, x) - 0.5) * 5);
      if (inClearing(jx * 0.82, jz * 0.82)) continue;
      const roll = hash(jx * 1.7, jz * 0.3);
      const base = smooth(jx, jz) > 0.55 ? 1 : 0;
      if (roll < 0.3) solid.push(...pine(jx, jz, base, 12 + Math.floor(hash(jz, jx) * 10)));
      else if (roll < 0.42) solid.push(...roundTree(jx, jz, base, 2 + Math.floor(hash(jx, 3) * 2)));
      else if (roll < 0.52) solid.push(...bush(jx, jz, base, 2));
    }
  }
  return solid;
}

// Glass blocks set into the clearing, two voxels to a block, lit from below
// by the pile above them.
function plaza(): { yes: Voxel[]; no: Voxel[]; middle: Voxel[] } {
  const out = { yes: [] as Voxel[], no: [] as Voxel[], middle: [] as Voxel[] };
  for (let bx = -PLAZA.x; bx < PLAZA.x; bx++) {
    for (let bz = -PLAZA.z / 2; bz < PLAZA.z / 2; bz++) {
      const v: Voxel = { x: bx * 2 + 1, y: 0, z: bz * 2 + 1, color: '#FFFFFF', sx: 1.86, sy: 0.9, sz: 1.86 };
      if (bx < -1) out.yes.push(v); else if (bx > 0) out.no.push(v); else out.middle.push(v);
    }
  }
  return out;
}

// Voxel clouds that only cast shadows: never drawn, they drift across the
// moonlight and darken the forest in slow, blocky patches.
function clouds(): Voxel[] {
  const out: Voxel[] = [];
  const blobs = [[-30, -12, 9, 5], [8, 10, 7, 4], [36, -20, 10, 6], [-8, 30, 8, 5], [52, 22, 6, 4]];
  for (const [cx, cz, rx, rz] of blobs) {
    for (let x = -rx; x <= rx; x++) for (let z = -rz; z <= rz; z++) {
      const edge = (x * x) / (rx * rx) + (z * z) / (rz * rz) + (hash(cx + x, cz + z) - 0.5) * 0.5;
      if (edge < 1) out.push({ x: (cx + x) * 3, y: 38, z: (cz + z) * 3, color: '#000000', sx: 3, sy: 1, sz: 3 });
    }
  }
  return out;
}

export function mountScale(container: HTMLElement, options: { yes: number; onFallback?: () => void; onReady?: () => void }): ScaleHandle {
  // `poster` (loopback only) renders the forest at rest so the still picture
  // public/forest-night.webp can be regenerated.
  const { allowSoftware, poster, reduced } = renderFlags();
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !allowSoftware, preserveDrawingBuffer: poster });
  } catch {
    options.onFallback?.();
    return { setYes() { /* no renderer */ }, dispose() { /* nothing to free */ } };
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'scale-canvas';
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = new Color(GROUND);
  scene.fog = new Fog(GROUND, 12, 21);
  const env = glassEnvironment(renderer);

  const moon = new DirectionalLight('#A9C2E6', 1.9);
  moon.position.set(-3.5, 9, 2.5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0006;
  Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 24 });
  scene.add(moon, new HemisphereLight('#2B4260', '#08140F', 0.9));

  const box = new BoxGeometry(V * 0.98, V * 0.98, V * 0.98);
  const matte = new MeshStandardMaterial({ roughness: 0.86, metalness: 0 });
  const time = { value: 0 };
  const woods = swayMaterial(time);
  const world = new Group();
  scene.add(world);
  world.add(voxelMesh([...terrain(), ...forest()], box, woods));
  world.add(voxelMesh(stand(), box, matte));
  const shadowOnly = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  // Two copies one period apart, so the drift wraps without a jump.
  const skyVoxels = clouds();
  const sky = new Group();
  const SKY_PERIOD = 26;
  for (const offset of [0, -SKY_PERIOD]) {
    const layer = voxelMesh(skyVoxels, box, shadowOnly as unknown as MeshStandardMaterial);
    layer.receiveShadow = false;
    layer.position.x = offset;
    sky.add(layer);
  }
  sky.visible = !reduced && !poster;
  world.add(sky);
  const tiles = plaza();
  const tile = (color: string, emissive: string) => new MeshPhysicalMaterial({
    color: new Color(color), roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
    emissive: new Color(emissive), emissiveIntensity: 0.3, envMap: env.texture, envMapIntensity: 0.9,
  });
  const tileYes = tile('#0E1B17', NIGHT.yes);
  const tileNo = tile('#0E161C', NIGHT.no);
  const tileMiddle = tile('#121816', '#2A3431');
  world.add(voxelMesh(tiles.yes, box, tileYes, false), voxelMesh(tiles.no, box, tileNo, false), voxelMesh(tiles.middle, box, tileMiddle, false));

  // Beam, pivot and hanging pans. The beam rotates; the pans stay level.
  const ARM = 13 * V;
  const beam = new Group();
  beam.position.set(0, 21.5 * V, 0);
  world.add(beam);
  const armVoxels: Voxel[] = [];
  for (let x = -13; x <= 13; x++) armVoxels.push({ x, y: 0, z: 0, color: NIGHT.stand, sx: 0.8, sy: 0.8, sz: 0.8 });
  beam.add(voxelMesh(armVoxels, box, matte));
  const pivotMaterial = new MeshStandardMaterial({ color: '#DDE6E2', emissive: new Color('#DDE6E2'), emissiveIntensity: poster ? 0.08 : 0.25, roughness: 0.3 });
  const pivotCube = new Mesh(new BoxGeometry(V * 1.8, V * 1.8, V * 1.8), pivotMaterial);
  beam.add(pivotCube);

  const hang = 9 * V;
  const pans = ([-1, 1] as const).map(side => {
    const yes = side < 0;
    const holder = new Group();
    holder.position.x = side * ARM;
    beam.add(holder);
    const rods: Voxel[] = [];
    for (let y = 1; y <= 8; y++) rods.push({ x: 0, y: -y, z: 0, color: NIGHT.stand, sx: 0.35, sy: 1, sz: 0.35 });
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      if (x * x + z * z > 14) continue;
      rods.push({ x, y: -9, z, color: NIGHT.pan });
      if (x * x + z * z > 9) rods.push({ x, y: -8, z, color: NIGHT.pan, sx: 0.7, sy: 0.7, sz: 0.7 });
    }
    holder.add(voxelMesh(rods, box, matte));
    const coreMaterial = new MeshStandardMaterial({ color: '#081510', emissive: new Color(yes ? NIGHT.yesCore : NIGHT.noCore), emissiveIntensity: 1.2 });
    const shellMaterial = glassMaterial(yes ? NIGHT.yes : NIGHT.no, env.texture);
    const cores = new InstancedMesh(box, coreMaterial, PILE_MAX);
    const shells = new InstancedMesh(box, shellMaterial, PILE_MAX);
    shells.renderOrder = 2;
    cores.count = 0;
    shells.count = 0;
    const pile = new Group();
    pile.position.y = -hang + V * 0.5 + PILE_STEP * 0.5;
    pile.add(cores, shells);
    holder.add(pile);
    // The pile lights the woods around it.
    const light = new PointLight(yes ? NIGHT.yesCore : NIGHT.noCore, 1, 4.5, 1.6);
    light.position.y = -hang + 0.25;
    holder.add(light);
    return { holder, cores, shells, coreMaterial, shellMaterial, light, drop: new Float32Array(PILE_MAX) };
  });

  const camera = new PerspectiveCamera(26, 1, 0.1, 80);
  const target = new Vector3(0, 0.75, 0);
  const view = { yaw: 0.3, pitch: 0.92, distance: 12.5, shift: 0 };
  const pointer = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 };
  const spring = { x: 0, v: 0, target: 0 };
  const MAX_TILT = 0.38;
  // The still and the live scene share a starting state: four glass cubes
  // glowing in each pan. The live scene then drops in the rest of the price.
  const PILE_BASE = 4;
  let counts = [PILE_BASE, PILE_BASE];
  let glowYes = 0.5;
  const helper = new Object3D();

  function layoutPiles(yes: number) {
    const yesCount = Math.max(1, Math.min(PILE_MAX - 1, Math.round(yes * PILE_MAX)));
    const next = [yesCount, PILE_MAX - yesCount];
    pans.forEach((pan, index) => {
      const previous = counts[index];
      pan.cores.count = next[index];
      pan.shells.count = next[index];
      for (let i = 0; i < next[index]; i++) pan.drop[i] = !reduced && i >= previous ? 1.2 + (i - previous) * 0.12 : 0;
    });
    counts = next;
  }

  function writePiles() {
    for (const pan of pans) {
      for (let i = 0; i < pan.shells.count; i++) {
        const [x, y, z] = PILE[i];
        helper.position.set(x * PILE_STEP, y * PILE_STEP + pan.drop[i] * 0.4, z * PILE_STEP);
        helper.scale.setScalar(PILE_SIZE);
        helper.updateMatrix();
        pan.shells.setMatrixAt(i, helper.matrix);
        helper.scale.setScalar(PILE_SIZE * 0.5);
        helper.updateMatrix();
        pan.cores.setMatrixAt(i, helper.matrix);
      }
      pan.shells.instanceMatrix.needsUpdate = true;
      pan.cores.instanceMatrix.needsUpdate = true;
    }
  }

  function place() {
    const yaw = view.yaw + pointer.yaw;
    const pitch = view.pitch + pointer.pitch;
    const t = target.clone();
    // On wide stages the clearing sits right of centre, leaving the darker
    // woods on the left for the headline.
    t.x += view.shift * Math.cos(yaw);
    t.z -= view.shift * Math.sin(yaw);
    camera.position.set(
      t.x + Math.sin(yaw) * Math.cos(pitch) * view.distance,
      t.y + Math.sin(pitch) * view.distance,
      t.z + Math.cos(yaw) * Math.cos(pitch) * view.distance,
    );
    camera.lookAt(t);
    beam.rotation.z = spring.x;
    for (const pan of pans) pan.holder.rotation.z = -spring.x;
    // Light follows price: the dearer side glows brighter, and breathes a
    // little while the scene is alive.
    const [yesPan, noPan] = pans;
    // Time stops when the ambient pass ends, so the breath holds its value
    // instead of snapping.
    const breathYes = 1 + 0.06 * Math.sin(time.value * 1.6);
    const breathNo = 1 + 0.06 * Math.sin(time.value * 1.6 + 2.1);
    yesPan.coreMaterial.emissiveIntensity = (0.5 + glowYes * 1.6) * breathYes;
    noPan.coreMaterial.emissiveIntensity = (0.5 + (1 - glowYes) * 1.6) * breathNo;
    yesPan.light.intensity = (0.3 + glowYes * 2.2) * breathYes;
    noPan.light.intensity = (0.25 + (1 - glowYes) * 1.6) * breathNo;
    // Clouds drift east and wrap around the forest.
    sky.position.x = ((time.value * 0.11) % SKY_PERIOD) + 4;
    tileYes.emissiveIntensity = glowYes * 0.05;
    tileNo.emissiveIntensity = (1 - glowYes) * 0.03;
  }

  let frame = 0;
  let last = 0;
  let lastDraw = 0;
  let visible = true;
  let disposed = false;
  // The woods move for a few seconds at a time (WCAG 2.2.2): on arrival, when
  // the stage scrolls back into view, when the pointer moves over it and when
  // another market is weighed. The last second slows to a stop.
  const AMBIENT_SECONDS = 5;
  let ambientLeft = AMBIENT_SECONDS;
  let slowDevice = false;
  let ambient = !reduced && !poster;
  function wake() {
    if (reduced || poster || slowDevice || disposed) return;
    ambientLeft = AMBIENT_SECONDS;
    ambient = true;
    request();
  }
  const slow = { frames: 0, total: 0 };
  function step(now: number) {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 15);
    last = now;
    if (ambient) {
      time.value += dt * Math.min(1, ambientLeft);
      ambientLeft -= dt;
      if (ambientLeft <= 0) ambient = false;
    }
    // Under-damped spring (zeta 0.62, about 0.8 s to settle).
    const w = 7.5, zeta = 0.62;
    const a = -2 * zeta * w * spring.v - w * w * (spring.x - spring.target);
    spring.v += a * dt;
    spring.x += spring.v * dt;
    pointer.yaw = MathUtils.damp(pointer.yaw, pointer.tyaw, 4, dt);
    pointer.pitch = MathUtils.damp(pointer.pitch, pointer.tpitch, 4, dt);
    let dropping = false;
    for (const pan of pans) for (let i = 0; i < pan.shells.count; i++) {
      if (pan.drop[i] > 0) { pan.drop[i] = Math.max(0, pan.drop[i] - dt * 3.2); dropping = true; }
    }
    const settled = Math.abs(spring.x - spring.target) < 0.0005 && Math.abs(spring.v) < 0.0005
      && Math.abs(pointer.yaw - pointer.tyaw) < 0.0005 && Math.abs(pointer.pitch - pointer.tpitch) < 0.0005 && !dropping;
    // While something is moving, draw every frame; in ambient-only time, at
    // most 30 frames a second.
    if (!settled || now - lastDraw >= 33) {
      const started = performance.now();
      writePiles();
      place();
      renderer.render(scene, camera);
      lastDraw = now;
      if (ambient && settled) {
        slow.frames++;
        slow.total += performance.now() - started;
        // A device that needs more than 24 ms of main-thread time per ambient
        // frame keeps the scene still between data changes.
        if (slow.frames === 90 && slow.total / slow.frames > 24) { ambient = false; slowDevice = true; sky.visible = false; renderOnce(); }
      }
    }
    if (!settled || ambient) request();
  }
  function request() {
    if (frame || !visible || disposed) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  }
  function renderOnce() { if (disposed) return; writePiles(); place(); renderer.render(scene, camera); }

  function resize() {
    if (disposed) return;
    const { width, height } = container.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const wide = camera.aspect > 1.3;
    view.shift = wide ? -Math.min(2.2, (camera.aspect - 1.3) * 2.2) : 0;
    view.distance = wide ? 12.5 : 12.5 * 1.2 / Math.max(camera.aspect, 0.62);
    camera.updateProjectionMatrix();
    if (reduced) renderOnce(); else request();
  }

  function setYes(price: number) {
    if (disposed) return;
    const yes = Math.min(0.99, Math.max(0.01, price));
    spring.target = (yes - (1 - yes)) * MAX_TILT;
    glowYes = yes;
    layoutPiles(yes);
    if (reduced) { spring.x = spring.target; spring.v = 0; for (const pan of pans) pan.drop.fill(0); renderOnce(); } else { wake(); request(); }
  }

  const resizer = new ResizeObserver(resize);
  resizer.observe(container);
  const observer = new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was) wake();
    if (visible) request();
  });
  observer.observe(container);
  const onVisibility = () => { visible = document.visibilityState === 'visible'; if (visible) request(); };
  document.addEventListener('visibilitychange', onVisibility);
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || reduced) return;
    const rect = container.getBoundingClientRect();
    pointer.tyaw = ((event.clientX - rect.left) / rect.width - 0.5) * 0.16;
    pointer.tpitch = ((event.clientY - rect.top) / rect.height - 0.5) * -0.05;
    if (event.clientY >= rect.top && event.clientY <= rect.bottom) wake();
    request();
  };
  const onLeave = () => { pointer.tyaw = 0; pointer.tpitch = 0; request(); };
  window.addEventListener('pointermove', onPointer);
  document.addEventListener('pointerleave', onLeave);
  const onLost = (event: Event) => event.preventDefault();
  const onRestored = () => renderOnce();
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const handle: ScaleHandle = {
    setYes,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizer.disconnect();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse(object => {
        if (object instanceof InstancedMesh) object.dispose();
        if (object instanceof Mesh) object.geometry.dispose();
      });
      [matte, woods, shadowOnly, tileYes, tileNo, tileMiddle, pivotMaterial, ...pans.flatMap(pan => [pan.coreMaterial, pan.shellMaterial])].forEach(material => material.dispose());
      box.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };

  // A software rasterizer means the device cannot animate this smoothly: keep
  // the still picture. Shaders compile first, then one finished frame is
  // timed; a frame slower than a few display frames also keeps the picture.
  const gl = renderer.getContext();
  const fallback = () => { handle.dispose(); options.onFallback?.(); };
  if (!allowSoftware && isSoftware(renderer)) {
    fallback();
    return { setYes() { /* still picture only */ }, dispose() { /* already released */ } };
  }
  spring.x = 0;
  setYes(options.yes);
  resize();
  void renderer.compileAsync(scene, camera).catch(() => undefined).then(() => {
    if (disposed) return;
    const started = performance.now();
    renderOnce();
    gl.finish();
    if (!allowSoftware && performance.now() - started > 120) { fallback(); return; }
    if (poster) {
      // The still shows the balance level with the four base cubes glowing in
      // each pan, so the picture keeps its meaning without WebGL; the live
      // scene starts from the same state.
      spring.x = 0;
      glowYes = 0.5;
      for (const pan of pans) { pan.cores.count = PILE_BASE; pan.shells.count = PILE_BASE; pan.drop.fill(0); }
      writePiles();
      place();
      beam.rotation.z = 0;
      for (const pan of pans) pan.holder.rotation.z = 0;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const anchor = new Vector3(0, 0.05, 0).project(camera);
      const top = new Vector3(0, 21.5 * V, 0).project(camera);
      Object.assign(window, { __67poster: { image: canvas.toDataURL('image/webp', 0.8), anchor: [(anchor.x + 1) / 2, (1 - anchor.y) / 2], top: (1 - top.y) / 2 } });
    }
    options.onReady?.();
    request();
  });
  return handle;
}
