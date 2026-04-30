/**
 * app.js — Main Application Logic
 * Cursor · Loading Sequence · Horizontal Scroll · Scene Management · Observers
 */

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const LERP_RING   = 0.10;   // Cursor ring lag  — lower = heavier/more fluid
const LERP_SCROLL = 0.075;  // Scroll cinematic glide — lower = more cinematic

const TYPEWRITER_SPEED    = 72;   // ms per character
const TYPEWRITER_DELAY    = 380;  // ms before typing starts
const FLASH_HOLD_MS       = 50;   // white flash duration
const FLASH_FIRE_MS       = 60;   // fire-color hold duration
const FLASH_FADE_MS       = 120;  // fade-out duration
const SPLIT_REVEAL_DELAY  = 80;   // ms after flash before split fires
const SPLIT_ANIM_DURATION = 700;  // must match CSS transition

const SUBTITLE_INTERVAL   = 2800; // ms between hero subtitle swaps
const SUBTITLE_FADE_MS    = 280;  // must match .is-fading CSS transition

const SNAP_DEBOUNCE_MS    = 160;  // ms of no-wheel before snapping to nearest scene
const WHEEL_MULTIPLIER    = 1.25;
const SNAP_THRESHOLD      = 0.5;  // px: close enough to snap exactly

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const state = {
  mouse:  { x: -9999, y: -9999 },   // raw mouse; off-screen until first move
  dot:    { x: -9999, y: -9999 },   // cursor dot  (instant follow)
  ring:   { x: -9999, y: -9999 },   // cursor ring (lerped)

  scrollTarget:  0,
  scrollCurrent: 0,
  maxScroll:     0,
  sceneWidth:    0,
  sceneCount:    0,

  activeScene: 0,
  isLoaded:    false,
  isMobile:    false,

  rafId:           null,
  snapTimer:       null,
  subtitleTimer:   null,
  subtitleIdx:     0,

  cursorVisible:   false,
};

// ═══════════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const loader        = $('loader');
const loaderName    = $('loaderName');
const loaderFlash   = $('loaderFlash');
const site          = $('site');
const galleryTrack  = $('galleryTrack');
const cursorDotEl   = $('cursorDot');
const cursorRingEl  = $('cursorRing');
const heroNameWrap  = $('heroNameWrap');
const heroSubtitleEl = $('heroSubtitle');
const heroBg        = $('heroBg');

