import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';

const root = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

// Shared with the WebGL scene (in a worker when possible); call syncGL() after changes.
const state = { morph: 0, mouse: { x: 0, y: 0 }, pointer: false, hold: false, reduced };
let gl = null;
const syncGL = () => gl?.sync();

if (!reduced) root.classList.add('motion');

/* ---------------- Smooth scroll ---------------- */

let lenis = null;
function setupScroll() {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, anchors: { offset: 0 }, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Yield to the browser between setup phases so start-up never forms one long task.
const nextTask = () => (globalThis.scheduler?.yield ? scheduler.yield() : new Promise((r) => setTimeout(r, 0)));

/* ---------------- Text splitting ---------------- */

function splitWords(el) {
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.append(part);
          else {
            const w = document.createElement('span');
            w.className = 'w';
            w.textContent = part;
            frag.append(w);
          }
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    });
  };
  walk(el);
  return $$('.w', el);
}

/* ---------------- Scramble eyebrows ---------------- */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/+*';
function prepScramble(el) {
  const text = el.textContent;
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = text;
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  vis.textContent = text;
  el.append(sr, vis);
  el._scr = { vis, text, raf: 0 };
}
function scramble(el) {
  const s = el._scr;
  if (!s || reduced) return;
  cancelAnimationFrame(s.raf);
  // Lock the box while glyph widths churn so a re-wrap can never shift the layout.
  el.style.height = `${el.offsetHeight}px`;
  const start = performance.now();
  const n = s.text.length;
  const tick = (now) => {
    const f = (now - start) / 28;
    let out = '';
    for (let i = 0; i < n; i++) {
      const ch = s.text[i];
      if (ch === ' ' || f > i * 0.7 + 7) out += ch;
      else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    s.vis.textContent = out;
    if (f <= (n - 1) * 0.7 + 7) s.raf = requestAnimationFrame(tick);
    else el.style.height = '';
  };
  s.raf = requestAnimationFrame(tick);
}

$$('.eyebrow').forEach((el) => {
  prepScramble(el);
  el.addEventListener('pointerenter', () => scramble(el));
});

/* ---------------- Reveals ---------------- */

async function setupReveals() {
  // Hero is animated by CSS (LCP-safe); everything below the fold is revealed on scroll.
  $$('.section-title, .contact-title').forEach((title) => {
    gsap.from($$('.split', title), {
      yPercent: 112,
      rotate: 2,
      duration: 1.4,
      ease: 'aixm',
      stagger: 0.09,
      scrollTrigger: { trigger: title, start: 'top 88%' },
    });
  });

  await nextTask();
  $$('[data-words]').forEach((el) => {
    const words = splitWords(el);
    // Dimmed words stay ≥ 3:1 contrast (large text) even before they light up.
    gsap.fromTo(words, { opacity: 0.4 }, {
      opacity: 1,
      ease: 'none',
      stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 48%', scrub: true },
    });
  });

  await nextTask();
  $$('main section:not(.hero) .eyebrow').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: () => scramble(el) });
  });

  await nextTask();
  const groups = [['.stats', '.stat'], ['.cards', '.card'], ['.eng-grid', '.eng'], ['.contact', '.contact-cta']];
  groups.forEach(([parent, child]) => {
    $$(parent).forEach((p) => {
      gsap.from($$(child, p), {
        y: 60,
        opacity: 0,
        duration: 1.3,
        ease: 'aixm',
        stagger: 0.1,
        scrollTrigger: { trigger: p, start: 'top 85%' },
      });
    });
  });
  const note = $('.engineering .note');
  if (note) gsap.from(note, { opacity: 0, y: 20, duration: 1, ease: 'aixm', scrollTrigger: { trigger: note, start: 'top 92%' } });

  await nextTask();
  // Count-up stats.
  $$('[data-count]').forEach((el) => {
    const end = +el.dataset.count;
    const o = { v: 0 };
    el.textContent = '0';
    ScrollTrigger.create({
      trigger: el.closest('.stats') || el,
      start: 'top 85%',
      once: true,
      onEnter: () => gsap.to(o, { v: end, duration: 1.8, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); } }),
    });
  });

  await nextTask();
  // Hero parallax out.
  gsap.to('.hero-title', {
    yPercent: -18,
    opacity: 0.25,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

/* ---------------- Pinned horizontal process ---------------- */

function setupProcess() {
  const section = $('.process');
  const track = $('.process-track');
  const rail = $('.process-rail i');
  if (!section || !track) return;
  const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
  const tween = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + distance(),
      pin: true,
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: (st) => rail && gsap.set(rail, { scaleX: st.progress }),
    },
  });
  $$('.step', track).forEach((step) => {
    gsap.from(step, {
      opacity: 0.2,
      scale: 0.92,
      rotateY: -8,
      transformPerspective: 1000,
      ease: 'none',
      scrollTrigger: { trigger: step, containerAnimation: tween, start: 'left 100%', end: 'left 60%', scrub: true },
    });
  });
}

