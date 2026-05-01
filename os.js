'use strict';

/* ═══════════════════════════════════════════════════════════════
   NOUR OS — os.js
   Single-file brain: boot, views, drag, layers, terminal, inspector
═══════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────
   DATA
──────────────────────────────────────────────────────────────── */
const PROJECTS = [
  {
    id: 0, title: 'GRAY MUSEUM', year: '2024', cat: 'AI Art · Macabre Surrealism',
    desc: 'A hauntingly curated AI art series built on the Flashcore Protocol — weaponizing macabre aesthetics, Baccarat crystal luxury, and military iconography into scroll-stopping visual paradoxes. 337.5K impressions were not an accident.',
    metrics: [['Pinterest Impressions','337.5K'],['IG Reach Increase','+5,715%'],['Total Engagements','16,690']],
    tags: ['AI Direction','Flashcore Protocol','Dark Aesthetics','Midjourney V6'],
    fireTag: 'Flashcore Protocol',
  },
  {
    id: 1, title: 'M3ANYI', year: '2024', cat: 'Digital Community · Street Philosophy',
    desc: 'A cultural community forged at the intersection of Arabic street philosophy and digital mysticism. Built through conceptual depth, not ad spend. Organic reach that defied algorithmic logic.',
    metrics: [['Total Impressions','484.2K'],['Single Post Reach','88.8K'],['Community','Organic Growth']],
    tags: ['Arabic Typography','Magic Realism','Street Culture','Community'],
    fireTag: 'Magic Realism',
  },
  {
    id: 2, title: 'CHIKY POP', year: '2023', cat: 'F&B Brand · Full Launch',
    desc: 'Zero to fully operational in 7 days. Complete brand architecture, identity system, and launch operations. 100+ daily orders from day one — proof that luxury thinking applies at every price point.',
    metrics: [['Zero-to-Launch','7 Days'],['Daily Orders at Launch','100+'],['Scope','Full Brand + Ops']],
    tags: ['Brand Identity','Operations Lead','F&B','Launch Strategy'],
    fireTag: 'Operations Lead',
  },
  {
    id: 3, title: 'SHERO HANDMADE', year: '2023', cat: 'Luxury Jewelry · Global Positioning',
    desc: 'Repositioned a handmade jewelry brand into global luxury territory through obsessive visual restraint, dark elegance, and a logo architecture engineered to signal exclusivity without a single word.',
    metrics: [['Positioning','Global Luxury'],['Creative Ownership','100%'],['Visual Language','Dark Luxury']],
    tags: ['Dark Luxury','Logo Architecture','Jewelry','Brand Identity'],
    fireTag: 'Logo Architecture',
  },
  {
    id: 4, title: 'GOLDEN HOME', year: '2023', cat: 'Real Estate · Brand + Digital',
    desc: 'End-to-end creative stewardship for a premium property brand. From mark-making through digital presence and all marketing collateral — one cohesive vision, total execution authority.',
    metrics: [['Creative Ownership','100%'],['Deliverables','Brand + Web + Print'],['Sector','Real Estate']],
    tags: ['Creative Direction','Web Design','Real Estate','Brand Strategy'],
    fireTag: 'Web Design',
  },
  {
    id: 5, title: 'DESIGN-ITUDE', year: '2022–24', cat: 'Architecture & Interior · AI Integration',
    desc: 'Creative direction across 125+ architectural visualization projects over two years. Introduced AI-augmented workflows that compressed concept-to-approval cycles by 60% without sacrificing studio quality.',
    metrics: [['Projects Delivered','125+'],['Concept Time Saved','−60%'],['AI Depth','Deep Integration']],
    tags: ['3D Visualization','AI Integration','Architecture','Interior Design'],
    fireTag: 'AI Integration',
  },
];

const METRICS_DATA = [
  { pre: '',  num: 337.5, unit: 'K',  lbl: 'Pinterest Impressions',  src: 'Gray Museum' },
  { pre: '+', num: 5715,  unit: '%',  lbl: 'IG Reach Increase',       src: 'Gray Museum' },
  { pre: '',  num: 16690, unit: '',   lbl: 'Total Engagements',       src: 'Gray Museum' },
  { pre: '',  num: 484.2, unit: 'K',  lbl: 'Total Impressions',       src: 'M3anyi' },
  { pre: '+', num: 100,   unit: '+',  lbl: 'Daily Orders at Launch',  src: 'Chiky Pop' },
  { pre: '',  num: 125,   unit: '+',  lbl: 'Projects Delivered',      src: 'Design-itude' },
];