const scenes    = [...document.querySelectorAll('.scene')];
const navDotEls = [...document.querySelectorAll('.nav-dot')];

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function easeOutExpo(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function isMobileViewport() {
  return window.innerWidth <= 768;
}

// ═══════════════════════════════════════════════════════════════
// LOADING SCREEN — The Aperture Snap
// ═══════════════════════════════════════════════════════════════

function initLoader() {
  document.body.style.overflow = 'hidden';

  const text    = 'NOUR MOHAMED';
  let   charIdx = 0;

  function typeNextChar() {
    if (charIdx < text.length) {
      loaderName.textContent += text[charIdx++];
      setTimeout(typeNextChar, TYPEWRITER_SPEED);
    } else {
      // Brief pause after last char, then flash
      setTimeout(triggerFlash, 180);
    }
  }

  setTimeout(typeNextChar, TYPEWRITER_DELAY);
}

function triggerFlash() {
  const flash = loaderFlash;

  // Phase 1: instant white overexposure
  flash.style.transition = 'none';
  flash.style.background = 'var(--white)';
  flash.style.opacity    = '1';

  // Phase 2: cut to fire color after 50ms
  setTimeout(() => {
    flash.style.transition = 'none';
    flash.style.background = 'var(--fire)';
    flash.style.opacity    = '0.65';

    // Phase 3: fade the fire out
    setTimeout(() => {
      flash.style.transition = `opacity ${FLASH_FADE_MS}ms ease-out`;
      flash.style.opacity    = '0';

      setTimeout(triggerSplitReveal, SPLIT_REVEAL_DELAY);
    }, FLASH_FIRE_MS);
  }, FLASH_HOLD_MS);
}

function triggerSplitReveal() {
  loader.classList.add('is-revealed');

  setTimeout(() => {
    loader.classList.add('is-done');
    onLoadComplete();
  }, SPLIT_ANIM_DURATION);
}

function onLoadComplete() {
  state.isLoaded = true;
  state.isMobile = isMobileViewport();

  if (state.isMobile) {
    document.body.style.overflow = '';
  }

  initScroll();
  initSubtitleRotation();
  initMagneticName();
  initHeroParallax();
  initIntersectionObservers();

  setActiveScene(0, true);  // force-set initial scene

  // Fire WebGL particle formation after loader completes
  window.webglApp?.formText?.();

  // Start unified RAF loop
  startRAF();
}

// ═══════════════════════════════════════════════════════════════
// CURSOR — Magnetic Fluid System
// ═══════════════════════════════════════════════════════════════

function initCursor() {
  if (isMobileViewport()) return;

  // Make invisible until first mousemove
  cursorDotEl.style.opacity  = '0';
  cursorRingEl.style.opacity = '0';

  window.addEventListener('mousemove', onMouseMove);

  document.addEventListener('mouseleave', () => {
    cursorDotEl.style.opacity  = '0';
    cursorRingEl.style.opacity = '0';
    state.cursorVisible = false;
  });

  document.addEventListener('mouseenter', () => {
    if (state.cursorVisible) {
      cursorDotEl.style.opacity  = '1';
      cursorRingEl.style.opacity = '1';
    }
  });

  // --- Hover States ---

  // Links + buttons → dot grows slightly
  document.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('mouseenter', () =>
      document.body.classList.add('cursor-hover-link'));
    el.addEventListener('mouseleave', () =>
      document.body.classList.remove('cursor-hover-link'));
  });

  // Project cards → ring morphs into "VIEW" square
  document.querySelectorAll('.project-card').forEach(el => {
    el.addEventListener('mouseenter', () => {
      document.body.classList.add('cursor-hover-card');
      document.body.classList.remove('cursor-hover-link');
    });
    el.addEventListener('mouseleave', () =>
      document.body.classList.remove('cursor-hover-card'));
  });

  // Skill cards → subtle link state
  document.querySelectorAll('.skill-card').forEach(el => {
    el.addEventListener('mouseenter', () =>
      document.body.classList.add('cursor-hover-link'));
    el.addEventListener('mouseleave', () =>
      document.body.classList.remove('cursor-hover-link'));
  });
}

function onMouseMove(e) {
  state.mouse.x = e.clientX;
  state.mouse.y = e.clientY;

  // Snap ring to dot on first move to avoid the 0,0 → cursor fly-in
  if (!state.cursorVisible) {
    state.dot.x  = state.ring.x  = e.clientX;
    state.dot.y  = state.ring.y  = e.clientY;
    state.cursorVisible = true;

    cursorDotEl.style.transition  = 'opacity 0.3s ease';
    cursorRingEl.style.transition = 'opacity 0.3s ease';
    cursorDotEl.style.opacity     = '1';
    cursorRingEl.style.opacity    = '1';

    // Remove transition after first frame so it doesn't interfere with RAF
    requestAnimationFrame(() => {
      cursorDotEl.style.transition  = '';
      cursorRingEl.style.transition = '';
    });
  }
}

function updateCursor() {
  if (!state.cursorVisible) return;

  // Dot: exact, zero-lag follow
  state.dot.x = state.mouse.x;
  state.dot.y = state.mouse.y;

  // Ring: lerped for the "heavy fluid" trailing feel
  state.ring.x = lerp(state.ring.x, state.mouse.x, LERP_RING);
  state.ring.y = lerp(state.ring.y, state.mouse.y, LERP_RING);

  cursorDotEl.style.transform  =
    `translate(calc(${state.dot.x}px - 50%), calc(${state.dot.y}px - 50%))`;
  cursorRingEl.style.transform =
    `translate(calc(${state.ring.x}px - 50%), calc(${state.ring.y}px - 50%))`;
}

