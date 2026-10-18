import * as THREE from "./vendor/v01851/three.module.min.js";
import { updateShortcutMode, updateShortcutSnapshot } from "/static/mode-overlay.js";

const canvas = document.querySelector("#viewport");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x010304, 0.055);
const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.05, 80);
const fittedCameraDistance = () => Math.max(9.4, 4.45 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (innerWidth / innerHeight)));
camera.position.set(0, 0.35, fittedCameraDistance());
camera.lookAt(0, 0.35, 0);

scene.add(new THREE.HemisphereLight(0xb7e9f2, 0x050607, 0.78));
const key = new THREE.DirectionalLight(0xe8fbff, 4.4);
key.position.set(-4, 6, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x4ea7ff, 3.2);
rim.position.set(5, 1, -5); scene.add(rim);
const warm = new THREE.PointLight(0xffa35c, 8, 7, 2);
warm.position.set(-2.2, -1.3, 3.2); scene.add(warm);

const metal = new THREE.MeshPhysicalMaterial({ color: 0x7d888b, metalness: 0.96, roughness: 0.2, clearcoat: 0.34, clearcoatRoughness: 0.2 });
const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x111719, metalness: 0.9, roughness: 0.27, clearcoat: 0.18 });
const black = new THREE.MeshStandardMaterial({ color: 0x070a0b, metalness: 0.55, roughness: 0.5 });
const copper = new THREE.MeshPhysicalMaterial({ color: 0x9b5e35, metalness: 0.92, roughness: 0.25, clearcoat: 0.2 });
const ceramic = new THREE.MeshPhysicalMaterial({ color: 0x293033, metalness: 0.6, roughness: 0.34, clearcoat: 0.4 });
const cyan = new THREE.Color(0x55ecff);

const saber = new THREE.Group();
saber.name = "LightsaberAsset";
scene.add(saber);

function mesh(geometry, material, y = 0, name = "part") {
  const item = new THREE.Mesh(geometry, material);
  item.position.y = y; item.name = name; saber.add(item); return item;
}
function cylinder(top, bottom, height, material, y, segments = 64, name = "cylinder") {
  return mesh(new THREE.CylinderGeometry(top, bottom, height, segments, 2, false), material, y, name);
}
function collar(radius, tube, y, material = metal) {
  const item = mesh(new THREE.TorusGeometry(radius, tube, 16, 72), material, y, "collar");
  item.rotation.x = Math.PI / 2; return item;
}

// Pommel and lower grip: layered parts make the silhouette read from every angle.
cylinder(0.34, 0.37, 0.16, metal, -2.08, 64, "pommel-cap");
cylinder(0.37, 0.37, 0.14, darkMetal, -1.94, 64, "pommel-ring");
collar(0.33, 0.052, -1.88, copper);
cylinder(0.30, 0.31, 1.54, black, -1.08, 64, "grip-core");

for (let i = 0; i < 12; i++) {
  const angle = i / 12 * Math.PI * 2;
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.28, 0.065, 1, 4, 1), darkMetal);
  rib.position.set(Math.sin(angle) * 0.31, -1.08, Math.cos(angle) * 0.31);
  rib.rotation.y = angle; rib.name = "grip-rib"; saber.add(rib);
}
for (const y of [-1.75, -1.43, -1.10, -0.77, -0.43]) collar(0.305, 0.026, y, ceramic);

// Control section, switch box and illuminated activation stud.
cylinder(0.34, 0.31, 0.38, metal, -0.12, 64, "control-neck");
collar(0.34, 0.045, -0.30, copper); collar(0.35, 0.04, 0.07, darkMetal);
const controlBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.48, 0.15, 4, 6, 2), darkMetal);
controlBox.position.set(0, -0.1, 0.35); controlBox.name = "control-box"; saber.add(controlBox);
const rails = [-0.11, 0, 0.11];
rails.forEach((offset) => {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.34, 0.035), copper);
  rail.position.set(offset, -0.1, 0.438); saber.add(rail);
});
const switchMaterial = new THREE.MeshBasicMaterial({ color: cyan, toneMapped: false });
const switchLight = new THREE.Mesh(new THREE.SphereGeometry(0.058, 32, 20), switchMaterial);
switchLight.position.set(0, -0.13, 0.465); switchLight.scale.z = 0.45; switchLight.name = "activation-switch"; saber.add(switchLight);

// Upper chassis and emitter with four protective claws.
cylinder(0.32, 0.34, 0.38, ceramic, 0.26, 64, "upper-chassis");
cylinder(0.39, 0.32, 0.18, metal, 0.54, 64, "emitter-shoulder");
collar(0.37, 0.055, 0.43, copper);
cylinder(0.43, 0.39, 0.16, darkMetal, 0.70, 64, "emitter-body");
collar(0.43, 0.045, 0.78, metal);
cylinder(0.31, 0.31, 0.08, black, 0.80, 64, "emitter-well");

for (let i = 0; i < 4; i++) {
  const angle = i / 4 * Math.PI * 2;
  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.54, 0.13, 2, 5, 2), darkMetal);
  claw.position.set(Math.sin(angle) * 0.41, 0.68, Math.cos(angle) * 0.41);
  claw.rotation.y = angle;
  claw.rotation.z = Math.sin(angle) * -0.05;
  claw.name = "emitter-claw"; saber.add(claw);
}