/* ---------------- Scene beat from scroll ---------------- */

let beats = [];
function measureBeats() {
  beats = $$('[data-scene]').map((el) => {
    const box = el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
    const r = box.getBoundingClientRect();
    return { top: r.top + window.scrollY, h: Math.max(1, r.height) };
  });
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function updateMorph() {
  if (!beats.length) return;
  const mid = window.scrollY + window.innerHeight * 0.5;
  let m = 0;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (mid < b.top) break;
    // Hold each form, then morph into the next across the section's last stretch.
    m = i + (i < beats.length - 1 ? smooth(0.62, 1, (mid - b.top) / b.h) : 0);
  }
  if (m === state.morph) return;
  state.morph = m;
  syncGL();
}

/* ---------------- Nav ---------------- */

function setupNav() {
  const nav = $('.nav');
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', !reduced && y > 600 && y > lastY + 2);
    if (y < lastY - 2) nav.classList.remove('is-hidden');
    lastY = y;
  };
  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });
  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
}

/* ---------------- Pointer: cursor, magnetic, tilt, field ---------------- */

function setupPointer() {
  window.addEventListener('pointermove', (e) => {
    state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    state.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    state.pointer = e.pointerType === 'mouse' || e.pointerType === 'pen';
    syncGL();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { state.pointer = false; syncGL(); });
  // Hidden interaction: click & hold anywhere off a control to gather the field.
  window.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('a, button')) { state.hold = true; syncGL(); }
  });
  window.addEventListener('pointerup', () => { state.hold = false; syncGL(); });
  window.addEventListener('blur', () => { state.hold = false; syncGL(); });

  if (!finePointer || reduced) return;

  root.classList.add('has-cursor');
  const cursor = $('.cursor');
  const cx = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' });
  const cy = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
  window.addEventListener('pointermove', (e) => { cx(e.clientX); cy(e.clientY); }, { passive: true });
  window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
  window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  document.addEventListener('pointerover', (e) => {
    cursor.classList.toggle('is-hover', !!e.target.closest('a, button, .tilt'));
  });

  $$('.magnetic').forEach((btn) => {
    const label = $('span', btn);
    const bx = gsap.quickTo(btn, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    const by = gsap.quickTo(btn, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    const lx = gsap.quickTo(label, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    const ly = gsap.quickTo(label, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      bx(dx * 0.32); by(dy * 0.42); lx(dx * 0.14); ly(dy * 0.18);
    });
    btn.addEventListener('pointerleave', () => { bx(0); by(0); lx(0); ly(0); });
  });

  $$('.tilt').forEach((card) => {
    const rx = gsap.quickTo(card, 'rotationX', { duration: 0.7, ease: 'power3' });
    const ry = gsap.quickTo(card, 'rotationY', { duration: 0.7, ease: 'power3' });
    gsap.set(card, { transformPerspective: 1000 });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
      rx((0.5 - py) * 9);
      ry((px - 0.5) * 11);
    });
    card.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

/* ---------------- WebGL (lazy) ---------------- */

// Context creation, quality probing (incl. software-GL rejection), geometry and
// shader compiles all happen in gl/host.js — in a worker when OffscreenCanvas exists.
function bootGL() {
  import('./gl/host.js')
    .then((m) => m.startGL($('#gl'), state))
    .then((scene) => {
      gl = scene;
      root.classList.add('gl-ready');
    })
    .catch((err) => {
      console.warn('[aixm] WebGL disabled:', err);
      root.classList.add('no-webgl');
    });
}

function whenIdle(fn) {
  const run = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 300));
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

/* ---------------- Init ---------------- */

async function init() {
  // Let the first frame (and LCP) paint before GSAP measures the document.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('aixm', 'M0,0 C0.12,0.7 0.18,1 1,1');
  await nextTask();
  if (!reduced) setupScroll();
  setupNav();
  setupPointer();
  ScrollTrigger.addEventListener('refresh', () => { measureBeats(); updateMorph(); });

  if (reduced) {
    // Native scroll, no pin, final values in place, static WebGL frame.
    window.addEventListener('scroll', updateMorph, { passive: true });
    window.addEventListener('resize', () => { measureBeats(); updateMorph(); }, { passive: true });
  } else {
    scramble($('.hero .eyebrow'));
    await nextTask();
    await setupReveals();
    await nextTask();
    setupProcess();
    lenis.on('scroll', updateMorph);
    ScrollTrigger.refresh();
  }

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  measureBeats();
  updateMorph();
  whenIdle(bootGL);
}

init();