// ═══════════════════════════════════════════════════════════════
// SCROLL — Spatial Horizontal Gallery Walk
// ═══════════════════════════════════════════════════════════════

function initScroll() {
  if (state.isMobile) return;

  calcScrollBounds();

  window.addEventListener('wheel',   onWheel,   { passive: false });
  window.addEventListener('resize',  onResize);
  window.addEventListener('keydown', onKeydown);

  // Nav dot click → jump to scene
  navDotEls.forEach(dot => {
    dot.addEventListener('click', () => {
      scrollToScene(parseInt(dot.dataset.scene, 10));
    });
  });
}

function calcScrollBounds() {
  state.sceneCount = scenes.length;
  state.sceneWidth = window.innerWidth;
  state.maxScroll  = (state.sceneCount - 1) * state.sceneWidth;
}

function onWheel(e) {
  // Let the vault's inner track scroll natively when hovering it
  if (e.target.closest('.vault__track')) return;

  e.preventDefault();

  const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
  state.scrollTarget = clamp(
    state.scrollTarget + delta * WHEEL_MULTIPLIER,
    0,
    state.maxScroll
  );

  // Debounced snap to nearest scene after user stops scrolling
  clearTimeout(state.snapTimer);
  state.snapTimer = setTimeout(snapToNearestScene, SNAP_DEBOUNCE_MS);
}

function snapToNearestScene() {
  const nearest = Math.round(state.scrollTarget / state.sceneWidth);
  state.scrollTarget = clamp(nearest, 0, state.sceneCount - 1) * state.sceneWidth;
}

function onKeydown(e) {
  const map = {
    ArrowRight: 1, ArrowDown:  1,
    ArrowLeft: -1, ArrowUp:   -1,
  };
  if (map[e.key] !== undefined) {
    e.preventDefault();
    scrollToScene(state.activeScene + map[e.key]);
  }
}

function onResize() {
  const wasMobile = state.isMobile;
  state.isMobile  = isMobileViewport();

  calcScrollBounds();

  // Recalculate current position proportionally
  state.scrollTarget  = state.activeScene * state.sceneWidth;
  state.scrollCurrent = state.scrollTarget;
  applyTrackPosition(state.scrollCurrent);

  // Toggle body scroll for mobile / desktop switch
  if (state.isMobile && !wasMobile) {
    document.body.style.overflow = '';
  } else if (!state.isMobile && wasMobile) {
    document.body.style.overflow = 'hidden';
  }
}

function scrollToScene(idx) {
  const target = clamp(idx, 0, state.sceneCount - 1);
  state.scrollTarget = target * state.sceneWidth;
}

function applyTrackPosition(x) {
  galleryTrack.style.transform = `translateX(${-x}px)`;
}

// ─── Per-frame scroll update ──────────────────────────────────

function updateScroll() {
  if (state.isMobile) return;

  // Lerp current → target
  state.scrollCurrent = lerp(state.scrollCurrent, state.scrollTarget, LERP_SCROLL);

  // Snap exactly when close enough (prevents infinite micro-lerp)
  if (Math.abs(state.scrollCurrent - state.scrollTarget) < SNAP_THRESHOLD) {
    state.scrollCurrent = state.scrollTarget;
  }

  applyTrackPosition(state.scrollCurrent);

  // Fractional scene position (e.g. 1.4 = between scene 1 and 2)
  const rawScene  = state.scrollCurrent / state.sceneWidth;
  const activeIdx = Math.round(rawScene);

  if (activeIdx !== state.activeScene) {
    setActiveScene(activeIdx);
  }

  updateSceneDepth(rawScene);
}

// ─── Scene depth — the "Gallery Walk" Z-axis illusion ─────────

