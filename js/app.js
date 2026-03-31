const state = {
  title: "",
  artist: "",
  album: "",
  isPlaying: false,
  position: 0,
  duration: 0,
  lastUpdateMs: 0,
  hasData: false,
  selectedProfileId: "",
  profiles: [],
};

const nowPlaying = document.getElementById("nowPlaying");
const trackName = document.getElementById("trackName");
const artistName = document.getElementById("artistName");
const elapsed = document.getElementById("elapsed");
const durationEl = document.getElementById("duration");
const textProgressBar = document.getElementById("textProgressBar");
const npIcon = document.getElementById("npIcon");

const profileDot = document.getElementById("profileDot");
const profileMenu = document.getElementById("profileMenu");
const profileList = document.getElementById("profileList");
const profileStatus = document.getElementById("profileStatus");

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

function makeTextBar(percent) {
  const total = 10;
  const filled = Math.max(0, Math.min(total, Math.round(percent * total)));
  const empty = total - filled;
  return "█".repeat(filled) + "░".repeat(empty);
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
    nowPlaying.classList.remove("active");
    return;
  }

  nowPlaying.classList.add("active");

  const percent = state.duration > 0 ? livePosition / state.duration : 0;
  const bar = makeTextBar(percent);

  trackName.textContent = state.title || "Nothing playing";
  artistName.textContent = state.artist || "";
  elapsed.textContent = formatTime(livePosition);
  durationEl.textContent = formatTime(state.duration);
  textProgressBar.textContent = bar;
  npIcon.textContent = state.isPlaying ? "▶" : "▮▮";
}

function updateProfileDot() {
  const selected = state.profiles.find((p) => p.id === state.selectedProfileId);
  const color = selected?.color || "#666666";
  const connected = Boolean(selected?.connected);

  document.documentElement.style.setProperty("--profile-dot", color);
  profileDot.classList.toggle("connected", connected);
  profileDot.title = selected ? selected.name : "Bluetooth profile";
}

function renderProfiles(data) {
  state.profiles = data.profiles || [];
  state.selectedProfileId = data.selected_profile_id || "";

  profileList.innerHTML = "";

  for (const profile of state.profiles) {
    const item = document.createElement("button");
    item.className = "profile-item";
    if (profile.id === state.selectedProfileId) {
      item.classList.add("active");
    }

    item.innerHTML = `
      <span class="profile-item-left">
        <span class="profile-item-dot" style="background:${profile.color || "#666666"}"></span>
        <span class="profile-item-name">${profile.name}</span>
      </span>
      <span class="profile-item-state">${profile.connected ? "connected" : "select"}</span>
    `;

    item.addEventListener("click", async () => {
      await selectProfile(profile.id);
      profileMenu.classList.add("hidden");
    });

    profileList.appendChild(item);
  }

  const selected = state.profiles.find((p) => p.id === state.selectedProfileId);
  if (selected) {
    profileStatus.textContent = selected.connected
      ? `${selected.name} connected`
      : `${selected.name} selected`;
  } else {
    profileStatus.textContent = "No profile selected";
  }

  updateProfileDot();
}

async function fetchProfiles() {
  try {
    const res = await fetch("/api/profiles", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderProfiles(data);
  } catch (err) {
    profileStatus.textContent = "Profiles unavailable";
  }
}

async function selectProfile(profileId) {
  try {
    profileStatus.textContent = "Connecting...";
    const res = await fetch("/api/profile/select", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: profileId }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderProfiles(data);
    if (data.message) {
      profileStatus.textContent = data.message;
    }
  } catch (err) {
    profileStatus.textContent = "Connection failed";
  }
}

async function fetchNowPlaying() {
  try {
    const res = await fetch("/now", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    state.title = data.title || "";
    state.artist = data.artist || "";
    state.album = data.album || "";
    state.isPlaying = Boolean(data.is_playing);
    state.position = Number(data.position || 0);
    state.duration = Number(data.duration || 0);
    state.lastUpdateMs = Date.now();
    state.hasData = Boolean(
      data.title || data.artist || data.duration || data.is_playing
    );
  } catch (err) {
    state.hasData = false;
  }

  updateNowPlayingUI();
}

function drawClock(canvasId, timeZone, digitalId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const digital = document.getElementById(digitalId);
  if (!ctx || !digital) return;

  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.41;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  const h = Number(values.hour || 0);
  const m = Number(values.minute || 0);
  const s = Number(values.second || 0);

  const seconds = s;
  const minutes = m + seconds / 60;
  const hours = (h % 12) + minutes / 60;

  ctx.clearRect(0, 0, size, size);

  const faceGrad = ctx.createRadialGradient(
    cx - r * 0.26,
    cy - r * 0.28,
    r * 0.16,
    cx,
    cy,
    r
  );
  faceGrad.addColorStop(0, "#262629");
  faceGrad.addColorStop(1, "#161618");

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = faceGrad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#3a3a3c";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r - 18, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
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
    ctx.strokeStyle =
      i % 5 === 0 ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.18)";
    ctx.stroke();
  }

  drawHand(ctx, cx, cy, (hours * 30 - 90) * Math.PI / 180, r * 0.45, 8, "#ffffff");
  drawHand(ctx, cx, cy, (minutes * 6 - 90) * Math.PI / 180, r * 0.68, 5, "#ffffff");
  drawHand(ctx, cx, cy, (seconds * 6 - 90) * Math.PI / 180, r * 0.78, 2.2, "#ff453a");

  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  digital.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}:${String(s).padStart(2, "0")}`;
}

function drawHand(ctx, cx, cy, angle, length, width, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
}

function tick() {
  drawClock("clock-sydney", "Australia/Sydney", "digital-sydney");
  drawClock("clock-seoul", "Asia/Seoul", "digital-seoul");
  updateNowPlayingUI();
  requestAnimationFrame(tick);
}

profileDot.addEventListener("click", (event) => {
  event.stopPropagation();
  profileMenu.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  if (!profileMenu.contains(event.target) && event.target !== profileDot) {
    profileMenu.classList.add("hidden");
  }
});

fetchProfiles();
setInterval(fetchProfiles, 10000);

fetchNowPlaying();
setInterval(fetchNowPlaying, 3000);

tick();