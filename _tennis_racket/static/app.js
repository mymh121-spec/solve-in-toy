import * as THREE from "./vendor/v01851/three.module.min.js";
import { updateShortcutMode, updateShortcutSnapshot } from "/static/mode-overlay.js";

const canvas = document.querySelector("#viewport");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x010304, 0.05);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 80);
const cameraDistance = () => Math.max(9.2, 4.25 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (innerWidth / innerHeight)));
camera.position.set(0, 0.3, cameraDistance());
camera.lookAt(0, 0.3, 0);

scene.add(new THREE.HemisphereLight(0xc8f1ff, 0x050607, 1.05));
const key = new THREE.DirectionalLight(0xe7faff, 4.8); key.position.set(-4, 7, 7); scene.add(key);
const rim = new THREE.DirectionalLight(0x27aee4, 3.8); rim.position.set(5, 2, -5); scene.add(rim);
const warm = new THREE.PointLight(0xffa53f, 7, 8, 2); warm.position.set(-3, -1, 4); scene.add(warm);

const carbon = new THREE.MeshPhysicalMaterial({ color: 0x0b1215, metalness: 0.72, roughness: 0.27, clearcoat: 0.75, clearcoatRoughness: 0.16 });
const frameBlue = new THREE.MeshPhysicalMaterial({ color: 0x087da6, metalness: 0.56, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.12 });
const edgeBlue = new THREE.MeshPhysicalMaterial({ color: 0x32b8d2, metalness: 0.68, roughness: 0.2, clearcoat: 0.85 });
const grip = new THREE.MeshStandardMaterial({ color: 0x090c0d, metalness: 0.18, roughness: 0.72 });
const silver = new THREE.MeshPhysicalMaterial({ color: 0x8b9a9d, metalness: 0.95, roughness: 0.18, clearcoat: 0.28 });
const accent = new THREE.MeshPhysicalMaterial({ color: 0xe78e27, metalness: 0.72, roughness: 0.24, clearcoat: 0.65 });
const stringMaterial = new THREE.MeshPhysicalMaterial({ color: 0xdceeed, metalness: 0.06, roughness: 0.35, transmission: 0.05, transparent: true, opacity: 0.83 });

const racket = new THREE.Group(); racket.name = "TennisRacketAsset"; scene.add(racket);
function add(geometry, material, position, name) {
  const item = new THREE.Mesh(geometry, material); item.position.copy(position); item.name = name; racket.add(item); return item;
}
function cylinder(radius, height, material, y, name, segments = 48) {
  return add(new THREE.CylinderGeometry(radius, radius, height, segments, 2), material, new THREE.Vector3(0, y, 0), name);
}
function collar(radius, tube, y, material = silver) {
  const item = add(new THREE.TorusGeometry(radius, tube, 14, 64), material, new THREE.Vector3(0, y, 0), "grip-collar");
  item.rotation.x = Math.PI / 2; return item;
}
function beamBetween(start, end, radius, material, name) {
  const direction = new THREE.Vector3().subVectors(end, start); const length = direction.length();
  const item = add(new THREE.CylinderGeometry(radius, radius, length, 28, 1), material, start.clone().add(end).multiplyScalar(0.5), name);
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return item;
}

// Beveled butt cap and wrapped grip.
cylinder(0.31, 0.18, silver, -3.25, "butt-cap", 64);
cylinder(0.285, 1.38, grip, -2.49, "grip-core", 64);
for (let i = 0; i < 10; i++) collar(0.288, 0.018, -3.05 + i * 0.13, i % 4 === 0 ? edgeBlue : carbon);
cylinder(0.24, 0.18, accent, -1.72, "grip-band", 64);
collar(0.245, 0.035, -1.80, silver);

// Carbon shaft and open V-shaped throat.
cylinder(0.115, 1.12, carbon, -1.08, "shaft", 48);
cylinder(0.14, 0.16, edgeBlue, -0.48, "shaft-collar", 48);
const throatBase = new THREE.Vector3(0, -0.38, 0);
beamBetween(throatBase, new THREE.Vector3(-0.62, 0.66, 0), 0.095, frameBlue, "left-throat");
beamBetween(throatBase, new THREE.Vector3(0.62, 0.66, 0), 0.095, frameBlue, "right-throat");
beamBetween(new THREE.Vector3(-0.51, 0.44, 0), new THREE.Vector3(0.51, 0.44, 0), 0.055, accent, "throat-bridge");