// Each line: array of {c: className, t: text} segments
const TERM_LINES = [
  [{ c:'t-prompt',t:'> ' },{ c:'t-key',t:'SYSTEM' },{ c:'t-val',t:': INITIALIZING MIDJOURNEY V6.0 ENGINE...' }],
  [{ c:'t-prompt',t:'> ' },{ c:'t-key',t:'INJECT_SUBJECT' },{ c:'t-val',t:': "Extreme macro close-up profile of a pale, elegant face in deep shadow wearing a functional military gas mask."' }],
  [{ c:'t-prompt',t:'> ' },{ c:'t-key',t:'MATERIAL_OVERRIDE' },{ c:'t-val',t:': "Meticulously constructed from flawless, intricately cut Baccarat crystal and polished 24-karat gold filigree."' }],
  [{ c:'t-prompt',t:'> ' },{ c:'t-key',t:'MICROMETRICS' },{ c:'t-val',t:': "Breathing filters are massive, sparkling, multi-faceted clear diamonds. Clear condensation droplets coat the glass."' }],
  [{ c:'t-prompt',t:'> ' },{ c:'t-key',t:'FLASHCORE_PROTOCOL' },{ c:'t-val',t:': "Medium format photography, harsh studio flash, luxury pop-culture satire, tactical surrealism, masterpiece visual hook, 8k, photorealistic"' }],
  [{ c:'t-prompt',t:'> ' },{ c:'t-key',t:'EXECUTE' },{ c:'t-val',t:': --stylize 250 --v 6.0' }],
  [{ c:'t-prompt',t:'> ' },{ c:'t-key',t:'STATUS' },{ c:'t-val',t:': RENDERING HYPER-LUXURY PARADOX... ' },{ c:'t-bar',t:'[|||||||||||||||]' },{ c:'t-ok',t:' 100%' }],
];

const ROLES  = ['AI Director','Creative Director','World Builder','Experiential Architect'];
const VNAMES = ['Hero','Manifesto','Work','Arsenal','Metrics','The Lab','Transmission'];
const TNAMES = ['Select','Pen','Folder','Layers','Graph','Terminal','Export'];
const KEY_MAP = { v:0, p:1, f:2, l:3, g:4, t:5, e:6 };

/* ────────────────────────────────────────────────────────────────
   STATE
──────────────────────────────────────────────────────────────── */
let activeTool  = 0;
let selProj     = null;
let workBuilt   = false;
let metricsBuilt= false;
let zC          = 10;

// Terminal state
const termSt = { running: false, done: false, timer: null, li: 0, si: 0, ci: 0 };

// Inspector typewriter state
const roleSt = { running: false, timer: null, idx: 0, charIdx: 0, phase: 'type' };

// Hero role rotation
let heroRoleIdx = 0;

/* ────────────────────────────────────────────────────────────────
   BOOT SEQUENCE
──────────────────────────────────────────────────────────────── */
function boot() {
  const intro  = document.getElementById('intro');
  const flash  = document.getElementById('iFlash');
  const app    = document.getElementById('app');
  const iText  = document.getElementById('iText');

  // CSS handles the stroke-dasharray draw (2.0s + 0.3s delay = ~2.3s)
  // We fire the flash + transition at 2.45s to guarantee draw is done
  setTimeout(() => {

    // Step 1 — Flashcore white overexposure (instant)
    flash.style.transition = 'none';
    flash.style.opacity    = '1';

    // Step 2 — Hold 50ms, then fade flash & scale-out text
    setTimeout(() => {
      flash.style.transition = 'opacity 140ms ease-out';
      flash.style.opacity    = '0';

      iText.style.transition = 'transform .55s cubic-bezier(.4,0,.2,1), opacity .55s ease';
      iText.style.transform  = 'scale(1.22)';
      iText.style.opacity    = '0';

      // Step 3 — Reveal OS grid
      setTimeout(() => {
        intro.classList.add('out');
        app.classList.add('on');
        // Remove intro from flow after fade
        setTimeout(() => { intro.style.display = 'none'; }, 500);
      }, 140);

    }, 50); // 50ms Flashcore hold

  }, 2450);
}

