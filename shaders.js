/**
 * shaders.js — Flashcore Material System
 *
 * Attaches a fullscreen background ShaderMesh (renderOrder -1) to the
 * Three.js scene initialised in webgl.js. Particle system from Step 3
 * sits on top at renderOrder 1.
 *
 * Effects delivered:
 *   · Procedural Nero Marquina marble — FBM with two-pass domain warping
 *   · Flashcore spotlight mask — harsh camera-flash reveal via uMouse2D
 *   · Fluid ripple UV distortion — sine-wave displacement driven by mouse velocity
 *   · uHoverState (0→1) — vault / card hover intensifies the liquid surface
 */

import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SPOT_RADIUS   = 0.26;   // Flashcore radius — UV space, aspect-corrected
const HOVER_SPEED   = 3.8;    // lerp rate for uHoverState  (s⁻¹)
const MOUSE_LERP_K  = 0.09;   // per-frame mouse position lerp (ripple lag)
const POLL_INTERVAL = 50;     // ms between webgl-ready polls
const POLL_MAX      = 120;    // max poll attempts (~6 seconds)

// ═══════════════════════════════════════════════════════════════
// MODULE STATE
// ═══════════════════════════════════════════════════════════════

let bgUniforms = null;
let bgMesh     = null;

// Raw mouse (updated by event — Y-flipped to WebGL bottom-left origin)
const mouse      = { x: -0.5, y: -0.5 };  // -0.5 → off-screen until first move
const prevMouse  = { x: -0.5, y: -0.5 };  // previous frame position (for velocity)
const rippleMouse = { x: -0.5, y: -0.5 }; // lerped mouse used only by ripple

let isHovering = false;
let hoverState = 0.0;   // current lerped uHoverState value

let time    = 0;
let prevNow = null;

// ═══════════════════════════════════════════════════════════════
// GLSL — BACKGROUND VERTEX SHADER
// Pass-through: the plane fills the visible frustum.
// All coordinate work happens in the fragment shader via gl_FragCoord.
// ═══════════════════════════════════════════════════════════════

