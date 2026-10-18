import * as THREE from "./vendor/v01851/three.module.min.js";
import { updateShortcutMode, updateShortcutSnapshot } from "/static/mode-overlay.js";

const canvas = document.querySelector("#viewport");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.22;
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x010203, 0.052);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 80);
const cameraDistance = () => Math.max(8.6, 3.6 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (innerWidth / innerHeight)));
camera.position.set(0, 0.2, cameraDistance()); camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xbceaff, 0x040506, 0.82));
const key = new THREE.DirectionalLight(0xeafaff, 5); key.position.set(-4, 7, 7); scene.add(key);
const rim = new THREE.DirectionalLight(0x3bc9ff, 4.2); rim.position.set(5, 2, -4); scene.add(rim);
const warm = new THREE.PointLight(0xff923f, 8, 7, 2); warm.position.set(-3, -2, 4); scene.add(warm);

const gunmetal = new THREE.MeshPhysicalMaterial({ color: 0x242d32, metalness: 0.93, roughness: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.18 });
const dark = new THREE.MeshPhysicalMaterial({ color: 0x080d10, metalness: 0.76, roughness: 0.34, clearcoat: 0.24 });
const armor = new THREE.MeshPhysicalMaterial({ color: 0x59656b, metalness: 0.88, roughness: 0.19, clearcoat: 0.38 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x0b1012, metalness: 0.25, roughness: 0.66 });
const copper = new THREE.MeshPhysicalMaterial({ color: 0xa95e2e, metalness: 0.9, roughness: 0.22, clearcoat: 0.35 });
const cyan = new THREE.Color(0x47dcff);
const glow = new THREE.MeshBasicMaterial({ color: cyan, toneMapped: false });

const gun = new THREE.Group(); gun.name = "SciFiBlasterAsset"; scene.add(gun);
function add(geometry, material, x, y, z, name) { const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); item.name = name; gun.add(item); return item; }
function box(width, height, depth, material, x, y, z, name, bevel = false) {
  const geometry = new THREE.BoxGeometry(width, height, depth, bevel ? 3 : 1, bevel ? 3 : 1, bevel ? 3 : 1);
  return add(geometry, material, x, y, z, name);
}
function barrel(radius, length, material, x, y, z, name, segments = 48) {
  const item = add(new THREE.CylinderGeometry(radius, radius, length, segments, 2), material, x, y, z, name); item.rotation.z = Math.PI / 2; return item;
}

// Layered upper receiver and armored slide.
box(3.45, 0.73, 0.84, gunmetal, 0.05, 0.47, 0, "receiver", true);
box(2.55, 0.21, 0.76, armor, -0.35, 0.93, 0, "upper-slide", true);
box(1.36, 0.18, 0.92, dark, 0.83, 0.78, 0, "vent-shroud");
box(2.18, 0.12, 0.92, dark, -0.58, 0.08, 0, "lower-frame");

// Rear sight and top rail teeth.
box(0.18, 0.22, 0.72, dark, -1.48, 1.10, 0, "rear-sight");
for (let i = 0; i < 9; i++) box(0.12, 0.12, 0.66, i % 3 === 0 ? copper : dark, -1.12 + i * 0.25, 1.08, 0, "rail-tooth");
box(0.09, 0.23, 0.18, glow, 1.28, 1.11, 0, "front-sight");

// Concentric energy barrel and muzzle emitter.
barrel(0.29, 1.58, dark, 1.74, 0.48, 0, "barrel-jacket", 64);
barrel(0.17, 1.72, armor, 1.83, 0.48, 0, "barrel-core", 64);
barrel(0.095, 1.82, glow, 1.88, 0.48, 0, "energy-bore", 48);
barrel(0.41, 0.20, armor, 2.58, 0.48, 0, "muzzle-ring", 64);
barrel(0.32, 0.23, dark, 2.70, 0.48, 0, "muzzle-face", 64);
barrel(0.18, 0.25, glow, 2.82, 0.48, 0, "muzzle-glow", 48);

// Heat vents along both visible sides.
for (let i = 0; i < 6; i++) {
  const vent = box(0.09, 0.34, 0.07, dark, 0.48 + i * 0.25, 0.56, 0.45, "heat-vent"); vent.rotation.z = -0.32;
}

// Angled ergonomic grip, heel cap and luminous power cell.
const gripGroup = new THREE.Group(); gripGroup.position.set(-0.67, -0.47, 0); gripGroup.rotation.z = -0.18; gripGroup.name = "grip"; gun.add(gripGroup);
const gripCore = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.72, 0.72, 3, 5, 3), gripMat); gripCore.position.y = -0.72; gripGroup.add(gripCore);
const gripBack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.48, 0.78), gunmetal); gripBack.position.set(-0.38, -0.67, 0); gripGroup.add(gripBack);
for (let i = 0; i < 7; i++) {
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.055, 0.77), i === 1 ? copper : dark); rib.position.y = -0.18 - i * 0.19; gripGroup.add(rib);
}
const heel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 0.83), armor); heel.position.y = -1.63; gripGroup.add(heel);
const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.54, 32), glow); cell.rotation.z = Math.PI / 2; cell.position.set(0.02, -0.9, 0.39); gripGroup.add(cell);