/* ────────────────────────────────────────────────────────────────
   SYSTEM CLOCK & BATTERY
──────────────────────────────────────────────────────────────── */
function initClock() {
  const el = document.getElementById('bClock');
  function tick() {
    const d = new Date();
    el.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');
  }
  tick();
  setInterval(tick, 1000);
}

function initBattery() {
  if (!('getBattery' in navigator)) return;
  navigator.getBattery().then(b => {
    function upd() {
      const p = Math.round(b.level * 100);
      document.getElementById('battPct').textContent  = p + '%';
      const fill = document.getElementById('battFill');
      fill.style.width      = p + '%';
      fill.style.background = p < 20 ? '#c0392b' : 'var(--fire)';
    }
    upd();
    b.addEventListener('levelchange', upd);
  }).catch(() => {});
}

/* ────────────────────────────────────────────────────────────────
   DROPDOWN MENUS
──────────────────────────────────────────────────────────────── */
function initDropdowns() {
  // Toggle on b-item click
  document.querySelectorAll('.b-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const ddId = item.dataset.dd;
      const dd   = document.getElementById(ddId);
      const wasOpen = dd.classList.contains('open');
      closeAllDD();
      if (!wasOpen) {
        dd.classList.add('open');
        item.classList.add('open');
        item.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // View menu navigation
  document.querySelectorAll('[data-goto]').forEach(row => {
    row.addEventListener('click', () => {
      go(parseInt(row.dataset.goto));
      closeAllDD();
    });
  });

  // Download Resume
  const dlRow = document.getElementById('ddDLResume');
  if (dlRow) {
    dlRow.addEventListener('click', () => {
      closeAllDD();
      alert('CV available on request.\nEmail: 2mrikydesign@gmail.com\nPhone: 0155 584 6969');
    });
  }

  // Close on outside click
  document.addEventListener('click', () => closeAllDD());
}

function closeAllDD() {
  document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.b-item.open').forEach(i => {
    i.classList.remove('open');
    i.setAttribute('aria-expanded', 'false');
  });
}

/* ────────────────────────────────────────────────────────────────
   VIEW CONTROLLER
──────────────────────────────────────────────────────────────── */
function go(idx) {
  if (idx === activeTool) return;
  activeTool = idx;
  closeAllDD();

  // Switch views
  document.querySelectorAll('.view').forEach((v, i) => {
    const on = i === idx;
    v.classList.toggle('on', on);
    if (on)  setViewDisplay(v);
    else     v.style.removeProperty('display');
  });

  // Toolbar active state
  document.querySelectorAll('.t').forEach((btn, i) => {
    btn.classList.toggle('on', i === idx);
    btn.setAttribute('aria-pressed', i === idx ? 'true' : 'false');
  });

  // Update labels
  document.getElementById('cvCrumb').textContent = VNAMES[idx];
  document.getElementById('bTool').textContent   = TNAMES[idx];
  document.getElementById('sbTool').textContent  = TNAMES[idx];

  // Work view allows horizontal scroll for the canvas
  const cvBody = document.getElementById('cvBody');
  cvBody.style.overflowX = idx === 2 ? 'auto' : 'hidden';
  cvBody.scrollTop = 0;

  // Per-view initialization
  if (idx === 2) buildWork();
  if (idx === 4) buildMetrics();
  if (idx === 5) startTerminal();

  // Inspector: reset on non-work views or work with nothing selected
  if (idx !== 2) {
    selProj = null;
    renderDefaultIP();
  } else if (selProj === null) {
    renderDefaultIP();
  }
}

// Resolve display value: some views are flex containers
function setViewDisplay(v) {
  if (v.classList.contains('view-work'))   v.style.display = 'flex';
  else if (v.classList.contains('view-layers')) v.style.display = 'flex';
  else if (v.classList.contains('view-lab'))    v.style.display = 'flex';
  else v.style.display = 'block';
}

function initHotkeys() {
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const idx = KEY_MAP[e.key.toLowerCase()];
    if (idx !== undefined) go(idx);
    if (e.key === 'Escape') closeSheet();
  });
}

