import * as THREE from "./vendor/v01851/three.module.min.js";
import { updateShortcutMode, updateShortcutSnapshot } from "/static/mode-overlay.js";

const canvas = document.querySelector("#viewport");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x010405, 0.045);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 100);
const cameraDistance = () => Math.max(9.5, 4.8 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (innerWidth / innerHeight)));
camera.position.set(0, 0.25, cameraDistance()); camera.lookAt(0, 0.1, 0);

scene.add(new THREE.HemisphereLight(0xc7f5ff, 0x030506, 0.9));
const key = new THREE.DirectionalLight(0xe9fbff, 4.8); key.position.set(-4, 7, 7); scene.add(key);
const rim = new THREE.DirectionalLight(0x23c7df, 4); rim.position.set(5, 2, -4); scene.add(rim);
const warm = new THREE.PointLight(0xffa24a, 6, 7, 2); warm.position.set(-3, -2, 4); scene.add(warm);

const carbon = new THREE.MeshPhysicalMaterial({ color: 0x081214, metalness: 0.78, roughness: 0.24, clearcoat: 0.78, clearcoatRoughness: 0.14 });
const teal = new THREE.MeshPhysicalMaterial({ color: 0x138fa2, metalness: 0.7, roughness: 0.2, clearcoat: 0.86 });
const metal = new THREE.MeshPhysicalMaterial({ color: 0x77898d, metalness: 0.94, roughness: 0.18, clearcoat: 0.3 });
const black = new THREE.MeshStandardMaterial({ color: 0x080d0e, metalness: 0.35, roughness: 0.68 });
const cork = new THREE.MeshStandardMaterial({ color: 0x5c4a34, metalness: 0.05, roughness: 0.8 });
const gold = new THREE.MeshPhysicalMaterial({ color: 0xc67b27, metalness: 0.9, roughness: 0.2, clearcoat: 0.3 });
const lineMaterial = new THREE.LineBasicMaterial({ color: 0xbde9e6, transparent: true, opacity: 0.72 });

const rod = new THREE.Group(); rod.name = "FishingRodAsset"; scene.add(rod);
function add(geometry, material, x, y, z, name) { const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); item.name = name; rod.add(item); return item; }
function axisCylinder(radius, length, material, x, y, z, name, segments = 48) {
  const item = add(new THREE.CylinderGeometry(radius, radius, length, segments, 2), material, x, y, z, name); item.rotation.z = Math.PI / 2; return item;
}
function taperedSegment(x1, x2, startRadius, endRadius, material, name) {
  const item = add(new THREE.CylinderGeometry(endRadius, startRadius, x2 - x1, 40, 2), material, (x1 + x2) / 2, 0, 0, name); item.rotation.z = Math.PI / 2; return item;
}
function beam(start, end, radius, material, name) {
  const direction = new THREE.Vector3().subVectors(end, start); const item = add(new THREE.CylinderGeometry(radius, radius, direction.length(), 24), material, 0, 0, 0, name);
  item.position.copy(start.clone().add(end).multiplyScalar(0.5)); item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return item;
}

// Butt cap, split grip, reel seat and locking collars.
axisCylinder(0.24, 0.18, metal, -3.55, 0, 0, "butt-cap", 64);
axisCylinder(0.22, 1.25, cork, -2.84, 0, 0, "rear-grip", 64);
for (let i = 0; i < 9; i++) axisCylinder(0.224, 0.018, i % 4 === 0 ? teal : black, -3.34 + i * 0.13, 0, 0, "grip-ring", 48);
axisCylinder(0.17, 0.55, metal, -1.88, 0, 0, "reel-seat", 64);
axisCylinder(0.215, 0.11, gold, -2.18, 0, 0, "lock-ring", 64);
axisCylinder(0.205, 0.10, teal, -1.58, 0, 0, "fore-lock", 64);
axisCylinder(0.18, 0.56, black, -1.27, 0, 0, "fore-grip", 64);

// Multi-stage tapered carbon blank.
taperedSegment(-1.0, 1.0, 0.105, 0.072, carbon, "blank-heavy");
taperedSegment(1.0, 2.8, 0.072, 0.042, carbon, "blank-mid");
taperedSegment(2.8, 4.55, 0.042, 0.018, teal, "blank-tip");
axisCylinder(0.055, 0.18, gold, -1.03, 0, 0, "blank-accent", 48);

// Spinning reel mounting foot and stem.
const mountTop = new THREE.Vector3(-1.83, -0.05, 0), reelCenter = new THREE.Vector3(-1.72, -0.72, 0.08);
beam(mountTop, new THREE.Vector3(-1.77, -0.35, 0), 0.07, metal, "reel-stem");
beam(new THREE.Vector3(-1.77, -0.35, 0), reelCenter, 0.09, teal, "reel-neck");