const BG_VERT = /* glsl */`
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════════
// GLSL — BACKGROUND FRAGMENT SHADER
// ═══════════════════════════════════════════════════════════════

const BG_FRAG = /* glsl */`
  precision highp float;

  // ── Uniforms ────────────────────────────────────────────────
  uniform float uTime;
  uniform vec2  uMouse2D;    // screen UV [0,1], Y=0 at bottom (WebGL convention)
  uniform vec2  uMouseVel;   // per-frame position delta — drives ripple amplitude
  uniform float uHoverState; // 0 = idle  ·  1 = hovering vault / project cards
  uniform vec2  uResolution; // viewport in physical pixels
  uniform float uSpotRadius; // Flashcore radius, UV space, aspect-corrected

  // ═══════════════════════════════════════════════════════════
  // HASH & NOISE PRIMITIVES
  // ═══════════════════════════════════════════════════════════

  // Bijective hash — zero arithmetic patterns, GPU-friendly
  float hash21(vec2 p) {
    p = fract(p * vec2(127.619, 157.583));
    p += dot(p, p + 41.73);
    return fract(p.x * p.y);
  }

  // Value noise — quintic (C²) interpolation eliminates derivative seams
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);  // quintic smoothstep

    return mix(
      mix(hash21(i),               hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // ═══════════════════════════════════════════════════════════
  // FBM — Fractional Brownian Motion
  //
  // Domain rotation matrix breaks up axis-aligned grid banding.
  // Using a non-orthogonal matrix (scaled rotation) amplifies
  // the frequency gain while preserving the angular distribution.
  // ═══════════════════════════════════════════════════════════

  // ~37° rotation × 2.0 scale — creates organic asymmetry between octaves
  const mat2 M = mat2(1.60,  1.20, -1.20, 1.60);

  // Full FBM — 5 octaves for primary marble field
  float fbm5(vec2 p) {
    float v = 0.0, a = 0.50;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = M * p; a *= 0.50; }
    return v;
  }

  // Lightweight FBM — 3 octaves for warp vectors (keeps fill rate manageable)
  float fbm3(vec2 p) {
    float v = 0.0, a = 0.50;
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = M * p; a *= 0.50; }
    return v;
  }

  // ═══════════════════════════════════════════════════════════
  // NERO MARQUINA MARBLE
  //
  // Two-pass domain warping — the industry-standard technique for
  // realistic marble without texture maps:
  //
  //  q = fbm(p)             ← first warp vector field
  //  r = fbm(p + α·q)       ← second warp (warps the warp)
  //  f = fbm5(p + β·r)      ← primary marble field in double-warped domain
  //
  // The resulting field f has the chaotic, flowing complexity of
  // natural stone without any repeating tile seams.
  //
  // Vein extraction uses abs(sin(f·freq + offset)) — the absolute sine
  // creates symmetric ridges at regular intervals in the field,
  // which correspond to the bright veins of the marble.
  // Multiple frequencies = primary + hairline vein hierarchy.
  // ═══════════════════════════════════════════════════════════

  vec3 neroMarquina(vec2 screenUV) {
    float aspect = uResolution.x / uResolution.y;

    // Scale: aspect-corrected so marble density is viewport-independent
    vec2 p = screenUV * vec2(aspect, 1.0) * 3.5;

    // ── Domain warp pass 1 ────────────────────────────────
    // Two orthogonal fbm samples form a 2D warp vector field q.
    // The offset vec2s break the symmetry so q.x and q.y diverge.
    vec2 q = vec2(
      fbm3(p + vec2(0.00, 0.00)),
      fbm3(p + vec2(3.70, 7.30))
    );

    // ── Domain warp pass 2 ────────────────────────────────
    // Warping with q before sampling r gives the recursive
    // "marble-flowing-into-itself" structure.
    vec2 r = vec2(
      fbm3(p + 2.5 * q + vec2(1.70, 9.20)),
      fbm3(p + 2.5 * q + vec2(8.30, 2.80))
    );

    // ── Primary marble field ──────────────────────────────
    float f = fbm5(p + 3.2 * r);

    // ── Vein extraction ───────────────────────────────────
    // Bold primary veins — coarse frequency
    float v1 = abs(sin(f * 6.8  + p.x * 1.6));
    // Thin secondary hairlines — fine frequency, weighted lower
    float v2 = abs(sin(f * 12.5 + q.x * 3.8)) * 0.52;
    // Sweeping background veins — very coarse, adds character
    float v3 = abs(sin(f * 3.5  - r.y * 2.4)) * 0.30;

    // Normalize and blend
    float vRaw = (v1 + v2 + v3) / (1.0 + 0.52 + 0.30);

    // Sharp threshold — Nero Marquina is ~92% black with crisp white veins.
    // A tight smoothstep range produces a hard edge (not a gradient).
    float vPrimary  = smoothstep(0.575, 0.638, vRaw);          // primary bold
    float vHairline = smoothstep(0.770, 0.792, vRaw) * 0.68;   // hairline traces
    float vGold     = smoothstep(0.830, 0.848, vRaw) * 0.42;   // rare gold accent
    float mVal      = clamp(vPrimary + vHairline + vGold, 0.0, 1.0);

    // ── Color ─────────────────────────────────────────────
    vec3 cVoid   = vec3(0.010, 0.010, 0.014);   // jet black — deeper than --bg
    vec3 cSilver = vec3(0.840, 0.862, 0.902);   // silver-white primary veins
    vec3 cGold   = vec3(0.920, 0.758, 0.448);   // warm gold accent
    vec3 cFire   = vec3(0.878, 0.472, 0.282);   // --ember tone, rare whisper

    // Natural vein color variation: cool silver → warm gold along vein axis
    float warmth = vnoise(p * 0.38 + vec2(17.4, 5.1));
    vec3 veinCol = mix(cSilver, cGold, clamp(warmth * 0.55 * mVal, 0.0, 1.0));

    // Fire whisper — echoes the --fire palette for brand coherence
    float fireWhisper = vnoise(p * 0.22 + vec2(83.1)) * mVal * vGold;
    veinCol = mix(veinCol, cFire, fireWhisper * 1.6);

    return mix(cVoid, veinCol, mVal);
  }

  // ═══════════════════════════════════════════════════════════
  // FLASHCORE SPOTLIGHT
  //
  // Not a soft glow — a harsh, calculated exposure event.
  // The Flashcore aesthetic: surgical illumination with an abrupt
  // boundary, as if a studio strobe fired at point-blank range.
  //
  // Two-zone structure:
  //   · Epicenter (0 → inner*0.35): slight overexposure (+25%)
  //     — the blown-out center of a real camera flash
  //   · Inner (inner*0.35 → inner): full marble reveal
  //   · Outer (inner → outer):  tight smoothstep falloff to black
  //   · Beyond outer: absolute void
  // ═══════════════════════════════════════════════════════════

  float flashcoreSpot(vec2 screenUV, vec2 mouseUV) {
    float aspect = uResolution.x / uResolution.y;

    // Aspect-correct so the spotlight is a true circle at any window ratio
    vec2  d    = (screenUV - mouseUV) * vec2(aspect, 1.0);
    float dist = length(d);

    float inner = uSpotRadius * 0.44;
    float outer = uSpotRadius;

    // Main spotlight: sharp boundary
    float spot  = 1.0 - smoothstep(inner, outer, dist);

    // Epicenter overexposure — blown-out centre of a camera flash
    float epiR  = inner * 0.38;
    float overexp = (1.0 - smoothstep(0.0, epiR, dist)) * 0.28;
    spot = clamp(spot + overexp, 0.0, 1.3);

    // Gamma curve: compresses midtones, sharpens the boundary
    spot = pow(spot, 2.1);

    return spot;
  }

  // ═══════════════════════════════════════════════════════════
  // FLUID RIPPLE DISPLACEMENT
  //
  // Simulates a pool of dark liquid disturbed by the cursor.
  // The ripple is a radially-propagating sine wave that decays
  // exponentially with distance from the mouse.
  //
  // Amplitude is proportional to mouse speed — a motionless cursor
  // produces zero ripple (the surface settles).
  //
  // uHoverState (1.0 when over vault/cards) raises the frequency
  // and slows spatial decay, making the "liquid" more volatile —
  // like a thin mercury surface vs a deep ocean.
  // ═══════════════════════════════════════════════════════════

  vec2 fluidRipple(vec2 screenUV, vec2 mouseUV, vec2 mouseVel, float hover, float t) {
    float aspect = uResolution.x / uResolution.y;

    // Direction from mouse to current fragment (aspect-corrected)
    vec2  toMouse = (screenUV - mouseUV) * vec2(aspect, 1.0);
    float d       = length(toMouse);

    // Mouse speed scalar — per-frame delta is tiny, scale up for effect
    float speed   = length(mouseVel) * 58.0;
    float spd     = clamp(speed, 0.0, 1.0);

    // Wave parameters — hover shifts from "deep pool" to "thin mercury"
    float freq   = 18.0 + hover * 22.0;
    float decay  = exp(-d * (5.2 - hover * 1.8));   // hover = wider rings
    float wave   = sin(d * freq - t * 5.6) * decay;

    // Amplitude: zero when still, peaks at fast movement, boosted by hover
    float amp = spd * 0.017 * (1.0 + hover * 2.8);

    // Normalize direction safely
    vec2 dir = normalize(toMouse + vec2(0.00001, 0.0));

    return dir * wave * amp;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════════

  void main() {

    // ── Screen UV ─────────────────────────────────────────────
    // gl_FragCoord: (0,0) = bottom-left pixel.
    // uMouse2D Y is already flipped from DOM coords.
    // Both are in the same WebGL UV space ✓
    vec2 screenUV = gl_FragCoord.xy / uResolution;

    // ── 1. Fluid ripple — distort the UV before marble sampling ──
    vec2 ripple   = fluidRipple(screenUV, uMouse2D, uMouseVel, uHoverState, uTime);
    vec2 marbleUV = screenUV + ripple;

    // ── 2. Procedural Nero Marquina marble ────────────────────
    vec3 marble = neroMarquina(marbleUV);

    // ── 3. Flashcore spotlight mask ───────────────────────────
    float spot = flashcoreSpot(screenUV, uMouse2D);

    // ── 4. Reveal: marble × spotlight ─────────────────────────
    // Outside the spotlight radius → absolute black void.
    // The marble exists only in the light. This is the Flashcore law.
    vec3 color = marble * spot;

    // ── 5. Ultra-dim ambient ──────────────────────────────────
    // A 0.4% whisper of marble everywhere — the surface feels alive
    // even in darkness, hinting at depth without revealing it.
    vec3 ambient = neroMarquina(marbleUV + vec2(43.7, 91.2)) * 0.004;
    color += ambient;

    // ── 6. Vignette ───────────────────────────────────────────
    // Deepens the corners, reinforces the void aesthetic.
    float vg = screenUV.x * (1.0 - screenUV.x) *
               screenUV.y * (1.0 - screenUV.y);
    vg = pow(clamp(vg * 16.0, 0.0, 1.0), 0.50);
    color *= vg;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════════
// CREATE BACKGROUND PLANE
// ═══════════════════════════════════════════════════════════════

function createBackground(scene, camera) {
  // A 100×100 world-unit plane at z=-2 always covers the entire
  // viewport regardless of aspect ratio or resize.
  // UV work happens in the fragment via gl_FragCoord — geometry size
  // is irrelevant to the marble sampling coordinate system.
  const geo = new THREE.PlaneGeometry(100, 100);

  bgUniforms = {
    uTime:       { value: 0.0 },
    uMouse2D:    { value: new THREE.Vector2(-0.5, -0.5) },   // off-screen until first move
    uMouseVel:   { value: new THREE.Vector2(0.0,   0.0) },
    uHoverState: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uSpotRadius: { value: SPOT_RADIUS },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms:       bgUniforms,
    vertexShader:   BG_VERT,
    fragmentShader: BG_FRAG,
    transparent:    false,   // opaque — it IS the void
    depthWrite:     false,
    depthTest:      false,   // always behind everything; renderOrder handles order
  });

  bgMesh             = new THREE.Mesh(geo, mat);
  bgMesh.position.z  = -2;          // behind particle plane at z=0
  bgMesh.renderOrder = -1;          // drawn before particles (renderOrder 1 in webgl.js)
  scene.add(bgMesh);

  // Expose for external debug / future extension
  window.webglApp.bgUniforms = bgUniforms;
  window.webglApp.bgMesh     = bgMesh;

  // On resize: update resolution uniform only — no geometry rebuild needed
  window.addEventListener('resize', () => {
    if (!bgUniforms) return;
    bgUniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  });
}

// ═══════════════════════════════════════════════════════════════
// MOUSE TRACKING
// ═══════════════════════════════════════════════════════════════

function initMouseListeners() {
  // Desktop: mousemove
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX / window.innerWidth;
    // Flip Y: DOM y=0 is top, WebGL gl_FragCoord y=0 is bottom
    mouse.y = 1.0 - (e.clientY / window.innerHeight);
  });

  // Mobile: touchmove — first touch point drives the spotlight
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    mouse.x = t.clientX / window.innerWidth;
    mouse.y = 1.0 - (t.clientY / window.innerHeight);
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════
// HOVER LISTENERS — Vault track & project cards → uHoverState
// ═══════════════════════════════════════════════════════════════

