/* Photo Booth — minimal: camera, strip, 1/3/4 shots, frames + custom frames. */

(() => {
  'use strict';

  const SHOT_COUNT_STORAGE_KEY = 'photobooth-shot-count';
  const CUSTOM_FRAMES_KEY = 'photobooth-custom-frames-v1';
  const MAX_CUSTOM_FRAMES = 8;

  const SWATCH_COLORS = ['#ff7043', '#7e57c2', '#26a69a', '#ffca28', '#ec407a', '#42a5f5', '#66bb6a', '#78909c'];

  const BUILTIN_FRAMES = [
    { value: 'none', label: 'Plain' },
    { value: 'tape', label: 'Sticker tape' },
    { value: 'scallop', label: 'Bumpy top' },
    { value: 'film', label: 'Movie holes' },
    { value: 'party', label: 'Confetti' },
    { value: 'wedding', label: 'Hearts' },
  ];

  const ACCENT_PAIR = ['#3d7dd6', '#e86f4a'];

  let boothPreviewTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const appEl = $('#app');
  const screens = {
    start: $('#start-screen'),
    booth: $('#booth-screen'),
    result: $('#result-screen'),
  };
  const video = $('#video');
  const countdownEl = $('#countdown');
  const flashEl = $('#flash');
  const shotIndicator = $('#shot-indicator');
  const captureBtn = $('#capture-btn');
  const flipBtn = $('#flip-btn');
  const exitBtn = $('#exit-btn');
  const startBtn = $('#start-btn');
  const retakeBtn = $('#retake-btn');
  const newBtn = $('#new-btn');
  const downloadBtn = $('#download-btn');
  const frameSelect = $('#frame-select');
  const deleteCustomFrameBtn = $('#delete-custom-frame-btn');
  const newFrameNameInput = $('#new-frame-name');
  const newFrameColorInput = $('#new-frame-color');
  const addCustomFrameBtn = $('#add-custom-frame-btn');
  const frameColorSwatches = $('#frame-color-swatches');
  const resultCanvas = $('#result-canvas');
  const toast = $('#toast');
  const boothPreviewCanvas = $('#booth-preview-canvas');
  const boothHintEl = $('#booth-hint');

  const state = {
    stream: null,
    facing: 'user',
    capturing: false,
    photos: [],
    layout: 'strip',
    frame: 'none',
    customFrames: [],
    /** 1, 3, or 4 — single source of truth (not read from DOM at capture time). */
    shotCount: 3,
  };

  const CSS_FILTERS = { none: 'none' };

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function loadCustomFrames() {
    try {
      const raw = localStorage.getItem(CUSTOM_FRAMES_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.color === 'string')
        .slice(0, MAX_CUSTOM_FRAMES);
    } catch (_) {
      return [];
    }
  }

  function saveCustomFrames() {
    try {
      localStorage.setItem(CUSTOM_FRAMES_KEY, JSON.stringify(state.customFrames));
    } catch (_) {
      /* ignore */
    }
  }

  function getCustomFrameById(id) {
    return state.customFrames.find((f) => f.id === id);
  }

  function rebuildFrameSelect(preferredValue) {
    const sel = frameSelect;
    const prev = preferredValue != null ? preferredValue : sel.value;
    sel.innerHTML = '';
    BUILTIN_FRAMES.forEach(({ value, label }) => {
      sel.appendChild(new Option(label, value));
    });
    state.customFrames.forEach((f) => {
      sel.appendChild(new Option(f.name, `custom:${f.id}`));
    });
    const ok = [...sel.options].some((o) => o.value === prev);
    sel.value = ok ? prev : 'none';
    state.frame = sel.value;
    updateDeleteCustomVisibility();
  }

  function updateDeleteCustomVisibility() {
    if (!deleteCustomFrameBtn) return;
    deleteCustomFrameBtn.hidden = !state.frame.startsWith('custom:');
  }

  function loadStoredShotCount() {
    try {
      const v = parseInt(localStorage.getItem(SHOT_COUNT_STORAGE_KEY), 10);
      if (v === 1 || v === 3 || v === 4) return v;
    } catch (_) {
      /* ignore */
    }
    return 3;
  }

  function saveShotCount(n) {
    if (n !== 1 && n !== 3 && n !== 4) return;
    try {
      localStorage.setItem(SHOT_COUNT_STORAGE_KEY, String(n));
    } catch (_) {
      /* ignore */
    }
  }

  function syncShotSegmentUi() {
    document.querySelectorAll('.seg-btn').forEach((btn) => {
      const v = parseInt(btn.dataset.shots, 10);
      const on = v === state.shotCount;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('seg-btn--active', on);
    });
  }

  function setShotCount(n) {
    if (n !== 1 && n !== 3 && n !== 4) return;
    state.shotCount = n;
    saveShotCount(n);
    syncShotSegmentUi();
    updateBoothHint();
    updateCaptureButtonText();
    updateCaptureButtonAria();
  }

  function setShotSegmentDisabled(disabled) {
    document.querySelectorAll('.seg-btn').forEach((b) => {
      b.disabled = disabled;
    });
  }

  function updateBoothHint() {
    if (!boothHintEl) return;
    const n = state.shotCount;
    const word = n === 1 ? 'photo' : 'photos';
    boothHintEl.innerHTML = `We take <strong>${n}</strong> ${word}. You will hear <strong>3, 2, 1</strong> before each one — stay still, then we snap!`;
  }

  function updateCaptureButtonText() {
    const n = state.shotCount;
    const label = captureBtn && captureBtn.querySelector('.shutter-label');
    if (!label) return;
    if (n === 1) label.textContent = 'Take picture';
    else label.textContent = `Take ${n} photos`;
  }

  function updateCaptureButtonAria() {
    if (!captureBtn) return;
    const n = state.shotCount;
    const word = n === 1 ? 'photo' : 'photos';
    captureBtn.setAttribute('aria-label', `Take ${n} ${word}`);
  }

  function wireShotCountControls() {
    document.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = parseInt(btn.dataset.shots, 10);
        setShotCount(v);
      });
    });
  }

  function buildSwatches() {
    if (!frameColorSwatches || !newFrameColorInput) return;
    frameColorSwatches.innerHTML = '';
    SWATCH_COLORS.forEach((hex, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch-btn';
      b.style.background = hex;
      b.setAttribute('aria-label', `Color ${i + 1}`);
      b.setAttribute('aria-pressed', hex === newFrameColorInput.value ? 'true' : 'false');
      b.addEventListener('click', () => {
        newFrameColorInput.value = hex;
        frameColorSwatches.querySelectorAll('.swatch-btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
      });
      frameColorSwatches.appendChild(b);
    });
    const first = frameColorSwatches.querySelector('.swatch-btn');
    if (first) first.setAttribute('aria-pressed', 'true');
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  let toastTimer;

  function hideToast() {
    toast.classList.remove('show');
    clearTimeout(toastTimer);
  }

  function buildConstraintCascade(facing, deviceId) {
    const attempts = [];
    if (deviceId) {
      attempts.push({ video: { deviceId: { exact: deviceId } }, audio: false });
    }
    attempts.push({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    attempts.push({ video: { facingMode: { ideal: facing } }, audio: false });
    attempts.push({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    attempts.push({ video: true, audio: false });
    return attempts;
  }

  async function tryGetStream(attempts) {
    let lastErr = null;
    for (const c of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        return { stream, used: c };
      } catch (err) {
        lastErr = err;
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') throw err;
      }
    }
    throw lastErr || new Error('No camera constraints succeeded');
  }

  async function startCamera(facing = state.facing) {
    stopCamera();
    hideToast();

    let attempts = buildConstraintCascade(facing);
    let result = null;
    try {
      result = await tryGetStream(attempts);
    } catch (err) {
      if (err.name !== 'NotAllowedError' && err.name !== 'SecurityError') {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cams = devices.filter((d) => d.kind === 'videoinput');
          for (const cam of cams) {
            try {
              result = await tryGetStream(buildConstraintCascade(facing, cam.deviceId));
              break;
            } catch (e) {
              /* next */
            }
          }
        } catch (_) {
          /* ignore */
        }
      }

      if (!result) return handleCameraError(err, facing);
    }

    state.stream = result.stream;
    state.facing = facing;
    video.srcObject = result.stream;
    video.style.transform = facing === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    await video.play().catch(() => {});
    startBoothPreviewLoop();
    return true;
  }

  function handleCameraError(err, facing) {
    let msg = 'We could not open the camera.';
    let retryable = true;
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      msg = 'Camera is off. Ask a grown-up to allow the camera for this site, then tap Retry.';
    } else if (err.name === 'NotFoundError') {
      msg = 'No camera was found.';
      retryable = false;
    } else if (err.name === 'OverconstrainedError') {
      msg = 'This camera did not start. Try again or use another device.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      msg = 'The camera is busy. Close other apps using it, then try again.';
    } else if (err.name === 'AbortError') {
      msg = 'The camera stopped. Tap Retry.';
    }
    showToast(
      msg,
      0,
      retryable
        ? {
            label: 'Retry',
            onClick: async () => {
              const ok = await startCamera(facing);
              if (ok) hideToast();
            },
          }
        : null
    );
    return false;
  }

  function showToast(msg, ms = 3200, action = null) {
    toast.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    toast.appendChild(span);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.className = 'toast-action';
      btn.addEventListener('click', () => {
        toast.classList.remove('show');
        action.onClick();
      });
      toast.appendChild(btn);
    }
    toast.classList.add('show');
    clearTimeout(toastTimer);
    if (ms > 0) {
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, ms);
    }
  }

  function stopBoothPreviewLoop() {
    if (boothPreviewTimer !== null) {
      clearInterval(boothPreviewTimer);
      boothPreviewTimer = null;
    }
  }

  function stopCamera() {
    stopBoothPreviewLoop();
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }
  }

  async function flipCamera() {
    const next = state.facing === 'user' ? 'environment' : 'user';
    const ok = await startCamera(next);
    if (!ok) {
      await startCamera(state.facing);
    }
  }

  function waitNextVideoFrameOn(vid) {
    return new Promise((resolve) => {
      if (!vid) {
        resolve();
        return;
      }
      if (typeof vid.requestVideoFrameCallback === 'function') {
        vid.requestVideoFrameCallback(() => resolve());
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 24);
        });
      });
    });
  }

  async function waitUntilVideoReady(vid) {
    if (!vid) return;
    if (vid.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        vid.addEventListener('loadeddata', done, { once: true });
        vid.addEventListener('canplay', done, { once: true });
        setTimeout(done, 2000);
      });
    }
    await waitNextVideoFrameOn(vid);
    await waitNextVideoFrameOn(vid);
  }

  async function tryCaptureViaVideoFrame(track, paintFrame) {
    if (typeof MediaStreamTrackProcessor === 'undefined') return false;
    let processor;
    let reader;
    let vf = null;
    try {
      processor = new MediaStreamTrackProcessor({ track });
      reader = processor.readable.getReader();
      const { value, done } = await reader.read();
      if (done || !value) return false;
      vf = value;
      paintFrame(vf);
      return true;
    } catch (e) {
      return false;
    } finally {
      try {
        if (vf && typeof vf.close === 'function') vf.close();
      } catch (_) {}
      try {
        reader?.releaseLock?.();
      } catch (_) {}
      try {
        await processor?.readable?.cancel?.();
      } catch (_) {}
    }
  }

  function drawCover(ctx, img, dx, dy, dw, dh) {
    const iw = img.videoWidth || img.width;
    const ih = img.videoHeight || img.height;
    if (!iw || !ih) return;
    const ir = iw / ih;
    const tr = dw / dh;
    let sx;
    let sy;
    let sw;
    let sh;
    if (ir > tr) {
      sh = ih;
      sw = ih * tr;
      sx = (iw - sw) / 2;
      sy = 0;
    } else {
      sw = iw;
      sh = iw / tr;
      sx = 0;
      sy = (ih - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  async function paintOneFrameOntoContext(ctx, vid, stream, facing, previewMode) {
    const vw = vid.videoWidth;
    const vh = vid.videoHeight;
    if (!vw || !vh) return false;
    const track = stream.getVideoTracks && stream.getVideoTracks()[0];
    const filterStr = 'none';

    const paintSource = (source) => {
      ctx.save();
      ctx.filter = filterStr;
      if (facing === 'user') {
        ctx.translate(vw, 0);
        ctx.scale(-1, 1);
      }
      drawCover(ctx, source, 0, 0, vw, vh);
      ctx.restore();
      ctx.filter = 'none';
    };

    if (!previewMode && track && track.readyState === 'live') {
      const okVf = await tryCaptureViaVideoFrame(track, (frame) => paintSource(frame));
      if (okVf) return true;
    }

    if (typeof ImageCapture !== 'undefined' && track && track.readyState === 'live') {
      const attempts = previewMode ? 1 : 4;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const ic = new ImageCapture(track);
          const bmp = await ic.grabFrame();
          paintSource(bmp);
          bmp.close();
          return true;
        } catch (err) {
          if (!previewMode) await new Promise((r) => setTimeout(r, 40));
        }
      }
    }

    ctx.save();
    ctx.filter = filterStr;
    if (facing === 'user') {
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
    }
    drawCover(ctx, vid, 0, 0, vw, vh);
    ctx.restore();
    ctx.filter = 'none';
    return true;
  }

  async function grabFrameFromStream(vid, stream, facing) {
    if (!vid || !stream) return null;
    await waitUntilVideoReady(vid);
    const vw = vid.videoWidth;
    const vh = vid.videoHeight;
    if (!vw || !vh) return null;

    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    let ctx;
    try {
      ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    } catch (_) {
      ctx = canvas.getContext('2d', { alpha: false });
    }
    await paintOneFrameOntoContext(ctx, vid, stream, facing, false);
    return {
      dataURL: canvas.toDataURL('image/jpeg', 0.92),
      width: vw,
      height: vh,
    };
  }

  async function tickPreviewCanvas(canvasEl, vid, stream, facing) {
    if (!canvasEl || !vid || !stream) return;
    const vw = vid.videoWidth;
    const vh = vid.videoHeight;
    if (!vw || !vh) return;
    if (canvasEl.width !== vw || canvasEl.height !== vh) {
      canvasEl.width = vw;
      canvasEl.height = vh;
    }
    let ctx;
    try {
      ctx = canvasEl.getContext('2d', { alpha: false, willReadFrequently: true });
    } catch (_) {
      ctx = canvasEl.getContext('2d', { alpha: false });
    }
    await paintOneFrameOntoContext(ctx, vid, stream, facing, true);
  }

  function startBoothPreviewLoop() {
    stopBoothPreviewLoop();
    if (!boothPreviewCanvas) return;
    boothPreviewTimer = window.setInterval(() => {
      if (!state.stream || state.capturing) return;
      if (!screens.booth.classList.contains('active')) return;
      tickPreviewCanvas(boothPreviewCanvas, video, state.stream, state.facing).catch(() => {});
    }, 55);
  }

  async function capturePhoto() {
    return grabFrameFromStream(video, state.stream, state.facing);
  }

  function showCountdownNumber(n) {
    return new Promise((resolve) => {
      countdownEl.textContent = String(n);
      countdownEl.setAttribute('aria-label', `Count ${n}`);
      countdownEl.classList.remove('visible');
      void countdownEl.offsetWidth;
      if (!prefersReducedMotion()) {
        countdownEl.classList.add('visible');
      } else {
        countdownEl.style.opacity = '1';
      }
      playBeep(n === 1 ? 'high' : 'low');
      setTimeout(resolve, prefersReducedMotion() ? 650 : 1000);
    });
  }

  async function countdownFor(seconds) {
    for (let i = seconds; i >= 1; i--) {
      await showCountdownNumber(i);
    }
    countdownEl.classList.remove('visible');
    countdownEl.style.opacity = '';
    countdownEl.removeAttribute('aria-label');
  }

  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playBeep(kind = 'low') {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'high' ? 880 : 520;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  function playShutter() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.32;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  async function runCaptureSequence() {
    if (state.capturing) return;
    const total = state.shotCount;
    state.capturing = true;
    state.photos = [];
    captureBtn.disabled = true;
    flipBtn.disabled = true;
    setShotSegmentDisabled(true);

    try {
      for (let i = 0; i < total; i++) {
        shotIndicator.textContent = `Photo ${i + 1} of ${total}`;
        shotIndicator.classList.add('visible');
        await countdownFor(3);

        const photo = await capturePhoto();
        if (photo) state.photos.push(photo);

        if (!prefersReducedMotion()) {
          flashEl.classList.remove('fire');
          void flashEl.offsetWidth;
          flashEl.classList.add('fire');
        } else {
          flashEl.classList.add('fire');
          setTimeout(() => flashEl.classList.remove('fire'), 120);
        }
        playShutter();

        await new Promise((r) => setTimeout(r, 550));
      }
    } catch (_) {
      showToast('Something went wrong. Try again.');
    } finally {
      shotIndicator.classList.remove('visible');
      state.capturing = false;
      captureBtn.disabled = false;
      flipBtn.disabled = false;
      setShotSegmentDisabled(false);
    }

    if (state.photos.length > 0) {
      state.frame = 'none';
      rebuildFrameSelect('none');
      showScreen('result');
      await renderResult();
    }
  }

  async function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCustomFrame(ctx, def, canvasW, canvasH) {
    const c = def.color || '#333333';
    const style = def.style || 'thick';
    ctx.save();
    if (style === 'thick') {
      const lw = Math.min(26, Math.max(12, canvasW * 0.028));
      ctx.strokeStyle = c;
      ctx.lineWidth = lw;
      roundRect(ctx, lw / 2, lw / 2, canvasW - lw, canvasH - lw, 10);
      ctx.stroke();
    } else if (style === 'dots') {
      ctx.fillStyle = c;
      const r = Math.min(16, canvasW * 0.02);
      const pts = [
        [canvasW * 0.12, canvasH * 0.1],
        [canvasW * 0.5, 22],
        [canvasW * 0.88, canvasH * 0.1],
        [canvasW - 20, canvasH * 0.5],
        [canvasW * 0.88, canvasH * 0.9],
        [canvasW * 0.5, canvasH - 22],
        [canvasW * 0.12, canvasH * 0.9],
        [20, canvasH * 0.5],
      ];
      pts.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.min(12, canvasW * 0.015);
      ctx.lineJoin = 'round';
      const amp = Math.min(14, canvasH * 0.025);
      const yTop = 24;
      const yBot = canvasH - 24;
      for (const y of [yTop, yBot]) {
        ctx.beginPath();
        for (let x = 0; x <= canvasW; x += 6) {
          const yy = y + Math.sin(x * 0.05) * amp;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFrameOverlay(ctx, frameKey, canvasW, canvasH) {
    if (frameKey && frameKey.startsWith('custom:')) {
      const id = frameKey.slice(7);
      const def = getCustomFrameById(id);
      if (def) drawCustomFrame(ctx, def, canvasW, canvasH);
      return;
    }

    const frame = frameKey;
    const border = true;
    if (!frame || frame === 'none') return;
    ctx.save();
    if (frame === 'tape') {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = border ? '#f8e8c8' : '#6a5a40';
      for (const [tx, ty, rot] of [
        [28, 18, -0.35],
        [canvasW - 120, 22, 0.4],
      ]) {
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(rot);
        roundRect(ctx, 0, 0, 88, 28, 4);
        ctx.fill();
        ctx.restore();
      }
    } else if (frame === 'scallop') {
      const col = border ? '#ffb7c5' : '#ff8fb0';
      ctx.fillStyle = col;
      const r = 14;
      const y0 = 0;
      for (let x = 0; x < canvasW + r; x += r * 2) {
        ctx.beginPath();
        ctx.arc(x, y0 + r, r, Math.PI, 0);
        ctx.fill();
      }
    } else if (frame === 'film') {
      ctx.fillStyle = border ? '#222' : '#ccc';
      const holeH = 12;
      for (let y = 24; y < canvasH - 24; y += 22) {
        roundRect(ctx, 10, y, 14, holeH, 3);
        ctx.fill();
        roundRect(ctx, canvasW - 24, y, 14, holeH, 3);
        ctx.fill();
      }
    } else if (frame === 'party') {
      const colors = ['#ff7043', '#7e57c2', '#42a5f5', '#ffca28', '#66bb6a'];
      for (let i = 0; i < 36; i++) {
        const px = (Math.sin(i * 1.7) * 0.5 + 0.5) * (canvasW - 20) + 10;
        const py = (Math.cos(i * 1.3) * 0.5 + 0.5) * (canvasH - 20) + 10;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(px, py, 4 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (frame === 'wedding') {
      ctx.strokeStyle = 'rgba(180, 160, 200, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, canvasW - 24, canvasH - 24);
      ctx.fillStyle = '#e8d4e8';
      const hearts = [
        [canvasW * 0.12, canvasH * 0.1],
        [canvasW * 0.88, canvasH * 0.12],
      ];
      hearts.forEach(([hx, hy]) => {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(0.9, 0.9);
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.bezierCurveTo(-8, -6, -14, 4, 0, 14);
        ctx.bezierCurveTo(14, 4, 8, -6, 0, 4);
        ctx.fill();
        ctx.restore();
      });
    }
    ctx.restore();
  }

  async function renderResult() {
    if (state.photos.length === 0) return;

    const border = true;
    const frame = state.frame;
    const [accentA, accentB] = ACCENT_PAIR;

    const photoW = 800;
    const photoH = Math.round(photoW * 0.75);
    const pad = 32;
    const gap = 20;
    const capH = 0;

    const canvasW = pad * 2 + photoW;
    const canvasH = pad * 2 + state.photos.length * photoH + (state.photos.length - 1) * gap + capH;
    const positions = state.photos.map((_, i) => ({
      x: pad,
      y: pad + i * (photoH + gap),
    }));

    resultCanvas.width = canvasW;
    resultCanvas.height = canvasH;
    const ctx = resultCanvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
    bgGrad.addColorStop(0, '#ffffff');
    bgGrad.addColorStop(1, '#f4f8fc');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    const barGrad = ctx.createLinearGradient(0, 0, canvasW, 0);
    barGrad.addColorStop(0, accentA);
    barGrad.addColorStop(1, accentB);
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, canvasW, 8);

    const imgs = await Promise.all(state.photos.map((p) => loadImage(p.dataURL)));
    for (let i = 0; i < imgs.length; i++) {
      const { x, y } = positions[i];
      const img = imgs[i];
      ctx.save();
      ctx.filter = CSS_FILTERS.none;
      roundRect(ctx, x, y, photoW, photoH, 8);
      ctx.clip();
      drawCover(ctx, img, x, y, photoW, photoH);
      ctx.restore();
    }

    drawFrameOverlay(ctx, frame, canvasW, canvasH);
  }

  function triggerDownload(canvas, filename, mime) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined);
    link.click();
  }

  function downloadResultPng() {
    if (state.photos.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    triggerDownload(resultCanvas, `photo-booth-${stamp}.png`, 'image/png');
    showToast('Saved! Check your Downloads folder.');
  }

  function registerSw() {
    if (!('serviceWorker' in navigator)) return;
    const swUrl = new URL('./sw.js', window.location.href).href;
    navigator.serviceWorker.register(swUrl).catch(() => {});
  }

  function newFrameId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `f-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  function selectedNewFrameStyle() {
    const el = document.querySelector('input[name="new-frame-style"]:checked');
    return el ? el.value : 'thick';
  }

  function onAddCustomFrame() {
    if (state.customFrames.length >= MAX_CUSTOM_FRAMES) {
      showToast(`You can save up to ${MAX_CUSTOM_FRAMES} frames. Remove one first.`);
      return;
    }
    let name = (newFrameNameInput && newFrameNameInput.value.trim()) || 'My frame';
    if (name.length > 18) name = name.slice(0, 18);
    const color = (newFrameColorInput && newFrameColorInput.value) || '#ff7043';
    const style = ['thick', 'dots', 'wave'].includes(selectedNewFrameStyle()) ? selectedNewFrameStyle() : 'thick';
    const id = newFrameId();
    state.customFrames.push({ id, name, color, style });
    saveCustomFrames();
    rebuildFrameSelect(`custom:${id}`);
    if (newFrameNameInput) newFrameNameInput.value = '';
    renderResult().catch(() => {});
    showToast('Your new frame is ready!');
  }

  function onDeleteCustomFrame() {
    if (!state.frame.startsWith('custom:')) return;
    const id = state.frame.slice(7);
    state.customFrames = state.customFrames.filter((f) => f.id !== id);
    saveCustomFrames();
    rebuildFrameSelect('none');
    renderResult().catch(() => {});
    showToast('Frame removed.');
  }

  startBtn.addEventListener('click', async () => {
    getAudioCtx();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('This browser cannot use the camera here.', 5000);
      return;
    }
    showScreen('booth');
    const ok = await startCamera('user');
    if (!ok) showScreen('start');
  });

  captureBtn.addEventListener('click', () => {
    getAudioCtx();
    runCaptureSequence();
  });

  flipBtn.addEventListener('click', () => {
    if (state.capturing) return;
    flipCamera();
  });

  exitBtn.addEventListener('click', () => {
    if (state.capturing) return;
    stopCamera();
    state.photos = [];
    showScreen('start');
  });

  retakeBtn.addEventListener('click', async () => {
    state.photos = [];
    showScreen('booth');
    const ok = await startCamera(state.facing);
    if (!ok) showScreen('start');
  });

  newBtn.addEventListener('click', () => {
    stopCamera();
    state.photos = [];
    showScreen('start');
  });

  downloadBtn.addEventListener('click', downloadResultPng);

  frameSelect.addEventListener('change', () => {
    state.frame = frameSelect.value;
    updateDeleteCustomVisibility();
    renderResult().catch(() => {});
  });

  if (deleteCustomFrameBtn) {
    deleteCustomFrameBtn.addEventListener('click', onDeleteCustomFrame);
  }
  if (addCustomFrameBtn) {
    addCustomFrameBtn.addEventListener('click', onAddCustomFrame);
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && screens.booth.classList.contains('active') && !state.capturing) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      getAudioCtx();
      runCaptureSequence();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.stream && !state.capturing) {
      video.pause();
    } else if (!document.hidden && state.stream) {
      video.play().catch(() => {});
    }
  });

  state.customFrames = loadCustomFrames();
  state.shotCount = loadStoredShotCount();
  rebuildFrameSelect('none');
  buildSwatches();
  wireShotCountControls();
  syncShotSegmentUi();
  updateBoothHint();
  updateCaptureButtonText();
  updateCaptureButtonAria();
  if (appEl) appEl.classList.add('theme-playful');
  registerSw();
})();
