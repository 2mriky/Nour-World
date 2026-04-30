/**
 * webgl.js — Three.js WebGL Background Layer
 * Scene · Camera · Renderer · Void Particle System · Raycasting
 *
 * Rendering layer sits at z-index: -1 (behind all DOM).
 * Exposes window.webglApp for cross-module communication with app.js and shaders.js.
 */

import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const FOV          = 72;          // degrees — moderate FOV keeps text readable
const CAM_Z        = 5;           // camera Z distance from origin
const TEXT_SCALE   = 0.76;        // text world-width as fraction of visible viewport width
const PIXEL_STEP   = 4;           // sample every N pixels (lower = more particles, slower)
const MIN_BRIGHT   = 128;         // pixel brightness threshold (0–255)
const FORM_MS      = 2800;        // particle formation animation duration (ms)
const PARTICLE_SIZE = 2.8;        // base gl_PointSize in CSS pixels (scaled by DPR)

// Off-screen canvas resolution — drives text detail level
const SAMPLE_W = 1800;
const SAMPLE_H = 520;

// Void scatter extents in world units
const VOID_X = 26;
const VOID_Y = 16;
const VOID_Z = 14;

// ═══════════════════════════════════════════════════════════════
// INTERNAL STATE
// ═══════════════════════════════════════════════════════════════

let scene, camera, renderer;
let particlesMesh, particleUniforms;
let raycaster, ndcMouse, intersectPlane, pointLight;

const _s = {
  time:       0,        // cumulative elapsed seconds
  progress:   0.0,      // particle formation 0 → 1
  isForming:  false,
  isFormed:   false,
  readyToForm: false,   // guards against app.js calling formText before init
  formStart:  null,
  prevNow:    null,
};

// ═══════════════════════════════════════════════════════════════
// EXPOSED GLOBAL API  (consumed by app.js and shaders.js)
// ═══════════════════════════════════════════════════════════════

window.webglApp = {
  mouse3D:    new THREE.Vector3(),   // world-space mouse intersection
  pointLight: null,                  // fire-colored point light for Step 4
  scene:      null,                  // Three.js scene ref for Step 4 to add meshes
  camera:     null,                  // camera ref for Step 4
  formText:   _safeFormText,         // replaced after async init
};

// Safe wrapper used before the system is ready
function _safeFormText() {
  if (!_s.readyToForm) {
    setTimeout(_safeFormText, 80);
    return;
  }
  formText();
}

// ═══════════════════════════════════════════════════════════════
// 1.  THREE.JS CORE — Scene, Camera, Renderer
// ═══════════════════════════════════════════════════════════════

function initThree() {
  const canvas = document.getElementById('webgl-canvas');

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    FOV,
    window.innerWidth / window.innerHeight,
    0.01,
    500
  );
  camera.position.z = CAM_Z;

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias:        false,   // not needed for additive point sprites
    alpha:            true,    // transparent — CSS --bg (#080808) shows through
    powerPreference:  'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);   // fully transparent clear

  // Share refs so Step 4 (shaders.js) can add objects
  window.webglApp.scene  = scene;
  window.webglApp.camera = camera;
}

// ═══════════════════════════════════════════════════════════════
// 2.  PARTICLE VOID SYSTEM
// ═══════════════════════════════════════════════════════════════

async function buildParticleSystem() {
  // A)  Sample text pixels from hidden 2D canvas
  const { textPositions, count } = await _sampleTextPixels();

  if (count === 0) {
    console.warn('[webgl] No text pixels sampled — font may not be loaded.');
    return;
  }

  // B)  Generate per-particle void (chaos) positions & random seeds
  const voidPositions = new Float32Array(count * 3);
  const seeds         = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    voidPositions[i * 3]     = (Math.random() - 0.5) * VOID_X;
    voidPositions[i * 3 + 1] = (Math.random() - 0.5) * VOID_Y;
    voidPositions[i * 3 + 2] = (Math.random() - 0.5) * VOID_Z;
    seeds[i]                  = Math.random();
  }

  // C)  BufferGeometry
  const geo = new THREE.BufferGeometry();

  // `position` drives Three.js frustum culling & gl_Position via attribute
  // We seed it with void positions; the vertex shader interpolates to text
  geo.setAttribute('position',  new THREE.BufferAttribute(voidPositions.slice(), 3));
  geo.setAttribute('aVoidPos',  new THREE.BufferAttribute(voidPositions, 3));
  geo.setAttribute('aTextPos',  new THREE.BufferAttribute(textPositions, 3));
  geo.setAttribute('aSeed',     new THREE.BufferAttribute(seeds, 1));

  // D)  Shader uniforms
  particleUniforms = {
    uProgress:  { value: 0.0 },
    uTime:      { value: 0.0 },
    uSize:      { value: PARTICLE_SIZE * Math.min(window.devicePixelRatio, 1.5) },
    uWhite:     { value: new THREE.Color(0xebebeb) },   // --white
    uFire:      { value: new THREE.Color(0xe07848) },   // --fire
    uGlow:      { value: new THREE.Color(0xf0a070) },   // --glow
    uMouse3D:   { value: new THREE.Vector3() },
  };

  // E)  ShaderMaterial — Step 4 (shaders.js) will extend with Flashcore uniforms
  const mat = new THREE.ShaderMaterial({
    uniforms:       particleUniforms,
    vertexShader:   PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,   // glowing additive particles
  });

  particlesMesh = new THREE.Points(geo, mat);
  scene.add(particlesMesh);

  // Expose material uniforms so shaders.js can add to them in Step 4
  window.webglApp.particleUniforms = particleUniforms;
  window.webglApp.particlesMesh    = particlesMesh;
}

