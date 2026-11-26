// A cheap check, before any three.js code loads, of whether this device can
// run the 3D scenes: a hardware WebGL context must exist. Sections whose
// layout depends on the answer (the four-calls story) use it to pick their
// final layout on first paint, so the page does not shift later when the
// scene itself would have fallen back.
let cached: boolean | null = null;

export function canRun3D(): boolean {
  if (cached !== null) return cached;
  try {
    const loopback = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname);
    if (loopback && localStorage.getItem('67.scale.software') === '1') return (cached = true);
  } catch { /* storage unavailable */ }
  try {
    const canvas = document.createElement('canvas');
    const options = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options)) as WebGLRenderingContext | null;
    if (!gl) return (cached = false);
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return (cached = !/swiftshader|llvmpipe|software|microsoft basic render/i.test(name));
  } catch {
    return (cached = false);
  }
}