/* ────────────────────────────────────────────────────────────────
   WORK VIEW — DRAG & DROP + PROJECT BIN
──────────────────────────────────────────────────────────────── */
function buildWork() {
  if (workBuilt) return;
  workBuilt = true;

  document.querySelectorAll('.pw').forEach(pw => {
    const proj = PROJECTS[parseInt(pw.dataset.proj)];

    // Drag behaviour
    makeDrag(pw);

    // Minimize to bin
    pw.querySelector('.pw-close').addEventListener('click', e => {
      e.stopPropagation();
      minimizeProj(pw, proj);
    });

    // Select window → update inspector
    pw.addEventListener('mousedown', e => {
      if (e.target.closest('.pw-close')) return;

      pw.style.zIndex = ++zC;

      document.querySelectorAll('.pw').forEach(p => p.classList.remove('sel'));
      pw.classList.add('sel');
      selProj = proj.id;

      renderProjIP(proj);
      if (window.innerWidth < 768) openSheet(proj);
    });
  });

  // Click canvas background → deselect
  document.getElementById('wkCanvas').addEventListener('mousedown', e => {
    if (!e.target.closest('.pw')) {
      document.querySelectorAll('.pw').forEach(p => p.classList.remove('sel'));
      selProj = null;
      renderDefaultIP();
    }
  });
}

function makeDrag(el) {
  const bar = el.querySelector('.pw-bar');
  let on = false, sx = 0, sy = 0, ox = 0, oy = 0;

  // Mouse
  bar.addEventListener('mousedown', e => {
    if (e.target.closest('.pw-close')) return;
    on = true;
    sx = e.clientX; sy = e.clientY;
    ox = el.offsetLeft; oy = el.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!on) return;
    el.style.left = (ox + e.clientX - sx) + 'px';
    el.style.top  = (oy + e.clientY - sy) + 'px';
  });
  document.addEventListener('mouseup', () => { on = false; });

  // Touch
  bar.addEventListener('touchstart', e => {
    if (e.target.closest('.pw-close')) return;
    const t = e.touches[0];
    on = true;
    sx = t.clientX; sy = t.clientY;
    ox = el.offsetLeft; oy = el.offsetTop;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!on) return;
    const t = e.touches[0];
    el.style.left = (ox + t.clientX - sx) + 'px';
    el.style.top  = (oy + t.clientY - sy) + 'px';
  }, { passive: true });
  document.addEventListener('touchend', () => { on = false; });
}

function minimizeProj(pw, proj) {
  pw.classList.remove('sel');
  pw.style.display = 'none';

  const bin = document.getElementById('binItems');
  if (bin.querySelector(`[data-restore="${proj.id}"]`)) return;

  const chip = document.createElement('button');
  chip.className   = 'bin-item';
  chip.setAttribute('data-restore', proj.id);
  chip.setAttribute('title', `Restore ${proj.title}`);
  chip.innerHTML   = `<span class="bin-item-dot" aria-hidden="true"></span>${proj.title}`;
  chip.addEventListener('click', () => restoreProj(proj.id));
  bin.appendChild(chip);

  // If this was the selected project, clear inspector
  if (selProj === proj.id) {
    selProj = null;
    renderDefaultIP();
  }
}

function restoreProj(id) {
  const pw = document.getElementById('pw' + id);
  if (pw) {
    pw.style.display = '';
    pw.style.zIndex  = ++zC;
  }
  const chip = document.querySelector(`.bin-item[data-restore="${id}"]`);
  if (chip) chip.remove();
}

/* ────────────────────────────────────────────────────────────────
   LAYERS VIEW — EYE TOGGLES + COLLAPSE
──────────────────────────────────────────────────────────────── */
function initLayers() {
  // Group eye toggle (toggles entire lc-group opacity)
  document.querySelectorAll('[data-group-eye]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const g = btn.dataset.groupEye;
      const isOn = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!isOn));
      const group = document.getElementById('lcg' + g);
      if (group) group.style.opacity = isOn ? '0' : '1';
    });
  });

  // Individual layer eye toggle (toggles single lc-shape)
  document.querySelectorAll('[data-layer-eye]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const l = btn.dataset.layerEye;
      const isOn = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!isOn));
      const shape = document.querySelector(`.lc-shape[data-shape="${l}"]`);
      if (shape) shape.style.opacity = isOn ? '0' : '1';
    });
  });

  // Group header collapse / expand (click outside eye button)
  document.querySelectorAll('.lg-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.eye-btn')) return;
      const g       = header.dataset.group;
      const children = document.getElementById('lgc' + g);
      const arrow   = header.querySelector('.lg-arrow');
      if (!children || !arrow) return;

      const isExpanded = arrow.classList.contains('expanded');
      arrow.classList.toggle('expanded', !isExpanded);
      arrow.classList.toggle('collapsed', isExpanded);
      children.style.display = isExpanded ? 'none' : '';
    });
  });

  // Layer row selection (visual only)
  document.querySelectorAll('.layer-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.eye-btn')) return;
      document.querySelectorAll('.layer-row').forEach(r => r.classList.remove('sel'));
      row.classList.add('sel');
    });
  });
}

