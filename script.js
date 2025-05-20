let stations = [];
const playlistGrid = document.getElementById("playlistGrid");
const fileInput = document.getElementById("fileInput");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const urlInput = document.getElementById("urlInput");
const groupFilter = document.getElementById("groupFilter");

menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("visible");
});

window.onload = () => {
  const saved = localStorage.getItem("media_autoload");
  if (saved) {
    try {
      stations = JSON.parse(saved);
      updateGroupFilter();
      renderGrid();
    } catch (e) {
      console.error("Ошибка чтения базы:", e);
    }
  }
};

fileInput.addEventListener("change", handleFile);
groupFilter.addEventListener("change", renderGrid);

// ===== Проверка доступности канала =====
async function checkStream(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      signal: controller.signal
    });

    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

// ===== Обработка загрузки файла =====
function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    parseAndCheck(reader.result, file.name);
  };

  reader.readAsText(file);
  sidebar.classList.remove("visible");
}

// ===== Обработка загрузки по ссылке =====
function loadPlaylistFromUrl() {
  const url = urlInput.value.trim();
  if (!url) return alert("Введите ссылку на плейлист.");

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.text();
    })
    .then(text => {
      parseAndCheck(text, url);
      urlInput.value = "";
    })
    .catch(err => alert("Не удалось загрузить плейлист: " + err.message));
}

// ===== Парсинг + проверка доступности =====
async function parseAndCheck(text, fileName) {
  const parsed = parsePlaylist(text, fileName);

  const checked = await Promise.all(parsed.map(async (s) => {
    const online = await checkStream(s.url);
    return { ...s, online };
  }));

  stations = checked;
  saveStations();
  updateGroupFilter();
  renderGrid();
}

// ===== Сохранение =====
function saveStations() {
  localStorage.setItem("media_autoload", JSON.stringify(stations));
}

// ===== Экспорт =====
function exportPlaylist() {
  const data = localStorage.getItem("media_autoload");
  if (!data) return alert("Нечего экспортировать.");
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "playlist_backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Парсинг плейлиста =====
function parsePlaylist(text, fileName) {
  const isM3U = fileName.endsWith(".m3u") || fileName.endsWith(".m3u8");
  const lines = text.split(/\r?\n/);
  const stations = [];

  let lastName = "", lastLogo = "", lastGroup = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,(.+)$/);
      lastName = nameMatch ? nameMatch[1].trim() : "Без названия";

      const logoMatch = line.match(/tvg-logo="(.*?)"/);
      lastLogo = logoMatch && logoMatch[1].startsWith("http") ? logoMatch[1] : "";

      const groupMatch = line.match(/group-title="(.*?)"/);
      lastGroup = groupMatch ? groupMatch[1].trim() : "";

    } else if (line && !line.startsWith("#")) {
      const url = line;
      const name = lastName || url.split("/").pop();
      const logo = lastLogo || "https://via.placeholder.com/140x80?text=Канал";
      const group = lastGroup || "";
      stations.push({ name, url, logo, group });

      lastName = ""; lastLogo = ""; lastGroup = "";
    }
  }

  if (!isM3U) {
    lines.forEach(line => {
      const parts = line.split(" - ");
      if (parts.length === 2) {
        const [name, url] = parts;
        stations.push({
          name: name.trim(),
          url: url.trim(),
          logo: "https://via.placeholder.com/140x80?text=Канал",
          group: ""
        });
      } else if (line.startsWith("http")) {
        stations.push({
          name: line.split("/").pop(),
          url: line,
          logo: "https://via.placeholder.com/140x80?text=Канал",
          group: ""
        });
      }
    });
  }

  return stations;
}

// ===== Обновление фильтра групп =====
function updateGroupFilter() {
  const groups = new Set(stations.map(s => s.group).filter(Boolean));
  groupFilter.innerHTML = `<option value="">Все группы</option>`;
  [...groups].sort().forEach(group => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    groupFilter.appendChild(option);
  });
}

// ===== Отрисовка сетки каналов =====
function renderGrid() {
  playlistGrid.innerHTML = "";
  const currentGroup = groupFilter.value;

  stations
    .filter(s => !currentGroup || s.group === currentGroup)
    .forEach((station, i) => {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.onclick = () => openPlayer(station, i);

      const img = document.createElement("img");
      img.src = station.logo || "https://via.placeholder.com/140x80?text=Канал";
      img.alt = station.name;

      const nameEl = document.createElement("span");
      nameEl.textContent = station.name;

      const groupEl = document.createElement("span");
      groupEl.style.fontSize = "12px";
      groupEl.style.opacity = "0.7";
      groupEl.textContent = station.group || "";

      tile.appendChild(img);
      tile.appendChild(nameEl);
      if (station.group) tile.appendChild(groupEl);

      // === Пометка недоступных каналов ===
      if (station.online === false) {
        tile.style.opacity = "0.4";
        tile.title = "Канал недоступен";

        const warn = document.createElement("div");
        warn.style.color = "red";
        warn.style.fontSize = "12px";
        warn.textContent = "Недоступен";
        tile.appendChild(warn);
      }

      playlistGrid.appendChild(tile);
    });
}

// ===== Открытие плеера =====
function openPlayer(station, index) {
  localStorage.setItem("last_index", index);
  const encodedName = encodeURIComponent(station.name);
  const encodedUrl = encodeURIComponent(station.url);
  const encodedLogo = encodeURIComponent(station.logo || "");
  window.open(`player.html?name=${encodedName}&url=${encodedUrl}&logo=${encodedLogo}&index=${index}`, "_blank");
}

// ===== Очистка базы =====
function clearAutoload() {
  localStorage.removeItem("media_autoload");
  localStorage.removeItem("last_index");
  stations = [];
  playlistGrid.innerHTML = "";
  updateGroupFilter();
  alert("Плейлист очищен.");
}