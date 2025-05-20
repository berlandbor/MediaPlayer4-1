const params = new URLSearchParams(location.search);
const name = params.get("name");
const url = params.get("url");
const logo = params.get("logo");
const index = parseInt(params.get("index"));
const playlist = JSON.parse(localStorage.getItem("media_autoload") || "[]");

const titleEl = document.getElementById("title");
const logoEl = document.getElementById("logo");
const spinner = document.getElementById("spinner");
const bufferingText = document.getElementById("bufferingText");
const bufferingMessage = document.getElementById("bufferingMessage");
const qualityBadge = document.getElementById("qualityBadge");
const errorEl = document.getElementById("error");
const playerBox = document.getElementById("player");

const bitrateEl = document.getElementById("bitrate");
const bitrateAvgEl = document.getElementById("bitrateAvg");
const bitrateMaxEl = document.getElementById("bitrateMax");
const bitrateMinEl = document.getElementById("bitrateMin");
const bufferEl = document.getElementById("buffer");
const bitrateAlert = document.getElementById("bitrateAlert");

const serverStatusEl = document.getElementById("serverStatus");
const serverPingEl = document.getElementById("serverPing");

const alertSound = document.getElementById("alertSound");

const bitrateCanvas = document.getElementById("bitrateGraph");
const bitrateCtx = bitrateCanvas.getContext("2d");

const pingCanvas = document.getElementById("pingGraph");
const pingCtx = pingCanvas.getContext("2d");

let graphData = [], bitrateHistory = [], bitrateMax = 0, bitrateMin = Infinity;
let pingData = [], maxPingDynamic = 500;

let alertPlayed = false, lowBitrateStart = null;
let lastBufferLength = 0, lastBufferCheck = 0;

titleEl.textContent = name || "Канал";
if (logo && logo.startsWith("http")) {
  logoEl.src = logo;
  logoEl.hidden = false;
}

const audioFormats = /\.(mp3|aac|ogg|m4a)$/i;
const isVideo = !audioFormats.test(url);
const player = document.createElement(isVideo ? "video" : "audio");
player.controls = true;
player.autoplay = true;
playerBox.appendChild(player);
player.src = url;

const quality = /1080|720|hd/i.test(url) ? "HD" :
                /480|360|sd/i.test(url) ? "SD" : "";
qualityBadge.textContent = quality;
qualityBadge.style.display = quality ? "inline-block" : "none";

player.addEventListener("waiting", () => showSpinner("Буферизация..."));
player.addEventListener("loadeddata", () => showSpinner("Загрузка потока..."));
player.addEventListener("canplay", () => showSpinner("Ожидание воспроизведения..."));
player.addEventListener("playing", hideSpinner);
player.addEventListener("canplaythrough", hideSpinner);
player.addEventListener("error", () => {
  hideSpinner();
  errorEl.textContent = "Не удалось воспроизвести поток.";
});

function showSpinner(msg) {
  bufferingMessage.textContent = msg;
  spinner.hidden = false;
  bufferingText.hidden = false;
}

function hideSpinner() {
  spinner.hidden = true;
  bufferingText.hidden = true;
}

function goTo(offset) {
  if (isNaN(index)) return;
  const newIndex = (index + offset + playlist.length) % playlist.length;
  const s = playlist[newIndex];
  location.href = `player.html?name=${encodeURIComponent(s.name)}&url=${encodeURIComponent(s.url)}&logo=${encodeURIComponent(s.logo || "")}&index=${newIndex}`;
}

function updateStreamStats() {
  if (!player || !player.buffered || player.readyState < 2) return;

  const now = Date.now();
  let bufferLength = 0;

  for (let i = 0; i < player.buffered.length; i++) {
    if (player.currentTime >= player.buffered.start(i) && player.currentTime <= player.buffered.end(i)) {
      bufferLength = player.buffered.end(i) - player.currentTime;
      break;
    }
  }

  let bitrate = "-";
  if (lastBufferCheck > 0 && now > lastBufferCheck) {
    const deltaBuffer = bufferLength - lastBufferLength;
    const deltaTime = (now - lastBufferCheck) / 1000;
    if (deltaBuffer > 0 && deltaTime > 0) {
      bitrate = (deltaBuffer * 160).toFixed(1);
    }
  }

  lastBufferLength = bufferLength;
  lastBufferCheck = now;

  bitrateEl.textContent = bitrate;
  bufferEl.textContent = bufferLength.toFixed(1);

  if (!isNaN(parseFloat(bitrate))) {
    const numeric = parseFloat(bitrate);
    bitrateHistory.push(numeric);
    if (bitrateHistory.length > 100) bitrateHistory.shift();

    const visible = bitrateHistory.slice(-30);
    const maxBitrate = Math.ceil(Math.max(...visible, 100) / 100) * 100;

    drawGraph(bitrateCtx, bitrateCanvas, bitrateHistory, maxBitrate, "бит/с");

    const avg = bitrateHistory.reduce((a, b) => a + b, 0) / bitrateHistory.length;
    bitrateAvgEl.textContent = avg.toFixed(1);
    bitrateMax = Math.max(bitrateMax, numeric);
    bitrateMin = Math.min(bitrateMin, numeric);
    bitrateMaxEl.textContent = bitrateMax.toFixed(1);
    bitrateMinEl.textContent = bitrateMin.toFixed(1);

    bitrateEl.style.color =
      numeric >= 200 ? "#00ff88" :
      numeric >= 100 ? "#ffff55" :
      "#ff4444";

    if (numeric < 50) {
      bitrateAlert.style.display = "block";
      bitrateAlert.style.visibility = (now % 1000 < 500) ? "visible" : "hidden";
      if (!alertPlayed) {
        alertSound.play().catch(() => {});
        alertPlayed = true;
      }
      if (!lowBitrateStart) lowBitrateStart = now;
      else if (now - lowBitrateStart > 10000) location.reload();
    } else {
      bitrateAlert.style.display = "none";
      alertPlayed = false;
      lowBitrateStart = null;
    }
  }
}