/* ────────────────────────────────────────────────────────────────
   METRICS VIEW — COUNTER ANIMATION
──────────────────────────────────────────────────────────────── */
function buildMetrics() {
  if (metricsBuilt) return;
  metricsBuilt = true;

  const grid = document.getElementById('mtGrid');
  grid.innerHTML = '';

  METRICS_DATA.forEach(m => {
    const b = document.createElement('div');
    b.className = 'mt-blk';
    b.setAttribute('role', 'listitem');
    b.innerHTML =
      `<div>${m.pre ? `<span class="mt-pre">${m.pre}</span>` : ''}<span class="mt-num" data-target="${m.num}">0</span><span class="mt-unit">${m.unit}</span></div>` +
      `<div class="mt-lbl">${m.lbl}</div>` +
      `<div class="mt-src">${m.src}</div>`;
    grid.appendChild(b);
  });

  // Delay one frame so elements are painted before animating
  requestAnimationFrame(() => {
    setTimeout(() => {
      grid.querySelectorAll('.mt-num').forEach(el => {
        animateCounter(el, parseFloat(el.dataset.target));
      });
    }, 60);
  });
}

function animateCounter(el, target) {
  const isDec = String(target).includes('.');
  const dur   = 1900;
  const t0    = performance.now();
  const ease  = p => 1 - Math.pow(1 - p, 4); // easeOutQuart

  (function tick(now) {
    const p = Math.min((now - t0) / dur, 1);
    const v = ease(p) * target;
    el.textContent = isDec ? v.toFixed(1) : Math.floor(v).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = isDec ? target.toFixed(1) : target.toLocaleString();
  })(performance.now());
}

/* ────────────────────────────────────────────────────────────────
   TERMINAL — FLASHCORE ENGINE TYPING EFFECT
──────────────────────────────────────────────────────────────── */
function startTerminal() {
  if (termSt.running) return;

  // Already fully rendered — just show it
  if (termSt.done) return;

  const out    = document.getElementById('termOut');
  const cursor = document.getElementById('termCursor');
  out.innerHTML = '';
  cursor.style.display = 'inline';

  termSt.running = true;
  termSt.li = 0; termSt.si = 0; termSt.ci = 0;

  const CHAR_MS = 18;
  const LINE_MS = 350;

  function tick() {
    if (termSt.li >= TERM_LINES.length) {
      termSt.running = false;
      termSt.done    = true;
      return;
    }

    const line = TERM_LINES[termSt.li];

    // Get or create line element
    let lineEl = out.querySelector(`[data-li="${termSt.li}"]`);
    if (!lineEl) {
      lineEl = document.createElement('div');
      lineEl.className   = 'term-line';
      lineEl.dataset.li  = termSt.li;
      out.appendChild(lineEl);
    }

    const seg = line[termSt.si];

    // Get or create segment span
    let segEl = lineEl.querySelector(`[data-si="${termSt.si}"]`);
    if (!segEl) {
      segEl = document.createElement('span');
      segEl.className   = seg.c;
      segEl.dataset.si  = termSt.si;
      lineEl.appendChild(segEl);
    }

    // Append one character
    segEl.textContent += seg.t[termSt.ci];
    termSt.ci++;

    // Auto-scroll terminal body
    const body = document.getElementById('termBody');
    body.scrollTop = body.scrollHeight;

    // Advance position
    if (termSt.ci >= seg.t.length) {
      termSt.si++;
      termSt.ci = 0;
      if (termSt.si >= line.length) {
        // Line complete — pause before next line
        termSt.li++;
        termSt.si = 0;
        termSt.timer = setTimeout(tick, LINE_MS);
        return;
      }
    }

    termSt.timer = setTimeout(tick, CHAR_MS);
  }

  // Brief pause before starting, feels like a real boot
  termSt.timer = setTimeout(tick, 400);
}