// ── Hidden 2D Canvas — Text pixel sampler ─────────────────────
//
// Technique:
//  1. Create off-screen canvas (never added to DOM)
//  2. Render "NOUR MOHAMED" in Syne 800 font, white on black
//  3. getImageData → scan for bright pixels at step intervals
//  4. Map pixel (px, py) → world (wx, wy, 0)

async function _sampleTextPixels() {
  // Calculate visible world dimensions at z=0 from the camera
  const vFOV   = (FOV * Math.PI) / 180;
  const visH   = 2 * Math.tan(vFOV / 2) * CAM_Z;
  const visW   = visH * (window.innerWidth / window.innerHeight);
  const worldW = visW * TEXT_SCALE;
  const worldH = (SAMPLE_H / SAMPLE_W) * worldW;   // maintain canvas aspect

  // Off-screen canvas
  const oc      = document.createElement('canvas');
  oc.width      = SAMPLE_W;
  oc.height     = SAMPLE_H;
  const ctx     = oc.getContext('2d', { willReadFrequently: true });

  // Black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SAMPLE_W, SAMPLE_H);

  // Auto-fit font: ensure "MOHAMED" (widest word) fills ~88% of canvas width
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#fff';

  let fontSize = 220;
  ctx.font = `800 ${fontSize}px 'Syne', sans-serif`;

  const testW = ctx.measureText('MOHAMED').width;
  if (testW > SAMPLE_W * 0.88) {
    fontSize = Math.floor(fontSize * (SAMPLE_W * 0.88) / testW);
    ctx.font = `800 ${fontSize}px 'Syne', sans-serif`;
  }

  // Two-line layout — mirrors the DOM hero with line-height 0.9
  const line1Y = SAMPLE_H * 0.31;   // "NOUR"    — upper third
  const line2Y = SAMPLE_H * 0.73;   // "MOHAMED" — lower third

  ctx.fillText('NOUR',    SAMPLE_W / 2, line1Y);
  ctx.fillText('MOHAMED', SAMPLE_W / 2, line2Y);

  // Pixel scan
  const imgData   = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  const rawCoords = [];

  for (let py = 0; py < SAMPLE_H; py += PIXEL_STEP) {
    for (let px = 0; px < SAMPLE_W; px += PIXEL_STEP) {
      const idx = (py * SAMPLE_W + px) * 4;
      if (imgData[idx] < MIN_BRIGHT) continue;   // skip black/gray pixels

      // Map pixel coords → 3D world space
      // x:  left-to-right,  y: flipped (canvas Y is down, world Y is up)
      rawCoords.push(
        (px / SAMPLE_W - 0.5) * worldW,   // wx
        -(py / SAMPLE_H - 0.5) * worldH,  // wy  (negated = flip Y)
        0                                  // wz  (text sits on the Z=0 plane)
      );
    }
  }

  // oc is now eligible for GC — never attached to the DOM
  return {
    textPositions: new Float32Array(rawCoords),
    count:         rawCoords.length / 3,
  };
}

// ═══════════════════════════════════════════════════════════════
// 3.  LIGHTING — Flashcore prep (Step 4 extends this)
// ═══════════════════════════════════════════════════════════════

function initLighting() {
  // Ultra-dim ambient — just enough to hint at scene depth
  const ambient = new THREE.AmbientLight(0xffffff, 0.04);
  scene.add(ambient);

  // Fire-tinted point light — follows mouse3D, intensity driven by Step 4 shaders
  // Starts at intensity 0 so it's invisible until activated by shaders.js
  pointLight = new THREE.PointLight(0xf0a070, 0, 20, 1.8);
  pointLight.position.set(0, 0, CAM_Z - 1.5);
  scene.add(pointLight);

  // Expose so shaders.js can set intensity on cursor hover
  window.webglApp.pointLight = pointLight;
}