// Reel body, spool, bail and crank.
const reelBody = add(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 64), teal, reelCenter.x, reelCenter.y, reelCenter.z, "reel-body"); reelBody.rotation.x = Math.PI / 2;
const spool = add(new THREE.CylinderGeometry(0.31, 0.31, 0.48, 64), metal, -1.51, -0.67, 0.1, "spool"); spool.rotation.x = Math.PI / 2;
for (const z of [-0.18, 0.38]) { const rimMesh = add(new THREE.TorusGeometry(0.31, 0.035, 16, 64), gold, -1.51, -0.67, z, "spool-rim"); rimMesh.rotation.set(0, 0, 0); }
const bail = add(new THREE.TorusGeometry(0.53, 0.025, 12, 72, Math.PI * 1.58), metal, -1.60, -0.66, 0.08, "bail-wire"); bail.rotation.z = 0.28;
beam(new THREE.Vector3(-1.73, -0.72, -0.22), new THREE.Vector3(-2.22, -0.97, -0.32), 0.035, metal, "crank-arm");
const knob = axisCylinder(0.105, 0.34, black, -2.37, -1.04, -0.35, "crank-knob", 40); knob.rotation.y = 0.25;

// Guide rings shrink progressively toward the tip.
const guides = [
  { x: -0.65, r: 0.28 }, { x: 0.25, r: 0.22 }, { x: 1.18, r: 0.16 },
  { x: 2.05, r: 0.12 }, { x: 2.82, r: 0.09 }, { x: 3.48, r: 0.07 }, { x: 4.05, r: 0.052 }, { x: 4.48, r: 0.04 }
];
guides.forEach((guide, index) => {
  const stemHeight = guide.r + 0.08;
  beam(new THREE.Vector3(guide.x, 0.03, 0), new THREE.Vector3(guide.x, stemHeight, 0), 0.018, index < 2 ? metal : teal, "guide-foot");
  const ring = add(new THREE.TorusGeometry(guide.r, Math.max(0.012, guide.r * 0.12), 12, 48), metal, guide.x, stemHeight + guide.r, 0, "line-guide");
  ring.rotation.y = Math.PI / 2;
});

// One continuous line runs from the spool through every guide to the tip.
const linePoints = [new THREE.Vector3(-1.48, -0.38, 0.18)];
guides.forEach(g => linePoints.push(new THREE.Vector3(g.x, g.r + 0.08 + g.r, 0)));
linePoints.push(new THREE.Vector3(4.72, 0.05, 0));
const fishingLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), lineMaterial); fishingLine.name = "fishing-line"; rod.add(fishingLine);

const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.07, -0.08, -0.025, "YXZ"));
const targetQuaternion = baseQuaternion.clone(); rod.quaternion.copy(baseQuaternion); rod.position.set(-0.42, -1.0, 0);
let sensorActive = false, lastSensorAt = 0, angularEnergy = 0;
function setEuler({ roll = 0, pitch = 0, yaw = 0 }, degrees = true) {
  const unit = degrees ? Math.PI / 180 : 1;
  targetQuaternion.copy(baseQuaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * unit, yaw * unit, -roll * unit, "YXZ")));
  sensorActive = true; lastSensorAt = performance.now();
}
function setQuaternion(x, y, z, w) { targetQuaternion.copy(baseQuaternion).multiply(new THREE.Quaternion(x, y, z, w).normalize()); sensorActive = true; lastSensorAt = performance.now(); }
function setAngularVelocity(x = 0, y = 0, z = 0) { angularEnergy = Math.min(1, Math.hypot(x, y, z) / 5); }
function resetOrientation() { targetQuaternion.copy(baseQuaternion); sensorActive = false; lastSensorAt = 0; }
window.fishingRod3D = Object.freeze({ object: rod, scene, camera, renderer, setEuler, setQuaternion, setAngularVelocity, resetOrientation });
window.dispatchEvent(new CustomEvent("fishing-rod-ready", { detail: window.fishingRod3D }));

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
canvas.addEventListener("wheel", event => { camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.006, 8, 18); }, { passive: true });

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate); const time = clock.getElapsedTime();
  if (lastSensorAt && performance.now() - lastSensorAt > 1800) resetOrientation();
  rod.quaternion.slerp(targetQuaternion, 0.1 + angularEnergy * 0.11); rod.position.y = THREE.MathUtils.lerp(rod.position.y, -1.0, 0.08);
  rim.intensity = 3.8 + Math.sin(time * 0.65) * 0.25 + angularEnergy * 2; angularEnergy *= 0.94;
  renderer.render(scene, camera); if (!document.documentElement.classList.contains("webgl-ready")) document.documentElement.classList.add("webgl-ready");
}
animate();
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); camera.position.z = cameraDistance();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
});
