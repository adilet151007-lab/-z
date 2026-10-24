import { ANIMATION_MODULES } from './achievement-animations.js';

export const hasAchievementAnimation = id => Object.hasOwn(ANIMATION_MODULES, id);
let threePromise;
const loadThree = () => threePromise ||= import('/vendor/three/build/three.module.js').catch(error => { threePromise = null; throw error; });
const loadAnimation = id => import(ANIMATION_MODULES[id]);

export function disposeAnimationScene(scene) {
  if (!scene) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) if (uniform?.value?.isTexture) textures.add(uniform.value);
    }
  });
  for (const value of [scene.background, scene.environment]) if (value?.isTexture) textures.add(value);
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
  scene.clear();
}

// Every animation supplies createAnimation({ THREE, reducedMotion }) and timing.
// This host owns loading, controls, resizing, frame limits and complete teardown.
export function mountAchievementAnimation(host, award, options = {}) {
  const env = options.environment || globalThis, doc = env.document;
  const reducedMotion = !!env.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const mobile = !!env.matchMedia?.('(max-width: 700px), (pointer: coarse)').matches;
  let stopped = false, frame = 0, deadline = 0, renderer, animation, observer;
  let startedAt = 0, lastPaint = -Infinity, lastUpdate = 0;
  const listeners = [];
  host.classList.add('achievement-custom');
  host.innerHTML = '<div class="award-stage"><canvas aria-hidden="true"></canvas><div class="award-loading" role="status">Подготовка анимации…</div><div class="award-static" aria-hidden="true">0</div></div><aside class="award-caption" role="status" aria-live="polite"><small></small><strong></strong><span></span></aside><button class="achievement-skip" type="button">Закрыть ×</button>';
  const stage = host.querySelector('.award-stage'), canvas = host.querySelector('canvas');
  const loading = host.querySelector('.award-loading'), caption = host.querySelector('.award-caption');
  host.querySelector('.award-static').textContent=award.achievementId==='zero-card'?'0':'✧';
  caption.querySelector('small').textContent = options.preview ? 'ПРЕДПРОСМОТР' : 'ДОСТИЖЕНИЕ ПОЛУЧЕНО';
  caption.querySelector('strong').textContent = award.title || '';
  caption.querySelector('span').textContent = award.recipientName || '';
  const listen = (target, name, handler, settings) => {
    target.addEventListener(name, handler, settings);
    listeners.push(() => target.removeEventListener(name, handler, settings));
  };
  const teardown = () => {
    if (stopped) return;
    stopped = true;
    env.cancelAnimationFrame(frame); env.clearTimeout(deadline);
    observer?.disconnect(); listeners.forEach(remove => remove());
    try { animation?.dispose?.(); } finally {
      disposeAnimationScene(animation?.scene);
      renderer?.renderLists?.dispose(); renderer?.dispose(); renderer?.forceContextLoss?.();
      animation = null; renderer = null;
    }
  };
  const finish = () => { if (stopped) return; teardown(); options.onDone?.(); };
  const resize = () => {
    if (stopped || !renderer || !animation) return;
    const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false); animation.resize?.(width, height);
    if (reducedMotion) renderer.render(animation.scene, animation.camera);
  };
  const showFallback = () => {
    if (stopped) return;
    loading.hidden = true; host.classList.add('award-fallback'); caption.classList.add('on');
    deadline = env.setTimeout(finish, 3500);
  };
  listen(host.querySelector('button'), 'click', finish);
  listen(doc, 'keydown', event => { if (event.key === 'Escape') finish(); });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) finish(); });
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); finish(); });
  listen(stage, 'pointermove', event => {
    if (stopped || !animation || reducedMotion) return;
    const box = stage.getBoundingClientRect();
    const clamp = value => Math.max(-1, Math.min(1, value));
    animation.setPointer?.(clamp((event.clientX - box.left) / Math.max(1, box.width) * 2 - 1), clamp((event.clientY - box.top) / Math.max(1, box.height) * 2 - 1));
  }, { passive: true });
  listen(stage, 'pointerleave', () => animation?.setPointer?.(0, 0));
  listen(env, 'resize', resize);
  let loadingExpired=false;
  deadline = env.setTimeout(() => {loadingExpired=true;showFallback()}, 12000);
  (async () => {
    let loaded;
    try {
      const [module, THREE] = await Promise.all([(options.loadAnimation || loadAnimation)(award.achievementId), (options.loadThree || loadThree)()]);
      if (stopped || doc.hidden || loadingExpired) { if(doc.hidden)finish(); return; }
      env.clearTimeout(deadline);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(env.devicePixelRatio || 1, mobile || reducedMotion ? 1 : 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled=!mobile&&!reducedMotion;
      loaded = module.createAnimation({ THREE, reducedMotion, lowPower: mobile }); animation = loaded;
      if (!animation?.scene || !animation?.camera || typeof animation.update !== 'function') throw new Error('Invalid animation module');
      const duration = Math.max(500, Math.min(15000, Number(module.durationMs) || 6000));
      const captionAt = Math.max(0, Math.min(duration, Number(module.captionAtMs) || 0));
      resize(); loading.hidden = true;
      if (env.ResizeObserver) { observer = new env.ResizeObserver(resize); observer.observe(stage); }
      if (reducedMotion) {
        animation.update(duration / 1000, 0); renderer.render(animation.scene, animation.camera);
        caption.classList.add('on'); deadline = env.setTimeout(finish, 3500); return;
      }
      startedAt = env.performance.now();
      const tick = now => {
        frame = 0;
        if (stopped) return;
        const elapsed = Math.max(0, now - startedAt);
        if (now - lastPaint >= 1000 / 30 || elapsed >= duration) {
          try {
            const current = Math.min(duration, elapsed) / 1000;
            animation.update(current, Math.max(0, Math.min(.1, current - lastUpdate))); lastUpdate = current;
            renderer.render(animation.scene, animation.camera); lastPaint = now;
            caption.classList.toggle('on', elapsed >= captionAt);
          } catch { finish(); return; }
        }
        if (elapsed < duration) frame = env.requestAnimationFrame(tick);
      };
      frame = env.requestAnimationFrame(tick); deadline = env.setTimeout(finish, duration + 700);
    } catch {
      if (stopped) return;
      env.clearTimeout(deadline); disposeAnimationScene(loaded?.scene);
      renderer?.dispose(); renderer?.forceContextLoss?.(); renderer = null; animation = null;
      showFallback();
    }
  })();
  return teardown;
}
