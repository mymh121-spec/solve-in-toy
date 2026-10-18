const boards = new Map();
// A real sensor resting on a table is horizontal. Keep the calibrated sensor
// values at 0 degrees, but draw that zero pose as a board leaning away from the
// viewer so it looks laid down instead of standing upright on the screen.
const DISPLAY_ZERO_TILT_DEG = 68;
const order = ["LEFT", "RIGHT"];
const colors = { x: "#63e6d3", y: "#ffb85c", z: "#ff7087" };
const maxPoints = 180;
let socket;
let reconnectTimer;
let packets = 0;
let lastRateAt = performance.now();
let serialConnections = {};

async function loadPorts(showMessage = false) {
  const select = document.querySelector("#portSelect");
  const previous = select.value;
  try {
    const response = await fetch("/api/serial/ports");
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "포트 조회 실패");
    serialConnections = data.connections || {};
    select.replaceChildren();
    if (!data.ports.length) {
      select.add(new Option("사용 가능한 포트 없음", ""));
    } else {
      data.ports.forEach(item => {
        const prefix = item.recommended ? "★ " : "";
        select.add(new Option(`${prefix}${item.device} · ${item.description}`, item.device));
      });
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
      else {
        const preferred = data.ports.find(item => item.recommended) || data.ports[0];
        select.value = preferred.device;
      }
    }
    renderConnections();
    if (showMessage) toast(`${data.ports.length}개의 시리얼 포트를 찾았습니다.`);
  } catch (error) {
    document.querySelector("#connectionMessage").textContent = error.message;
  }
}

function renderConnections() {
  const host = document.querySelector("#activeConnections");
  host.replaceChildren();
  Object.entries(serialConnections).forEach(([port, item]) => {
    const chip = document.createElement("span");
    chip.className = `connection-chip${item.status === "error" ? " error" : ""}`;
    chip.textContent = `${port} · ${item.status.toUpperCase()}${item.error ? " · " + item.error : ""}`;
    host.append(chip);
  });
  const selected = document.querySelector("#portSelect").value;
  const state = serialConnections[selected]?.status;
  document.querySelector("#connectPort").disabled = !selected || ["connecting", "connected", "disconnecting"].includes(state);
  document.querySelector("#disconnectPort").disabled = !["connecting", "connected"].includes(state);
  const statuses = Object.values(serialConnections);
  const connected = statuses.filter(item => item.status === "connected").length;
  const errors = statuses.filter(item => item.status === "error").length;
  document.querySelector("#connectionMessage").textContent = connected
    ? `${connected}개 포트 연결됨 · 다른 보드도 추가로 연결할 수 있습니다.`
    : errors ? "연결 오류가 있습니다. 포트 점유 여부를 확인해 주세요." : "포트를 선택하고 CONNECT를 누르세요.";
}

