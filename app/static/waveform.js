import { $ } from './dom.js';

let waveBuffer = null;
let wavePeaks = [];
let waveAnim = null;
let audioCtx = null;

export function getWavePeaks() { return wavePeaks; }

export function fmtTime(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

export function sizeCanvas() {
  const c = $('#wave-canvas');
  if (!c) return;
  c.width = c.clientWidth * devicePixelRatio;
  c.height = c.clientHeight * devicePixelRatio;
  if (wavePeaks.length) drawWave(0);
}

export function computePeaks() {
  if (!waveBuffer) return;
  const data = waveBuffer.getChannelData(0);
  const canvas = $('#wave-canvas');
  if (!canvas) return;
  const bars = Math.floor(canvas.width / (devicePixelRatio * 3));
  const chunk = Math.floor(data.length / bars);
  wavePeaks = [];
  for (let i = 0; i < bars; i++) {
    let mx = 0;
    for (let j = 0; j < chunk; j++) {
      const v = Math.abs(data[i * chunk + j]);
      if (v > mx) mx = v;
    }
    wavePeaks.push(mx);
  }
}

export function drawWave(progress) {
  const c = $('#wave-canvas');
  if (!c || !wavePeaks.length) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const barW = devicePixelRatio * 2;
  const gap = devicePixelRatio * 1;
  const tot = barW + gap;
  const played = Math.floor(wavePeaks.length * progress);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--engine-color').trim() || '#6366f1';
  for (let i = 0; i < wavePeaks.length; i++) {
    const h = Math.max(2, wavePeaks[i] * H * 0.9);
    ctx.fillStyle = i < played ? accent : 'rgba(128,128,128,.35)';
    ctx.fillRect(i * tot, (H - h) / 2, barW, h);
  }
}

export async function loadWaveform(url) {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    waveBuffer = await audioCtx.decodeAudioData(buf);
    computePeaks();
    drawWave(0);
  } catch (_) {}
}

export function stopWaveAnim() {
  if (waveAnim) cancelAnimationFrame(waveAnim);
  waveAnim = null;
}

export function startWaveAnim(audioEl) {
  stopWaveAnim();
  function tick() {
    if (!audioEl.paused && audioEl.duration) {
      drawWave(audioEl.currentTime / audioEl.duration);
    }
    waveAnim = requestAnimationFrame(tick);
  }
  tick();
}
