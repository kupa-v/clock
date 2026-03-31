const state = {
  title: '',
  artist: '',
  album: '',
  artUrl: '',
  isPlaying: false,
  position: 0,
  duration: 0,
  lastUpdateMs: 0,
  hasData: false,
};

const nowPlaying = document.getElementById('nowPlaying');
const trackName = document.getElementById('trackName');
const artistName = document.getElementById('artistName');
const playbackStatus = document.getElementById('playbackStatus');
const playPauseBtn = document.getElementById('playPauseBtn');
const progressBar = document.getElementById('progressBar');
const elapsed = document.getElementById('elapsed');
const durationEl = document.getElementById('duration');
const albumArt = document.getElementById('albumArt');
const artPlaceholder = document.getElementById('artPlaceholder');

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

function updateNowPlayingUI() {
  const nowMs = Date.now();
  let livePosition = state.position;

  if (state.isPlaying && state.lastUpdateMs) {
    livePosition += (nowMs - state.lastUpdateMs) / 1000;
  }

  if (state.duration > 0) {
    livePosition = Math.min(livePosition, state.duration);
  }

  if (!state.hasData) {
    nowPlaying.classList.remove('active');
    return;
  }

  nowPlaying.classList.add('active');
  trackName.textContent = state.title || 'Nothing playing';
  artistName.textContent = state.artist || '';
  playbackStatus.textContent = state.isPlaying ? 'Playing on ClockPi' : 'Paused on ClockPi';
  playPauseBtn.textContent = state.isPlaying ? '⏸' : '▶';

  elapsed.textContent = formatTime(livePosition);
  durationEl.textContent = formatTime(state.duration);

  const percent = state.duration > 0 ? (livePosition / state.duration) * 100 : 0;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;

  if (state.artUrl) {
    if (albumArt.src !== state.artUrl) {
      albumArt.src = state.artUrl;
    }
    albumArt.style.display = 'block';
    artPlaceholder.style.display = 'none';
  } else {
    albumArt.style.display = 'none';
    artPlaceholder.style.display = 'grid';
  }
}

async function fetchNowPlaying() {
  try {
    const res = await fetch('/now', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    state.title = data.title || '';
    state.artist = data.artist || '';
    state.album = data.album || '';
    state.artUrl = data.art_url || '';
    state.isPlaying = Boolean(data.is_playing);
    state.position = Number(data.position || 0);
    state.duration = Number(data.duration || 0);
    state.lastUpdateMs = Date.now();
    state.hasData = Boolean(data.title || data.artist || data.duration || data.is_playing);
  } catch (err) {
    state.hasData = false;
  }

  updateNowPlayingUI();
}

async function sendControl(action) {
  try {
    await fetch(`/control/${action}`, { method: 'POST' });
    setTimeout(fetchNowPlaying, 180);
  } catch (err) {
    console.log('Control failed:', action, err);
  }
}

function drawClock(canvasId, timeZone, digitalId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const digital = document.getElementById(digitalId);
  if (!ctx || !digital) return;

  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.41;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])
  );

  const h = Number(values.hour || 0);
  const m = Number(values.minute || 0);
  const s = Number(values.second || 0);

  const seconds = s;
  const minutes = m + seconds / 60;
  const hours = (h % 12) + minutes / 60;

  ctx.clearRect(0, 0, size, size);

  const faceGrad = ctx.createRadialGradient(cx - r * 0.26, cy - r * 0.28, r * 0.16, cx, cy, r);
  faceGrad.addColorStop(0, '#262629');
  faceGrad.addColorStop(1, '#161618');

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = faceGrad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3a3a3c';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r - 18, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let i = 0; i < 60; i += 1) {
    const angle = (i * 6 - 90) * Math.PI / 180;
    const outer = r - 12;
    const inner = i % 5 === 0 ? r - 33 : r - 22;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * outer;
    const y2 = cy + Math.sin(angle) * outer;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = i % 5 === 0 ? 3 : 1.2;
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }

  drawHand(ctx, cx, cy, (hours * 30 - 90) * Math.PI / 180, r * 0.45, 8, '#ffffff');
  drawHand(ctx, cx, cy, (minutes * 6 - 90) * Math.PI / 180, r * 0.68, 5, '#ffffff');
  drawHand(ctx, cx, cy, (seconds * 6 - 90) * Math.PI / 180, r * 0.78, 2.2, '#ff453a');

  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  digital.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function drawHand(ctx, cx, cy, angle, length, width, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
}

function tick() {
  drawClock('clock-sydney', 'Australia/Sydney', 'digital-sydney');
  drawClock('clock-seoul', 'Asia/Seoul', 'digital-seoul');
  updateNowPlayingUI();
  requestAnimationFrame(tick);
}

document.getElementById('prevBtn').addEventListener('click', () => sendControl('previous'));
document.getElementById('playPauseBtn').addEventListener('click', () => sendControl('playpause'));
document.getElementById('nextBtn').addEventListener('click', () => sendControl('next'));

fetchNowPlaying();
setInterval(fetchNowPlaying, 3000);
tick();