async function connectPort() {
  const port = document.querySelector("#portSelect").value;
  if (!port) return toast("연결할 COM 포트를 선택해 주세요.");
  const button = document.querySelector("#connectPort");
  button.disabled = true;
  try {
    const response = await fetch("/api/serial/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, baudrate: Number(document.querySelector("#baudSelect").value) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "연결 실패");
    toast(`${port} 연결을 시작합니다.`);
  } catch (error) { toast(error.message); }
  await loadPorts();
}

async function disconnectPort() {
  const port = document.querySelector("#portSelect").value;
  if (!port) return;
  try {
    const response = await fetch(`/api/serial/connect/${encodeURIComponent(port)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "연결 해제 실패");
    toast(`${port} 연결을 해제했습니다.`);
  } catch (error) { toast(error.message); }
  setTimeout(() => loadPorts(), 150);
}

function boardTemplate(id) {
  return `<article class="board-card" data-board="${id}">
    <div class="card-top"><h2>${id}</h2><span class="board-status"><i class="status-dot"></i><span>데이터 대기</span></span></div>
    <div class="card-body">
      <div class="orientation"><div class="sensor-cube">${id[0] || "?"}</div></div>
      <div class="metric-group">
        <div><div class="metric-title">ACCEL · m/s²</div><div class="metrics">${metricCells("a")}</div></div>
        <div><div class="metric-title">GYRO · rad/s · ALIGNED</div><div class="metrics">${metricCells("g")}</div></div>
      </div>
    </div>
    <div class="card-actions"><span class="source">source: —</span><button type="button" data-align="${id}">보드 영점 보정</button></div>
  </article>`;
}

function metricCells(prefix) {
  return ["x", "y", "z"].map(axis => `<div class="metric"><span>${axis.toUpperCase()}</span><b data-value="${prefix}${axis}">0.000</b></div>`).join("");
}

function ensureBoard(id) {
  if (boards.has(id)) return boards.get(id);
  const host = document.querySelector("#boards");
  host.insertAdjacentHTML("beforeend", boardTemplate(id));
  const card = host.lastElementChild;
  const state = { id, card, source: null, boardCalibrationCapable: false, modeId: "raw", lastAt: 0, roll: 0, pitch: 0, yaw: 0, history: { x: [], y: [], z: [] } };
  boards.set(id, state);
  sortCards();
  return state;
}

function sortCards() {
  const host = document.querySelector("#boards");
  [...boards.values()].sort((a, b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.id.localeCompare(b.id);
  }).forEach(item => host.append(item.card));
}

function updateShortcutVisual() {
  const now = performance.now();
  const activeBoards = [...boards.values()].filter(state =>
    state.modeId === "shortcut" && now - state.lastAt < 2000
  );
  const visual = document.querySelector("#shortcutVisual");
  visual.hidden = activeBoards.length === 0;
  if (activeBoards.length) {
    document.querySelector("#shortcutBoards").textContent =
      `${activeBoards.map(state => state.id).join(" + ")} · 키보드 입력 모드 활성화`;
  }
}

function setValue(card, key, value) {
  card.querySelector(`[data-value="${key}"]`).textContent = Number(value || 0).toFixed(3);
}

function updateBoard(packet) {
  const state = ensureBoard(packet.board);
  const now = performance.now();
  const dt = state.lastAt ? Math.min((now - state.lastAt) / 1000, .1) : 0;
  state.lastAt = now;
  state.source = packet.source || state.source;
  state.boardCalibrationCapable = Boolean(packet.board_calibration_capable);
  state.modeId = String(packet.mode_id || state.modeId || "raw").toLowerCase();
  const gyro = packet.gyro_aligned || packet.gyro;
  ["x", "y", "z"].forEach(axis => {
    setValue(state.card, `a${axis}`, packet.accel[axis]);
    setValue(state.card, `g${axis}`, gyro[axis]);
    state.history[axis].push(gyro[axis]);
    if (state.history[axis].length > maxPoints) state.history[axis].shift();
  });

  if (packet.orientation) {
    state.roll = packet.orientation.roll;
    state.pitch = packet.orientation.pitch;
    state.yaw = packet.orientation.yaw;
  } else {
    state.roll += gyro.x * dt * 57.2958;
    state.pitch += gyro.y * dt * 57.2958;
    state.yaw += gyro.z * dt * 57.2958;
  }
  const cube = state.card.querySelector(".sensor-cube");
  cube.style.transform = `rotateX(${DISPLAY_ZERO_TILT_DEG + state.pitch}deg) rotateY(${state.yaw}deg) rotateZ(${state.roll}deg)`;
  state.card.querySelector(".status-dot").classList.add("online");
  state.card.querySelector(".board-status span").textContent = packet.calibrated_on_board
    ? (packet.stationary ? "BOARD CAL · STILL" : "BOARD CAL · LIVE")
    : (state.boardCalibrationCapable ? "BOARD CAL REQUIRED" : "FIRMWARE UPDATE");
  state.card.querySelector(".source").textContent = `source: ${packet.source || "unknown"}`;
  updateShortcutVisual();
  packets++;
}

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.addEventListener("open", () => setServer(true));
  socket.addEventListener("message", event => {
    const data = JSON.parse(event.data);
    if (data.type === "snapshot") Object.values(data.boards || {}).forEach(updateBoard);
    else if (data.type === "sensor") updateBoard(data);
    else if (data.type === "calibration") handleCalibrationEvent(data);
    else if (data.type === "error") toast(data.message || "보드 오류가 발생했습니다.");
  });
  socket.addEventListener("close", () => { setServer(false); reconnectTimer = setTimeout(connect, 1200); });
  socket.addEventListener("error", () => socket.close());
}

function setServer(online) {
  document.querySelector("#serverDot").classList.toggle("online", online);
  document.querySelector("#serverText").textContent = online ? "서버 연결됨" : "재연결 중";
}

async function calibrate(id) {
  const button = document.querySelector(`[data-align="${id}"]`);
  if (button) button.disabled = true;
  try {
    const state = boards.get(id);
    if (!state?.source?.startsWith("serial:")) {
      throw new Error(`${id} 보드의 시리얼 포트가 연결되어 있지 않습니다.`);
    }
    if (!state.boardCalibrationCapable) {
      throw new Error("보드 보정 펌웨어를 먼저 업로드해 주세요.");
    }
    const port = state.source.slice("serial:".length);
    const response = await fetch("/api/serial/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, command: "CAL_GYRO" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "보드 명령 전송 실패");
    toast(`${id} 보정 중 · 바닥에 평평하게 놓고 움직이지 마세요.`);
    setTimeout(() => { if (button) button.disabled = false; }, 5000);
  } catch (error) {
    toast(error.message);
    if (button) button.disabled = false;
  }
}

function handleCalibrationEvent(event) {
  const button = document.querySelector(`[data-align="${event.board}"]`);
  if (button) button.disabled = event.status === "started";
  if (event.status === "started") {
    toast(`${event.board} 보드 보정 시작 · 그대로 두세요.`);
  } else if (event.status === "complete") {
    const state = boards.get(event.board);
    if (state) state.roll = state.pitch = state.yaw = 0;
    toast(event.pose_zeroed === false
      ? `${event.board} 자이로 보정 완료 · 자세 데이터 수신 후 한 번 더 눌러주세요.`
      : `${event.board} 보정 완료 · 현재 바닥 자세가 0°로 설정되었습니다.`);
  } else if (event.status === "failed") {
    toast(`${event.board} 보정 실패 · 센서를 움직이지 말고 다시 시도하세요.`);
  }
}

function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node.timer);
  node.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function drawChart() {
  const canvas = document.querySelector("#gyroChart");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) { canvas.width = width * dpr; canvas.height = height * dpr; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(184,218,231,.09)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = i * height / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  const selected = boards.get("RIGHT") || boards.get("LEFT") || [...boards.values()][0];
  if (selected) ["x", "y", "z"].forEach(axis => {
    const values = selected.history[axis];
    ctx.strokeStyle = colors[axis]; ctx.lineWidth = 1.6; ctx.beginPath();
    values.forEach((value, index) => {
      const x = index * width / (maxPoints - 1);
      const y = height / 2 - Math.max(-4, Math.min(4, value)) * height / 9;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
  requestAnimationFrame(drawChart);
}

document.addEventListener("click", event => {
  const id = event.target.dataset.align;
  if (id) calibrate(id);
});
document.querySelector("#alignAll").addEventListener("click", async () => {
  const ids = [...boards.keys()];
  if (!ids.length) return toast("아직 수신된 센서 데이터가 없습니다.");
  for (const id of ids) await calibrate(id);
});
document.querySelector("#refreshPorts").addEventListener("click", () => loadPorts(true));
document.querySelector("#connectPort").addEventListener("click", connectPort);
document.querySelector("#disconnectPort").addEventListener("click", disconnectPort);
document.querySelector("#portSelect").addEventListener("change", renderConnections);
setInterval(() => {
  const now = performance.now();
  const rate = packets * 1000 / (now - lastRateAt);
  document.querySelector("#packetRate").textContent = `${rate.toFixed(0)} packets/s`;
  packets = 0; lastRateAt = now;
  boards.forEach(state => {
    if (now - state.lastAt > 2000) {
      state.card.querySelector(".status-dot").classList.remove("online");
      state.card.querySelector(".board-status span").textContent = "OFFLINE";
    }
  });
  updateShortcutVisual();
}, 1000);
setInterval(() => loadPorts(), 1200);

ensureBoard("LEFT"); ensureBoard("RIGHT"); loadPorts(); connect(); drawChart();