/* ────────────────────────────────────────────────────────────────
   INSPECTOR — DEFAULT (global stats + role typewriter)
──────────────────────────────────────────────────────────────── */
function renderDefaultIP() {
  stopRoleTypewriter();

  const navPairs = [
    ['V','Hero'],['P','Manifesto'],['F','Work'],
    ['L','Arsenal'],['G','Metrics'],['T','The Lab'],['E','Transmission'],
  ];

  document.getElementById('ipBody').innerHTML = `
    <div class="is">
      <div class="is-t">Identity</div>
      <div class="ir"><span class="il">Name</span><span class="iv">Nour Mohamed</span></div>
      <div class="ir">
        <span class="il">Role</span>
        <div class="i-role-live"><span id="ipRole"></span><span class="i-cursor" aria-hidden="true"></span></div>
      </div>
      <div class="ir"><span class="il">Location</span><span class="iv">New Cairo, EG</span></div>
      <div class="ir"><span class="il">Email</span><span class="iv" style="font-size:9px">2mrikydesign@gmail.com</span></div>
    </div>
    <div class="is">
      <div class="is-t">Global Stats</div>
      <div class="ir"><span class="il">Projects</span><span class="iv hi">7+</span></div>
      <div class="ir"><span class="il">Years Active</span><span class="iv">5+</span></div>
      <div class="ir"><span class="il">Disciplines</span><span class="iv">8</span></div>
      <div class="ir"><span class="il">Availability</span><span class="iv hi">Open</span></div>
    </div>
    <div class="is">
      <div class="is-t">Philosophy</div>
      <div class="i-desc">"I don't just design visuals — I build worlds."</div>
    </div>
    <div class="is">
      <div class="is-t">Disciplines</div>
      <div class="i-tags">
        <span class="i-tag fi">AI Director</span>
        <span class="i-tag">Creative Director</span>
        <span class="i-tag">World Builder</span>
        <span class="i-tag">Experiential Architect</span>
      </div>
    </div>
    <div class="is">
      <div class="is-t">Hotkeys</div>
      ${navPairs.map(([k,v]) =>
        `<div class="hk-row"><span class="hk-key">${k}</span><span class="hk-view">${v}</span></div>`
      ).join('')}
    </div>`;

  startRoleTypewriter();
}

/* ────────────────────────────────────────────────────────────────
   INSPECTOR — PROJECT VIEW
──────────────────────────────────────────────────────────────── */
function renderProjIP(p) {
  stopRoleTypewriter();

  document.getElementById('ipBody').innerHTML = `
    <div class="is">
      <div class="i-big">${p.title}</div>
      <div class="i-sub">${p.year}</div>
      <div style="margin-top:10px">
        <div class="ir"><span class="il">Category</span><span class="iv" style="font-size:10px;text-align:right">${p.cat}</span></div>
      </div>
    </div>
    <div class="is">
      <div class="is-t">Metrics</div>
      ${p.metrics.map(([k,v]) =>
        `<div class="ir"><span class="il">${k}</span><span class="iv hi">${v}</span></div>`
      ).join('')}
    </div>
    <div class="is">
      <div class="is-t">Tags</div>
      <div class="i-tags">
        ${p.tags.map(t =>
          `<span class="i-tag${t === p.fireTag ? ' fi' : ''}">${t}</span>`
        ).join('')}
      </div>
    </div>
    <div class="is">
      <div class="is-t">Description</div>
      <div class="i-desc">${p.desc}</div>
    </div>
    <div class="is">
      <span class="i-back" id="ipBack">← Back to Identity</span>
    </div>`;

  document.getElementById('ipBack').addEventListener('click', () => {
    selProj = null;
    document.querySelectorAll('.pw').forEach(pw => pw.classList.remove('sel'));
    renderDefaultIP();
  });
}

/* ────────────────────────────────────────────────────────────────
   ROLE TYPEWRITER (Inspector)
   Phases: type → hold → erase → next role → repeat
──────────────────────────────────────────────────────────────── */
function stopRoleTypewriter() {
  clearTimeout(roleSt.timer);
  roleSt.running = false;
}

function startRoleTypewriter() {
  stopRoleTypewriter();
  roleSt.running  = true;
  roleSt.phase    = 'type';
  roleSt.charIdx  = 0;
  roleTick();
}