// Elliptical head: two layered hoops add depth and a protective bumper edge.
const headCenterY = 1.77, rx = 0.98, ry = 1.30;
const hoop = add(new THREE.TorusGeometry(1, 0.105, 22, 128), frameBlue, new THREE.Vector3(0, headCenterY, 0), "main-frame");
hoop.scale.set(rx, ry, 0.84);
const bumper = add(new THREE.TorusGeometry(1, 0.035, 14, 128, Math.PI * 1.08), carbon, new THREE.Vector3(0, headCenterY, -0.095), "head-bumper");
bumper.scale.set(rx * 1.045, ry * 1.045, 1); bumper.rotation.z = -Math.PI * 0.04;
const innerAccent = add(new THREE.TorusGeometry(1, 0.023, 12, 128), accent, new THREE.Vector3(0, headCenterY, 0.035), "inner-accent");
innerAccent.scale.set(rx * 0.91, ry * 0.91, 1);

// Individually modeled strings conform to the inner ellipse.
const innerRx = 0.81, innerRy = 1.10;
for (let x = -0.72; x <= 0.721; x += 0.12) {
  const length = innerRy * 2 * Math.sqrt(Math.max(0, 1 - (x * x) / (innerRx * innerRx)));
  const string = add(new THREE.CylinderGeometry(0.008, 0.008, length, 8), stringMaterial, new THREE.Vector3(x, headCenterY, 0.02), "vertical-string");
}
for (let y = -0.99; y <= 0.991; y += 0.11) {
  const length = innerRx * 2 * Math.sqrt(Math.max(0, 1 - (y * y) / (innerRy * innerRy)));
  const string = add(new THREE.CylinderGeometry(0.007, 0.007, length, 8), stringMaterial, new THREE.Vector3(0, headCenterY + y, 0.035), "horizontal-string");
  string.rotation.z = Math.PI / 2;
}

// Raised grommets around the hoop catch highlights as the racket rotates.
for (let i = 0; i < 34; i++) {
  const a = i / 34 * Math.PI * 2;
  const grommet = add(new THREE.SphereGeometry(0.035, 14, 10), carbon, new THREE.Vector3(Math.cos(a) * rx, headCenterY + Math.sin(a) * ry, 0.105), "grommet");
  grommet.scale.z = 0.65;
}

const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.045, -Math.PI / 2, "YXZ"));
const targetQuaternion = baseQuaternion.clone(); racket.quaternion.copy(baseQuaternion); racket.position.set(0.05, -1.34, 0);
let sensorActive = false, lastSensorAt = 0, angularEnergy = 0;

function setEuler({ roll = 0, pitch = 0, yaw = 0 }, degrees = true) {
  const unit = degrees ? Math.PI / 180 : 1;
  const motion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * unit, yaw * unit, -roll * unit, "YXZ"));
  targetQuaternion.copy(baseQuaternion).multiply(motion); sensorActive = true; lastSensorAt = performance.now();
}
function setQuaternion(x, y, z, w) { targetQuaternion.copy(baseQuaternion).multiply(new THREE.Quaternion(x, y, z, w).normalize()); sensorActive = true; lastSensorAt = performance.now(); }
function setAngularVelocity(x = 0, y = 0, z = 0) { angularEnergy = Math.min(1, Math.hypot(x, y, z) / 5); }
function resetOrientation() { targetQuaternion.copy(baseQuaternion); sensorActive = false; lastSensorAt = 0; }

window.tennisRacket3D = Object.freeze({ object: racket, scene, camera, renderer, setEuler, setQuaternion, setAngularVelocity, resetOrientation });
window.dispatchEvent(new CustomEvent("tennis-racket-ready", { detail: window.tennisRacket3D }));

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
canvas.addEventListener("pointerup", () => dragging = false);
canvas.addEventListener("dblclick", resetOrientation);
canvas.addEventListener("wheel", event => { camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.006, 7.5, 16); }, { passive: true });

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate); const time = clock.getElapsedTime();
  if (lastSensorAt && performance.now() - lastSensorAt > 1800) resetOrientation();
  racket.quaternion.slerp(targetQuaternion, 0.1 + angularEnergy * 0.11);
  racket.position.y = THREE.MathUtils.lerp(racket.position.y, -1.34, 0.08);
  rim.intensity = 3.6 + Math.sin(time * 0.7) * 0.25 + angularEnergy * 2.2;
  angularEnergy *= 0.94;
  renderer.render(scene, camera);
  if (!document.documentElement.classList.contains("webgl-ready")) document.documentElement.classList.add("webgl-ready");
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); camera.position.z = cameraDistance();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
});