// The blade is a true 3D emissive assembly. A camera-facing halo adds optical bloom
// while the white and cyan cylinders preserve correct depth from every view.
const bladePivot = new THREE.Group();
bladePivot.position.y = 0.82; bladePivot.name = "blade"; saber.add(bladePivot);
const bladeLength = 4.75;
const core = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.061, bladeLength, 48, 1, false),
  new THREE.MeshBasicMaterial({ color: 0xf5ffff, toneMapped: false })
);
core.position.y = bladeLength / 2; core.name = "blade-core"; bladePivot.add(core);
const plasma = new THREE.Mesh(
  new THREE.CylinderGeometry(0.105, 0.14, bladeLength, 48, 1, true),
  new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.33, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
);
plasma.position.y = bladeLength / 2; plasma.name = "blade-plasma"; bladePivot.add(plasma);
const aura = new THREE.Mesh(
  new THREE.CylinderGeometry(0.21, 0.24, bladeLength, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
);
aura.position.y = bladeLength / 2; aura.name = "blade-aura"; bladePivot.add(aura);
const tip = new THREE.Mesh(new THREE.SphereGeometry(0.102, 40, 24), core.material);
tip.position.y = bladeLength; tip.scale.y = 1.3; bladePivot.add(tip);

const emitterLight = new THREE.PointLight(cyan, 26, 5.5, 2);
emitterLight.position.y = 0.86; saber.add(emitterLight);
const bladeLight = new THREE.PointLight(cyan, 14, 7.5, 2);
bladeLight.position.y = 3.25; saber.add(bladeLight);

// With no sensor, the saber rests horizontally near the bottom of the frame.
const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0.04, -Math.PI / 2, "YXZ"));
const targetQuaternion = baseQuaternion.clone();
saber.quaternion.copy(baseQuaternion);
saber.position.set(-1.65, -1.42, 0);
let bladeTarget = 1;
let sensorActive = false;
let lastSensorAt = 0;
let angularEnergy = 0;

function setEuler({ roll = 0, pitch = 0, yaw = 0 }, degrees = true) {
  const unit = degrees ? Math.PI / 180 : 1;
  const motion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * unit, yaw * unit, -roll * unit, "YXZ"));
  targetQuaternion.copy(baseQuaternion).multiply(motion); sensorActive = true; lastSensorAt = performance.now();
}
function setQuaternion(x, y, z, w) {
  const motion = new THREE.Quaternion(x, y, z, w).normalize();
  targetQuaternion.copy(baseQuaternion).multiply(motion); sensorActive = true; lastSensorAt = performance.now();
}
function setAngularVelocity(x = 0, y = 0, z = 0) { angularEnergy = Math.min(1, Math.hypot(x, y, z) / 5); }
function ignite(on = true) { bladeTarget = on ? 1 : 0.0001; }
function resetOrientation() { targetQuaternion.copy(baseQuaternion); sensorActive = false; }

window.lightsaber3D = Object.freeze({ object: saber, scene, camera, renderer, setEuler, setQuaternion, setAngularVelocity, ignite, resetOrientation });
window.dispatchEvent(new CustomEvent("lightsaber-ready", { detail: window.lightsaber3D }));

// Optional live bridge: the asset also works standalone, and this adapter can be
// removed or replaced later without touching the model.
function connectMotionBridge() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.addEventListener("message", (event) => {
    const value = JSON.parse(event.data);
    if (value.type === "snapshot") updateShortcutSnapshot(value.boards);
    const packet = value.type === "snapshot" ? Object.values(value.boards || {}).find(v => v.board === "RIGHT") || Object.values(value.boards || {})[0] : value;
    if (!packet || packet.type !== "sensor") return;
    updateShortcutMode(packet);
    if (packet.orientation) setEuler(packet.orientation, true);
    const gyro = packet.gyro_aligned || packet.gyro;
    if (gyro) setAngularVelocity(gyro.x, gyro.y, gyro.z);
  });
  socket.addEventListener("close", () => setTimeout(connectMotionBridge, 1500));
  socket.addEventListener("error", () => socket.close());
}
connectMotionBridge();

let dragging = false, previousX = 0, previousY = 0;
canvas.addEventListener("pointerdown", (event) => { dragging = true; previousX = event.clientX; previousY = event.clientY; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = (event.clientX - previousX) * 0.008, dy = (event.clientY - previousY) * 0.008;
  previousX = event.clientX; previousY = event.clientY;
  const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(dy, dx, 0, "YXZ"));
  targetQuaternion.premultiply(delta); sensorActive = true; lastSensorAt = 0;
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("wheel", (event) => { camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.006, 7.2, 14); }, { passive: true });
canvas.addEventListener("dblclick", () => ignite(bladeTarget < 0.5));

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();
  if (lastSensorAt && performance.now() - lastSensorAt > 1800) resetOrientation();
  saber.quaternion.slerp(targetQuaternion, 0.105 + angularEnergy * 0.1);
  saber.position.x = THREE.MathUtils.lerp(saber.position.x, -1.65, 0.08);
  saber.position.y = THREE.MathUtils.lerp(saber.position.y, -1.42, 0.08);
  bladePivot.scale.y = THREE.MathUtils.lerp(bladePivot.scale.y, bladeTarget, 0.15);
  const pulse = 1 + Math.sin(time * 21) * 0.025 + angularEnergy * 0.2;
  plasma.scale.x = plasma.scale.z = pulse;
  aura.scale.x = aura.scale.z = 1 + angularEnergy * 0.45;
  bladeLight.intensity = 14 + Math.sin(time * 25) * 1.2 + angularEnergy * 9;
  emitterLight.intensity = 25 + Math.sin(time * 19) * 2;
  angularEnergy *= 0.94;
  renderer.render(scene, camera);
  if (!document.documentElement.classList.contains("webgl-ready")) document.documentElement.classList.add("webgl-ready");
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camera.position.z = fittedCameraDistance();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
});