// ═══════════════════════════════════════════════════════════════
// 4.  RAYCASTER — Mouse → 3D plane → Vector3
// ═══════════════════════════════════════════════════════════════

function initRaycaster() {
  raycaster = new THREE.Raycaster();
  ndcMouse  = new THREE.Vector2(0, 0);

  // Large invisible plane at z=0 — acts as the 3D interaction surface
  // Step 4 shaders read window.webglApp.mouse3D (the intersection point)
  const planeGeo = new THREE.PlaneGeometry(200, 200);
  const planeMat = new THREE.MeshBasicMaterial({
    visible:    false,
    side:       THREE.DoubleSide,
    depthWrite: false,
    depthTest:  false,
  });
  intersectPlane = new THREE.Mesh(planeGeo, planeMat);
  intersectPlane.position.z = 0;
  scene.add(intersectPlane);

  // Map DOM mouse → NDC every frame input
  window.addEventListener('mousemove', (e) => {
    ndcMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    ndcMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  // Touch support — normalize first touch point
  window.addEventListener('touchmove', (e) => {
    const t     = e.touches[0];
    ndcMouse.x  =  (t.clientX / window.innerWidth)  * 2 - 1;
    ndcMouse.y  = -(t.clientY / window.innerHeight) * 2 + 1;
  }, { passive: true });
}

function _updateRaycaster() {
  raycaster.setFromCamera(ndcMouse, camera);
  const hits = raycaster.intersectObject(intersectPlane);

  if (hits.length > 0) {
    const pt = hits[0].point;

    // Update global mouse3D reference (consumed by shaders.js in Step 4)
    window.webglApp.mouse3D.copy(pt);

    // Feed into particle shader uniform
    if (particleUniforms) {
      particleUniforms.uMouse3D.value.copy(pt);
    }

    // Move the Flashcore point light to follow the cursor in 3D space
    // Z offset toward camera so it illuminates the particle plane
    if (pointLight) {
      pointLight.position.set(pt.x, pt.y, 2.2);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 5.  formText() — Public trigger called by app.js onLoadComplete
// ═══════════════════════════════════════════════════════════════

function formText() {
  if (_s.isForming || _s.isFormed) return;
  _s.isForming = true;
  _s.formStart = performance.now();
}

// ═══════════════════════════════════════════════════════════════
// 6.  RESIZE
// ═══════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  if (particleUniforms) {
    particleUniforms.uSize.value =
      PARTICLE_SIZE * Math.min(window.devicePixelRatio, 1.5);
  }
});

// ═══════════════════════════════════════════════════════════════
// 7.  RENDER LOOP
// ═══════════════════════════════════════════════════════════════

function _renderLoop(now = 0) {
  requestAnimationFrame(_renderLoop);

  // Delta time (seconds)
  const dt    = _s.prevNow !== null ? Math.min((now - _s.prevNow) / 1000, 0.05) : 0;
  _s.prevNow  = now;
  _s.time    += dt;

  // ── Formation progress ─────────────────────────────────────
  if (_s.isForming && !_s.isFormed) {
    const elapsed = now - _s.formStart;
    _s.progress   = Math.min(elapsed / FORM_MS, 1.0);

    if (_s.progress >= 1.0) {
      _s.progress  = 1.0;
      _s.isFormed  = true;
      _s.isForming = false;
    }
  }

  // ── Push uniforms every frame ──────────────────────────────
  if (particleUniforms) {
    particleUniforms.uTime.value     = _s.time;
    particleUniforms.uProgress.value = _s.progress;
  }

  // ── Raycaster: update mouse3D & pointLight position ────────
  _updateRaycaster();

  // ── Draw ───────────────────────────────────────────────────
  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════════
// INLINE SHADERS
// Step 4 (shaders.js) will replace the particle material's shaders
// with the full Flashcore/marble reveal versions.  These are the
// foundation: void scatter, formation lerp, soft circular sprites.
// ═══════════════════════════════════════════════════════════════

const PARTICLE_VERT = /* glsl */`
  // ─── Attributes ───────────────────────────────────────────
  attribute vec3  aVoidPos;   // chaotic scatter position
  attribute vec3  aTextPos;   // text-formation target position
  attribute float aSeed;      // per-particle random [0, 1]

  // ─── Uniforms ─────────────────────────────────────────────
  uniform float uProgress;    // global formation progress [0, 1]
  uniform float uTime;        // elapsed seconds
  uniform float uSize;        // base point size (CSS px × DPR)
  uniform vec3  uMouse3D;     // 3D cursor position on z=0 plane

  // ─── Varyings ─────────────────────────────────────────────
  varying float vSeed;
  varying float vFormed;      // per-particle eased formation [0, 1]
  varying float vMouseDist;   // distance from mouse (for Step 4 glow)

  // Ease-out quart — sharp deceleration at target
  float easeOutQuart(float t) {
    float inv = 1.0 - t;
    return 1.0 - inv * inv * inv * inv;
  }

  void main() {
    vSeed = aSeed;

    // ── Staggered arrival ─────────────────────────────────
    // Each particle begins its journey at a slightly different
    // progress value (0–20% random offset) so they don't all
    // arrive at once — gives the "gathering" swarm effect.
    float window    = 0.78;                               // active window
    float offset    = aSeed * (1.0 - window);             // stagger offset
    float localT    = clamp((uProgress - offset) / window, 0.0, 1.0);
    float eased     = easeOutQuart(localT);
    vFormed         = eased;

    // ── Void oscillation (fades away as particle forms) ───
    // Particles breathe gently in the void before formation.
    float voidAmt = (1.0 - eased) * 0.14;
    vec3 wobble   = vec3(
      sin(uTime * 0.52 + aSeed * 6.28318) * voidAmt,
      cos(uTime * 0.38 + aSeed * 5.17720) * voidAmt,
      sin(uTime * 0.28 + aSeed * 4.18879) * voidAmt * 0.6
    );

    vec3 pos  = mix(aVoidPos, aTextPos, eased) + wobble;

    // ── Mouse proximity (exposed to fragment for Step 4) ──
    vMouseDist = distance(pos.xy, uMouse3D.xy);

    // ── Perspective point size scaling ────────────────────
    // Points further from camera appear smaller naturally.
    vec4 mvPos   = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uSize * (300.0 / -mvPos.z);

    gl_Position = projectionMatrix * mvPos;
  }
`;

const PARTICLE_FRAG = /* glsl */`
  precision mediump float;

  // ─── Uniforms ─────────────────────────────────────────────
  uniform float uProgress;
  uniform float uTime;
  uniform vec3  uWhite;      // #ebebeb
  uniform vec3  uFire;       // #e07848
  uniform vec3  uGlow;       // #f0a070

  // ─── Varyings ─────────────────────────────────────────────
  varying float vSeed;
  varying float vFormed;
  varying float vMouseDist;

  void main() {
    // ── Soft circular sprite ──────────────────────────────
    // gl_PointCoord is (0,0) top-left → (1,1) bottom-right of the sprite quad.
    vec2  uv   = gl_PointCoord - 0.5;
    float d    = length(uv);
    if (d > 0.5) discard;                         // clip to circle

    // Smooth edge falloff — Gaussian-like softness
    float alpha = smoothstep(0.50, 0.18, d);

    // ── Brightness ────────────────────────────────────────
    // Void particles are dim (0.25) — formed particles are bright (1.0)
    float brightness = mix(0.25, 1.0, vFormed);

    // ── Color: fire during formation rush, white when settled ─
    // colorT advances ahead of vFormed so the color change
    // appears to lead the particle's arrival.
    float colorT = clamp((uProgress - vSeed * 0.25) * 3.5, 0.0, 1.0);
    vec3  col    = mix(uFire, uWhite, colorT);

    // ── Subtle mouse-proximity glow ──────────────────────
    // Particles near the cursor pick up a faint fire tint.
    // Step 4 shaders.js will replace this with the full Flashcore
    // material reveal effect.
    float proximity = smoothstep(1.8, 0.0, vMouseDist);
    col = mix(col, uGlow, proximity * vFormed * 0.45);

    gl_FragColor = vec4(col, alpha * brightness);
  }
`;

// ═══════════════════════════════════════════════════════════════
// BOOT  — async because we await document.fonts.ready
// ═══════════════════════════════════════════════════════════════

async function init() {
  initThree();
  initRaycaster();
  initLighting();

  // Guarantee Syne 800 is rasterized before we draw it to the canvas.
  // The importmap script is deferred, so fonts may or may not be ready yet.
  await document.fonts.ready;

  // Extra safety: if Syne specifically isn't loaded, wait for it
  if (!document.fonts.check("800 1em 'Syne'")) {
    try {
      await document.fonts.load("800 1em 'Syne'");
    } catch {
      console.warn('[webgl] Syne font failed to load — falling back to serif.');
    }
  }

  await buildParticleSystem();

  // Mark as ready — _safeFormText will now forward to the real formText
  _s.readyToForm = true;

  // Replace the safe wrapper with the real function
  window.webglApp.formText = formText;

  // Kick off the render loop
  _renderLoop();
}

init().catch(err => console.error('[webgl] Init failed:', err));