function updateSceneDepth(rawScene) {
  scenes.forEach((scene, i) => {
    const dist = Math.abs(i - rawScene);

    // Smooth analogue values — no class toggling for visual state,
    // only inline styles driven by the lerp every frame
    const scale   = lerp(0.93, 1,    clamp(1 - dist,       0, 1));
    const opacity = lerp(0.40, 1,    clamp(1 - dist * 0.9, 0, 1));

    scene.style.opacity   = opacity;
    scene.style.transform = `scale(${scale.toFixed(4)})`;

    // Keep semantic classes for CSS-only fallbacks / a11y
    const isActive = dist < 0.05;
    scene.classList.toggle('is-active',   isActive);
    scene.classList.toggle('is-adjacent', !isActive);
  });
}

// ─── Scene enter / leave lifecycle ────────────────────────────

function setActiveScene(idx, force = false) {
  const next = clamp(idx, 0, state.sceneCount - 1);
  if (!force && next === state.activeScene) return;

  state.activeScene = next;

  // Update nav dots
  navDotEls.forEach((dot, i) =>
    dot.classList.toggle('nav-dot--active', i === next));

  onSceneEnter(next);
}

function onSceneEnter(idx) {
  // Scene 3 (Arsenal, 0-indexed) → animate skill bars
  if (idx === 3) {
    document.querySelectorAll('.skill-card').forEach(card =>
      card.classList.add('is-visible'));
  }

  // Scene 4 (Metrics) → fire counters
  if (idx === 4) {
    document.querySelectorAll('.stat-block').forEach(block => {
      if (block.dataset.counted) return;
      block.dataset.counted = '1';
      block.classList.add('is-visible');
      animateCounter(block);
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// HERO — Rotating Subtitle Typewriter Loop
// ═══════════════════════════════════════════════════════════════

const SUBTITLES = [
  'AI Director',
  'Creative Director',
  'Brand Architect',
  'World Builder',
];

function initSubtitleRotation() {
  if (!heroSubtitleEl) return;

  state.subtitleTimer = setInterval(() => {
    heroSubtitleEl.classList.add('is-fading');

    setTimeout(() => {
      state.subtitleIdx = (state.subtitleIdx + 1) % SUBTITLES.length;
      heroSubtitleEl.textContent = SUBTITLES[state.subtitleIdx];
      heroSubtitleEl.classList.remove('is-fading');
    }, SUBTITLE_FADE_MS);

  }, SUBTITLE_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════
// HERO — Magnetic Name Perspective Tilt
// ═══════════════════════════════════════════════════════════════

function initMagneticName() {
  if (!heroNameWrap) return;

  let tiltX = 0, tiltY = 0;
  let targetX = 0, targetY = 0;
  let rafMag = null;

  heroNameWrap.addEventListener('mousemove', (e) => {
    const rect = heroNameWrap.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;

    // Normalized -1 → +1
    const nx = (e.clientX - cx) / (rect.width  / 2);
    const ny = (e.clientY - cy) / (rect.height / 2);

    targetX = parseFloat((-ny * 7).toFixed(2));   // rotateX
    targetY = parseFloat(( nx * 7).toFixed(2));   // rotateY

    heroNameWrap.classList.add('is-lit');

    if (!rafMag) {
      function animateTilt() {
        tiltX = lerp(tiltX, targetX, 0.14);
        tiltY = lerp(tiltY, targetY, 0.14);

        heroNameWrap.style.transform =
          `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;

        if (Math.abs(tiltX - targetX) > 0.01 || Math.abs(tiltY - targetY) > 0.01) {
          rafMag = requestAnimationFrame(animateTilt);
        } else {
          rafMag = null;
        }
      }
      rafMag = requestAnimationFrame(animateTilt);
    }
  });

  heroNameWrap.addEventListener('mouseleave', () => {
    targetX = 0;
    targetY = 0;
    heroNameWrap.classList.remove('is-lit');

    function resetTilt() {
      tiltX = lerp(tiltX, 0, 0.10);
      tiltY = lerp(tiltY, 0, 0.10);
      heroNameWrap.style.transform =
        `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;

      if (Math.abs(tiltX) > 0.05 || Math.abs(tiltY) > 0.05) {
        rafMag = requestAnimationFrame(resetTilt);
      } else {
        heroNameWrap.style.transform = '';
        tiltX = tiltY = 0;
        rafMag = null;
      }
    }
    cancelAnimationFrame(rafMag);
    rafMag = requestAnimationFrame(resetTilt);
  });
}

// ═══════════════════════════════════════════════════════════════
// HERO — Mouse Parallax Background
// ═══════════════════════════════════════════════════════════════

function initHeroParallax() {
  if (!heroBg) return;

  let bgX = 0, bgY = 0;
  let targetBgX = 0, targetBgY = 0;

  window.addEventListener('mousemove', (e) => {
    if (state.activeScene !== 0) return;

    // Normalized -1 → +1, inverted for parallax depth
    targetBgX = -((e.clientX / window.innerWidth)  - 0.5) * 40;
    targetBgY = -((e.clientY / window.innerHeight) - 0.5) * 30;
  });

  // Separate lightweight loop for parallax (avoids coupling to main RAF)
  function parallaxLoop() {
    bgX = lerp(bgX, targetBgX, 0.06);
    bgY = lerp(bgY, targetBgY, 0.06);
    heroBg.style.transform = `translate(${bgX.toFixed(2)}px, ${bgY.toFixed(2)}px)`;
    requestAnimationFrame(parallaxLoop);
  }
  requestAnimationFrame(parallaxLoop);
}

// ═══════════════════════════════════════════════════════════════
// INTERSECTION OBSERVERS — Mobile fallback for Skill Bars & Counters
// ═══════════════════════════════════════════════════════════════

function initIntersectionObservers() {
  // Desktop: lifecycle is driven by setActiveScene / onSceneEnter.
  // Mobile: scenes stack vertically so we use IntersectionObserver.
  // We register observers on both — guards (data-counted / classList check)
  // prevent double-firing.

  // ─ Skill bars (Arsenal) ───────────────────────────────────
  const skillObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        skillObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.25 });

  document.querySelectorAll('.skill-card').forEach(card =>
    skillObserver.observe(card));

  // ─ Counters (Metrics) ─────────────────────────────────────
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      if (entry.target.dataset.counted) return;

      entry.target.dataset.counted = '1';
      entry.target.classList.add('is-visible');
      animateCounter(entry.target);
      statObserver.unobserve(entry.target);
    });
  }, { threshold: 0.2 });

  document.querySelectorAll('.stat-block').forEach(block =>
    statObserver.observe(block));
}

// ═══════════════════════════════════════════════════════════════
// COUNTER ANIMATION — Brutalist number count-up
// ═══════════════════════════════════════════════════════════════

function animateCounter(block) {
  const numEl = block.querySelector('.stat-block__num');
  if (!numEl) return;

  const target      = parseFloat(numEl.dataset.target);
  if (isNaN(target)) return;

  const isDecimal   = String(target).includes('.');
  const duration    = 2200;
  let   startTime   = null;

  function tick(now) {
    if (!startTime) startTime = now;

    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = easeOutExpo(progress);
    const current  = eased * target;

    numEl.textContent = isDecimal
      ? current.toFixed(1)
      : Math.floor(current).toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      // Land on the exact final value
      numEl.textContent = isDecimal
        ? target.toFixed(1)
        : target.toLocaleString();
    }
  }

  requestAnimationFrame(tick);
}

// ═══════════════════════════════════════════════════════════════
// MAIN RAF LOOP — Single unified animation frame
// ═══════════════════════════════════════════════════════════════

function startRAF() {
  function loop() {
    updateCursor();
    updateScroll();
    state.rafId = requestAnimationFrame(loop);
  }
  state.rafId = requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════════
// BOOT — Order matters: cursor first, then loader
// ═══════════════════════════════════════════════════════════════

initCursor();   // Attach mousemove + hover listeners immediately
initLoader();   // Start typewriter → flash → reveal → onLoadComplete