function roleTick() {
  const el = document.getElementById('ipRole');
  if (!el || !roleSt.running) return;

  const target = ROLES[roleSt.idx];

  if (roleSt.phase === 'type') {
    el.textContent = target.slice(0, roleSt.charIdx);
    if (roleSt.charIdx < target.length) {
      roleSt.charIdx++;
      roleSt.timer = setTimeout(roleTick, 65);
    } else {
      roleSt.phase = 'hold';
      roleSt.timer = setTimeout(roleTick, 2600);
    }

  } else if (roleSt.phase === 'hold') {
    roleSt.phase   = 'erase';
    roleSt.charIdx = target.length;
    roleTick();

  } else if (roleSt.phase === 'erase') {
    el.textContent = target.slice(0, roleSt.charIdx);
    if (roleSt.charIdx > 0) {
      roleSt.charIdx--;
      roleSt.timer = setTimeout(roleTick, 36);
    } else {
      roleSt.idx     = (roleSt.idx + 1) % ROLES.length;
      roleSt.phase   = 'type';
      roleSt.charIdx = 0;
      roleSt.timer   = setTimeout(roleTick, 180);
    }
  }
}

/* ────────────────────────────────────────────────────────────────
   HERO ARTBOARD — ROLE CROSSFADE
──────────────────────────────────────────────────────────────── */
function rotHeroRole() {
  const el = document.getElementById('hRole');
  if (!el) return;
  el.classList.add('fade');
  setTimeout(() => {
    heroRoleIdx = (heroRoleIdx + 1) % ROLES.length;
    el.textContent = ROLES[heroRoleIdx];
    el.classList.remove('fade');
  }, 260);
}

/* ────────────────────────────────────────────────────────────────
   MOBILE BOTTOM SHEET
──────────────────────────────────────────────────────────────── */
function openSheet(p) {
  const sheet    = document.getElementById('bsheet');
  const titleEl  = document.getElementById('bsTitle');
  const contentEl= document.getElementById('bsContent');

  titleEl.textContent = p.title;
  contentEl.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:10px;color:var(--smoke);letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px">${p.cat} · ${p.year}</div>
    ${p.metrics.map(([k,v]) =>
      `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
         <span style="font-size:10px;color:var(--smoke)">${k}</span>
         <span style="font-size:10px;color:var(--fire);font-weight:500">${v}</span>
       </div>`
    ).join('')}
    <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:12px">
      ${p.tags.map(t =>
        `<span style="font-size:8px;border:1px solid ${t === p.fireTag ? 'var(--fire)' : 'var(--border2)'};color:${t === p.fireTag ? 'var(--fire)' : 'var(--smoke)'};padding:2px 6px;text-transform:uppercase;letter-spacing:.04em">${t}</span>`
      ).join('')}
    </div>
    <p style="font-size:11px;color:var(--smoke);line-height:1.7;margin-top:14px;font-style:italic">${p.desc}</p>`;

  sheet.classList.add('on');
  sheet.setAttribute('aria-hidden', 'false');
}

function closeSheet() {
  const sheet = document.getElementById('bsheet');
  sheet.classList.remove('on');
  sheet.setAttribute('aria-hidden', 'true');
}

function initSheet() {
  document.getElementById('bsClose').addEventListener('click', closeSheet);

  // Swipe-down to dismiss
  const drag  = document.getElementById('bsDrag');
  let startY  = 0;
  drag.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
  }, { passive: true });
  drag.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - startY > 70) closeSheet();
  }, { passive: true });

  // Close sheet if viewport grows past mobile breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) closeSheet();
  });
}

/* ────────────────────────────────────────────────────────────────
   CANVAS MOUSE COORDINATES (Status Bar)
──────────────────────────────────────────────────────────────── */
function initMouseCoords() {
  const cvBody = document.getElementById('cvBody');
  const sbX    = document.getElementById('sbX');
  const sbY    = document.getElementById('sbY');
  cvBody.addEventListener('mousemove', e => {
    const r = cvBody.getBoundingClientRect();
    sbX.textContent = Math.round(e.clientX - r.left);
    sbY.textContent = Math.round(e.clientY - r.top);
  });
}

/* ────────────────────────────────────────────────────────────────
   INIT
──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  boot();
  initClock();
  initBattery();
  initDropdowns();
  initHotkeys();
  initMouseCoords();
  initLayers();
  initSheet();
  renderDefaultIP();
  setInterval(rotHeroRole, 2800);
});