// Trigger guard and non-functional display trigger.
const guard = add(new THREE.TorusGeometry(0.46, 0.075, 18, 64, Math.PI * 1.62), gunmetal, -0.03, -0.34, 0, "trigger-guard");
guard.scale.set(1.12, 0.82, 1); guard.rotation.z = -0.30;
const trigger = box(0.10, 0.42, 0.12, copper, -0.16, -0.33, 0.04, "trigger"); trigger.rotation.z = -0.23;

// Side power chamber adds an unmistakably fictional visual language.
const chamber = add(new THREE.CylinderGeometry(0.31, 0.31, 0.26, 48), dark, -0.47, 0.49, 0.48, "power-chamber"); chamber.rotation.x = Math.PI / 2;
const chamberCore = add(new THREE.CylinderGeometry(0.19, 0.19, 0.29, 48), glow, -0.47, 0.49, 0.50, "power-core"); chamberCore.rotation.x = Math.PI / 2;
const chamberRing = add(new THREE.TorusGeometry(0.27, 0.035, 14, 64), copper, -0.47, 0.49, 0.65, "power-ring");

const muzzleLight = new THREE.PointLight(cyan, 18, 5, 2); muzzleLight.position.set(2.85, 0.48, 0); gun.add(muzzleLight);
const coreLight = new THREE.PointLight(cyan, 9, 3.2, 2); coreLight.position.set(-0.45, 0.48, 0.75); gun.add(coreLight);

const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.09, -0.12, -0.035, "YXZ"));
const targetQuaternion = baseQuaternion.clone(); gun.quaternion.copy(baseQuaternion); gun.position.set(-0.1, -0.58, 0);
let sensorActive = false, lastSensorAt = 0, angularEnergy = 0;
function setEuler({ roll = 0, pitch = 0, yaw = 0 }, degrees = true) {
  const unit = degrees ? Math.PI / 180 : 1;
  targetQuaternion.copy(baseQuaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * unit, yaw * unit, -roll * unit, "YXZ")));
  sensorActive = true; lastSensorAt = performance.now();
}
function setQuaternion(x, y, z, w) { targetQuaternion.copy(baseQuaternion).multiply(new THREE.Quaternion(x, y, z, w).normalize()); sensorActive = true; lastSensorAt = performance.now(); }
function setAngularVelocity(x = 0, y = 0, z = 0) { angularEnergy = Math.min(1, Math.hypot(x, y, z) / 5); }
function resetOrientation() { targetQuaternion.copy(baseQuaternion); sensorActive = false; lastSensorAt = 0; }
window.gun3D = Object.freeze({ object: gun, scene, camera, renderer, setEuler, setQuaternion, setAngularVelocity, resetOrientation });
window.dispatchEvent(new CustomEvent("gun-ready", { detail: window.gun3D }));

function connectMotionBridge() {
  const protocol = location.protocol === "https:" ? "wss" : "ws"; const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.addEventListener("message", event => {
    const value = JSON.parse(event.data);
    if (value.type === "snapshot") updateShortcutSnapshot(value.boards);
    const packet = value.type === "snapshot" ? Object.values(value.boards || {}).find(v => v.board === "RIGHT") || Object.values(value.boards || {})[0] : value;
    if (!packet || packet.type !== "sensor") return;
    updateShortcutMode(packet);
    if (packet.orientation) setEuler(packet.orientation, true);
    const gyro = packet.gyro_aligned || packet.gyro; if (gyro) setAngularVelocity(gyro.x, gyro.y, gyro.z);
  });
  socket.addEventListener("close", () => setTimeout(connectMotionBridge, 1500)); socket.addEventListener("error", () => socket.close());
}
connectMotionBridge();

let dragging = false, previousX = 0, previousY = 0;
canvas.addEventListener("pointerdown", event => { dragging = true; previousX = event.clientX; previousY = event.clientY; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointermove", event => {
  if (!dragging) return; const dx = (event.clientX - previousX) * 0.008, dy = (event.clientY - previousY) * 0.008;
  previousX = event.clientX; previousY = event.clientY;
  targetQuaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dy, dx, 0, "YXZ"))); sensorActive = true; lastSensorAt = 0;
});
canvas.addEventListener("pointerup", () => dragging = false); canvas.addEventListener("dblclick", resetOrientation);
canvas.addEventListener("wheel", event => { camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.006, 7.2, 15); }, { passive: true });

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate); const time = clock.getElapsedTime();
  if (lastSensorAt && performance.now() - lastSensorAt > 1800) resetOrientation();
  gun.quaternion.slerp(targetQuaternion, 0.1 + angularEnergy * 0.1);
  gun.position.y = THREE.MathUtils.lerp(gun.position.y, -0.58, 0.08);
  muzzleLight.intensity = 17 + Math.sin(time * 8) * 1.5 + angularEnergy * 7; coreLight.intensity = 8 + Math.sin(time * 5.5) * 1.2;
  chamberCore.scale.x = chamberCore.scale.z = 1 + Math.sin(time * 4.2) * 0.06;
  angularEnergy *= 0.94; renderer.render(scene, camera);
  if (!document.documentElement.classList.contains("webgl-ready")) document.documentElement.classList.add("webgl-ready");
}
animate();
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); camera.position.z = cameraDistance();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
});