function initHoverListeners() {
  function on()  { isHovering = true;  }
  function off() { isHovering = false; }

  // Vault inner track
  const vault = document.querySelector('.vault__track');
  if (vault) {
    vault.addEventListener('mouseenter', on);
    vault.addEventListener('mouseleave', off);
  }

  // Individual project cards
  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('mouseenter', on);
    card.addEventListener('mouseleave', off);
  });
}

// ═══════════════════════════════════════════════════════════════
// PER-FRAME UPDATE LOOP
// Runs its own RAF to push uniforms to the GPU every frame.
// webgl.js picks up the updated values at its next renderer.render() call.
// Single-threaded JS guarantees no race conditions between the two RAFs.
// ═══════════════════════════════════════════════════════════════

function lerp(a, b, t) { return a + (b - a) * t; }

function updateLoop(now = 0) {
  requestAnimationFrame(updateLoop);
  if (!bgUniforms) return;

  // Delta time — capped at 50ms to prevent jumps after tab visibility change
  const dt = prevNow !== null ? Math.min((now - prevNow) / 1000, 0.05) : 0;
  prevNow  = now;
  time    += dt;

  // ── Frame-rate-independent lerp coefficient ────────────────────────────
  // Converts a per-frame alpha to a dt-based one so the feel
  // is identical at 30fps and 144fps.
  const k = 1.0 - Math.pow(1.0 - MOUSE_LERP_K, dt * 60.0);

  // ── Ripple mouse: lerped for the "liquid drag" trailing feel ──────────
  rippleMouse.x = lerp(rippleMouse.x, mouse.x, k);
  rippleMouse.y = lerp(rippleMouse.y, mouse.y, k);

  // ── Per-frame mouse velocity (for ripple amplitude) ───────────────────
  // Computed as raw delta so it spikes when the mouse moves fast
  // and settles to zero when the mouse is still — exactly what we want.
  const velX = mouse.x - prevMouse.x;
  const velY = mouse.y - prevMouse.y;
  prevMouse.x = mouse.x;
  prevMouse.y = mouse.y;

  // ── Hover state lerp ──────────────────────────────────────────────────
  hoverState = lerp(hoverState, isHovering ? 1.0 : 0.0, dt * HOVER_SPEED);

  // ── Push to GPU uniforms ──────────────────────────────────────────────
  bgUniforms.uTime.value       = time;
  bgUniforms.uMouse2D.value.set(mouse.x, mouse.y);        // raw → sharp spotlight
  bgUniforms.uMouseVel.value.set(velX,   velY);           // delta → ripple amp
  bgUniforms.uHoverState.value = hoverState;
}