function drawGraph(ctx, canvas, data, maxValue, labelUnit) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;

  ctx.font = "10px sans-serif";
  ctx.fillStyle = "#aaa";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;

  const step = Math.ceil(maxValue / 5 / 50) * 50;
  for (let yVal = step; yVal <= maxValue; yVal += step) {
    const y = h - (yVal / maxValue) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(`${yVal} ${labelUnit}`, 8, y - 4);
  }

  if (data.length > 1) {
    const stepX = w / (data.length - 1);
    let y = h - (data[0] / maxValue) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let i = 1; i < data.length; i++) {
      const nextX = i * stepX;
      const nextY = h - (data[i] / maxValue) * h;
      ctx.lineTo(nextX, y);
      ctx.lineTo(nextX, nextY);
      y = nextY;
    }
    ctx.strokeStyle = labelUnit === "мс" ? "#ffdd55" : "#00f0ff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w, y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = labelUnit === "мс" ? "#ffee88" : "#00ffff";
    ctx.fill();
  }
}

function checkServerPing() {
  if (!url) return;
  try {
    const streamURL = new URL(url);
    const testUrl = streamURL.origin;
    const start = performance.now();

    fetch(testUrl, { method: "HEAD", mode: "no-cors" })
      .then(() => {
        const delay = Math.round(performance.now() - start);
        serverStatusEl.textContent = "Доступен";
        serverStatusEl.style.color = "#00ff88";
        serverPingEl.textContent = delay;

        pingData.push(delay);
        if (pingData.length > 100) pingData.shift();
        maxPingDynamic = Math.max(...pingData, 100);
        drawGraph(pingCtx, pingCanvas, pingData, maxPingDynamic, "мс");
      })
      .catch(() => {
        serverStatusEl.textContent = "Недоступен";
        serverStatusEl.style.color = "#ff4444";
        serverPingEl.textContent = "-";
      });
  } catch {
    serverStatusEl.textContent = "Ошибка";
    serverStatusEl.style.color = "#ff4444";
  }
}

// Кнопка "во весь экран"
document.getElementById("fullscreenBtn").addEventListener("click", () => {
  const el = document.documentElement;
  el.requestFullscreen?.();
  el.webkitRequestFullscreen?.();
  el.mozRequestFullScreen?.();
  el.msRequestFullscreen?.();
});

// Кнопка "поделиться"
document.getElementById("shareBtn").addEventListener("click", () => {
  const base = location.origin + location.pathname;
  const shareURL = `${base}?name=${encodeURIComponent(name)}&url=${encodeURIComponent(url)}&logo=${encodeURIComponent(logo || "")}`;

  if (navigator.share) {
    navigator.share({
      title: name || "Стрим",
      text: "Смотри стрим:",
      url: shareURL
    }).catch(() => alert("Не удалось открыть меню общего доступа."));
  } else {
    const shareInput = document.getElementById("shareLink");
    shareInput.value = shareURL;
    document.getElementById("shareModal").classList.remove("hidden");
  }
});

function copyShareLink() {
  const shareInput = document.getElementById("shareLink");
  shareInput.select();
  shareInput.setSelectionRange(0, 9999);
  navigator.clipboard.writeText(shareInput.value)
    .then(() => alert("Ссылка скопирована!"))
    .catch(() => alert("Ошибка копирования"));
}

// Кнопка диагностики
document.getElementById("diagBtn").addEventListener("click", () => {
  document.getElementById("diagModal").classList.remove("hidden");
});

// Запуск мониторинга
setInterval(updateStreamStats, 1000);
setInterval(checkServerPing, 5000);

// Проверка CORS/HTTPS и попытка восстановить проигрывание
player.addEventListener("error", () => {
  hideSpinner();
  errorEl.textContent = "Не удалось воспроизвести поток. Проверьте ссылку и доступность потока.";
  errorEl.style.color = "#ff4444";
});

// Автоматический переход к последнему каналу, если URL пуст
if (!url) {
  const saved = JSON.parse(localStorage.getItem("media_autoload") || "[]");
  const lastIndex = parseInt(localStorage.getItem("last_index") || 0);
  if (saved.length && !isNaN(lastIndex)) {
    const s = saved[lastIndex];
    location.href = `player.html?name=${encodeURIComponent(s.name)}&url=${encodeURIComponent(s.url)}&logo=${encodeURIComponent(s.logo || '')}&index=${lastIndex}`;
  }
}