// ═══════════════════════════════════════════════════════════════
// RENDER ORDER GUARANTEE
// Particles (from webgl.js) must render AFTER the background.
// We set their renderOrder to 1 once the mesh is available.
// ═══════════════════════════════════════════════════════════════

function ensureParticleOrder() {
  if (window.webglApp?.particlesMesh) {
    window.webglApp.particlesMesh.renderOrder = 1;
    return;
  }
  // Particle mesh is built asynchronously (awaits font load) —
  // retry until it exists, then stop.
  const id = setInterval(() => {
    if (window.webglApp?.particlesMesh) {
      window.webglApp.particlesMesh.renderOrder = 1;
      clearInterval(id);
    }
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// INIT — Poll for webgl.js scene, then bootstrap
// ═══════════════════════════════════════════════════════════════

function waitForWebGL(callback, attempt = 0) {
  // window.webglApp.scene is set synchronously inside webgl.js initThree(),
  // so it exists once the webgl.js module has started executing.
  // The 50ms poll handles the rare case where module execution order varies.
  if (window.webglApp?.scene && window.webglApp?.camera) {
    callback(window.webglApp.scene, window.webglApp.camera);
    return;
  }
  if (attempt >= POLL_MAX) {
    console.error('[shaders] Timed out waiting for WebGL scene — check webgl.js.');
    return;
  }
  setTimeout(() => waitForWebGL(callback, attempt + 1), POLL_INTERVAL);
}

function init() {
  // Attach event listeners immediately — don't wait for WebGL
  initMouseListeners();
  initHoverListeners();

  waitForWebGL((scene, camera) => {
    // 1. Add the background plane
    createBackground(scene, camera);

    // 2. Ensure particle renderOrder is correct
    ensureParticleOrder();

    // 3. Start per-frame uniform updates
    requestAnimationFrame(updateLoop);
  });
}

init();
