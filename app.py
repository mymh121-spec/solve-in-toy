"""LSM6DS3TR-C serial/Wi-Fi JSON bridge and local dashboard server."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import serial
from serial import SerialException
from serial.tools import list_ports
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
EXPERIENCE_STATIC = {
    "lightsaber": ROOT / "_lightsaber" / "static",
    "tennis": ROOT / "_tennis_racket" / "static",
    "tennis-racket": ROOT / "_tennis_racket" / "static",
    "gun": ROOT / "_gun" / "static",
    "fishing": ROOT / "_fishing_rod" / "static",
    "fishing-rod": ROOT / "_fishing_rod" / "static",
}


def _number(value: Any) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("non-finite number")
    return round(number, 4)


def normalize_packet(value: Any) -> dict[str, Any]:
    """Validate and normalize one sensor packet."""
    if not isinstance(value, dict):
        raise ValueError("packet must be an object")

    # andrew.ino uses hand/device_id plus g and deg/s values, while the
    # original dashboard protocol uses board plus m/s^2 and rad/s values.
    # Normalize both formats here so every page receives one stable schema.
    board = str(value.get("board", value.get("board_id", ""))).strip().upper()
    hand = str(value.get("hand", "")).strip().upper()
    device_id = str(value.get("device_id", "")).strip().lower()
    if not board:
        if hand in {"L", "LEFT"} or device_id.endswith("-left"):
            board = "LEFT"
        elif hand in {"R", "RIGHT"} or device_id.endswith("-right"):
            board = "RIGHT"
    if not board or len(board) > 24:
        raise ValueError("invalid board")

    imu = value.get("imu")
    if value.get("type") == "imu" and isinstance(imu, dict):
        accel = {
            "x": _number(float(imu["ax_g"]) * 9.80665),
            "y": _number(float(imu["ay_g"]) * 9.80665),
            "z": _number(float(imu["az_g"]) * 9.80665),
        }
        gyro = {
            "x": _number(math.radians(float(imu["gx_dps"]))),
            "y": _number(math.radians(float(imu["gy_dps"]))),
            "z": _number(math.radians(float(imu["gz_dps"]))),
        }
        calibration = str(value.get("calibration", "")).strip().lower()
        return {
            "type": "sensor",
            "board": board,
            "seq": int(value.get("seq", 0)),
            "timestamp_ms": int(value.get("ts_ms", value.get("timestamp_ms", 0))),
            "received_at": round(time.time() * 1000),
            "accel": accel,
            "gyro": gyro,
            "board_calibration_capable": True,
            "calibrated_on_board": calibration == "ready",
            "board_stationary": bool(value.get("stationary", False)),
            "mode_id": str(value.get("mode_id", "raw")),
            "zero_valid": bool(value.get("zero_valid", False)),
            "firmware_calibration": calibration or "unknown",
            "device_id": device_id,
        }

    accel = value.get("accel", {})
    gyro = value.get("gyro", {})
    if not isinstance(accel, dict) or not isinstance(gyro, dict):
        raise ValueError("accel and gyro must be objects")

    packet = {
        "type": "sensor",
        "board": board,
        "seq": int(value.get("seq", 0)),
        "timestamp_ms": int(value.get("timestamp_ms", 0)),
        "received_at": round(time.time() * 1000),
        "accel": {axis: _number(accel[axis]) for axis in "xyz"},
        "gyro": {axis: _number(gyro[axis]) for axis in "xyz"},
        "board_calibration_capable": "calibrated_on_board" in value,
        "calibrated_on_board": bool(value.get("calibrated_on_board", False)),
        "board_stationary": bool(value.get("stationary", False)),
    }
    raw_gyro = value.get("gyro_raw")
    if isinstance(raw_gyro, dict) and all(axis in raw_gyro for axis in "xyz"):
        packet["gyro_raw"] = {axis: _number(raw_gyro[axis]) for axis in "xyz"}
    return packet


def parse_sensor_line(line: str) -> dict[str, Any]:
    """Parse NDJSON or the legacy BOARD,ax,ay,az,gx,gy,gz CSV format."""
    text = line.strip()
    if not text:
        raise ValueError("empty line")
    if text.startswith("{"):
        return normalize_packet(json.loads(text))

    parts = [part.strip() for part in text.split(",")]
    if len(parts) != 7:
        raise ValueError("not a sensor packet")
    return normalize_packet(
        {
            "board": parts[0],
            "accel": dict(zip("xyz", parts[1:4])),
            "gyro": dict(zip("xyz", parts[4:7])),
        }
    )


def _accel_angles(accel: dict[str, float]) -> tuple[float, float]:
    """Return accelerometer roll/pitch in radians."""
    roll = math.atan2(accel["y"], accel["z"])
    pitch = math.atan2(-accel["x"], math.hypot(accel["y"], accel["z"]))
    return roll, pitch


def _blend_angle(current: float, target: float, target_weight: float) -> float:
    """Blend angles while taking the shortest path across +/- pi."""
    delta = (target - current + math.pi) % (2 * math.pi) - math.pi
    return current + delta * target_weight


class MotionFilter:
    """Stationary-aware gyro bias estimator and 6-DoF complementary filter."""

    GRAVITY = 9.80665

    def __init__(self) -> None:
        self.offset = {axis: 0.0 for axis in "xyz"}
        self.noise = {axis: 0.006 for axis in "xyz"}
        self.deadzone = {axis: 0.012 for axis in "xyz"}
        self.calibrated = False
        self.auto_calibrated = False
        self.stationary = False
        self.stationary_count = 0
        self.last_received_at: int | None = None
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0
        self.zero_roll = 0.0
        self.zero_pitch = 0.0
        self.initialized = False
        self.gyro_window: deque[dict[str, float]] = deque(maxlen=120)
        self.accel_window: deque[dict[str, float]] = deque(maxlen=120)

    @staticmethod
    def _robust_noise(values: list[float]) -> float:
        center = statistics.median(values)
        mad = statistics.median(abs(value - center) for value in values)
        return max(0.001, mad * 1.4826)

    @staticmethod
    def _stable_window(samples: list[dict[str, Any]]) -> bool:
        if len(samples) < 40:
            return False
        accel_norms = [math.sqrt(sum(item["accel"][axis] ** 2 for axis in "xyz")) for item in samples]
        if abs(statistics.median(accel_norms) - MotionFilter.GRAVITY) > 1.1:
            return False
        if statistics.pstdev(accel_norms) > 0.28:
            return False
        return all(
            statistics.pstdev([item["gyro"][axis] for item in samples]) < 0.028
            for axis in "xyz"
        )

    def _apply_calibration(self, samples: list[dict[str, Any]], automatic: bool) -> None:
        for axis in "xyz":
            values = [item["gyro"][axis] for item in samples]
            self.offset[axis] = statistics.median(values)
            self.noise[axis] = self._robust_noise(values)
            self.deadzone[axis] = min(0.05, max(0.008, self.noise[axis] * 3.5))

        rolls, pitches = zip(*(_accel_angles(item["accel"]) for item in samples))
        self.zero_roll = statistics.median(rolls)
        self.zero_pitch = statistics.median(pitches)
        self.roll = self.zero_roll
        self.pitch = self.zero_pitch
        self.yaw = 0.0
        self.initialized = True
        self.calibrated = True
        self.auto_calibrated = automatic
        self.stationary = True
        self.stationary_count = 30

    def manual_calibrate(self, samples: list[dict[str, Any]]) -> dict[str, Any]:
        window = samples[-120:]
        if len(window) < 40:
            raise ValueError("정렬하려면 해당 센서를 1초 이상 연결해 주세요.")
        if not self._stable_window(window):
            raise ValueError("센서가 움직이고 있습니다. 평평하게 두고 1초 후 다시 정렬해 주세요.")
        self._apply_calibration(window, automatic=False)
        return {
            "samples": len(window),
            "gyro_offset": {axis: round(self.offset[axis], 6) for axis in "xyz"},
            "deadzone": {axis: round(self.deadzone[axis], 6) for axis in "xyz"},
            "accel_reference_deg": {
                "roll": round(math.degrees(self.zero_roll), 3),
                "pitch": round(math.degrees(self.zero_pitch), 3),
            },
        }

    def zero_pose(self, samples: list[dict[str, Any]]) -> dict[str, float]:
        """Make the board's current stationary pose the displayed level (0 degrees)."""
        window = samples[-120:]
        if not window:
            raise ValueError("기준 자세를 설정할 센서 데이터가 없습니다.")

        # Use the median acceleration vector so one noisy sample cannot tilt the
        # reference. Gyro bias is calibrated on the board; this is the separate
        # pose/reference part of the same web calibration action.
        reference_accel = {
            axis: statistics.median(item["accel"][axis] for item in window)
            for axis in "xyz"
        }
        reference_roll, reference_pitch = _accel_angles(reference_accel)
        self.roll = reference_roll
        self.pitch = reference_pitch
        self.yaw = 0.0
        self.zero_roll = reference_roll
        self.zero_pitch = reference_pitch
        self.initialized = True
        self.last_received_at = None
        return {
            "roll": round(math.degrees(reference_roll), 3),
            "pitch": round(math.degrees(reference_pitch), 3),
            "yaw": 0.0,
        }

    def process(self, packet: dict[str, Any]) -> dict[str, Any]:
        board_calibrated = packet.get("calibrated_on_board", False)
        if board_calibrated and not self.calibrated:
            self.offset = {axis: 0.0 for axis in "xyz"}
            self.deadzone = {axis: 0.0 for axis in "xyz"}
            self.calibrated = True
            self.auto_calibrated = False

        self.gyro_window.append(packet["gyro"])
        self.accel_window.append(packet["accel"])

        # On first connection, learn a bias only after a quiet, gravity-consistent window.
        if not board_calibrated and not self.calibrated and len(self.gyro_window) >= 100:
            auto_samples = [
                {"gyro": gyro, "accel": accel}
                for gyro, accel in zip(self.gyro_window, self.accel_window)
            ]
            if self._stable_window(auto_samples):
                self._apply_calibration(auto_samples, automatic=True)

        now = packet["received_at"]
        dt = 0.0 if self.last_received_at is None else min(0.05, max(0.001, (now - self.last_received_at) / 1000))
        self.last_received_at = now
        accel = packet["accel"]
        accel_norm = math.sqrt(sum(accel[axis] ** 2 for axis in "xyz"))
        accel_is_gravity = abs(accel_norm - self.GRAVITY) < 0.75

        corrected = {
            axis: packet["gyro"][axis] if board_calibrated else packet["gyro"][axis] - self.offset[axis]
            for axis in "xyz"
        }
        gyro_limit = max(0.045, min(0.11, math.sqrt(sum(value ** 2 for value in self.noise.values())) * 4.5))
        quiet_now = (
            packet.get("board_stationary", False)
            if board_calibrated
            else self.calibrated
            and accel_is_gravity
            and math.sqrt(sum(value ** 2 for value in corrected.values())) < gyro_limit
        )
        # Debounce entry into stillness, but leave it immediately so gestures are not swallowed.
        self.stationary_count = min(60, self.stationary_count + 1) if quiet_now else 0
        self.stationary = quiet_now if board_calibrated else self.stationary_count >= 18

        # Zero-angular-rate update: slowly follow temperature-dependent bias while still.
        if self.stationary and not board_calibrated:
            bias_alpha = 0.004
            for axis in "xyz":
                self.offset[axis] = (1 - bias_alpha) * self.offset[axis] + bias_alpha * packet["gyro"][axis]
                corrected[axis] = packet["gyro"][axis] - self.offset[axis]

        aligned = (
            dict(corrected)
            if board_calibrated
            else {
                axis: 0.0 if abs(corrected[axis]) <= self.deadzone[axis] else corrected[axis]
                for axis in "xyz"
            }
        )
        if self.stationary:
            aligned = {axis: 0.0 for axis in "xyz"}

        accel_roll, accel_pitch = _accel_angles(accel)
        if not self.initialized:
            self.roll, self.pitch = accel_roll, accel_pitch
            self.zero_roll, self.zero_pitch = accel_roll, accel_pitch
            self.initialized = True
        elif dt:
            self.roll += aligned["x"] * dt
            self.pitch += aligned["y"] * dt
            # Accelerometer corrects roll/pitch drift only when its magnitude resembles gravity.
            if accel_is_gravity:
                correction = 0.035 if self.stationary else 0.012
                self.roll = _blend_angle(self.roll, accel_roll, correction)
                self.pitch = _blend_angle(self.pitch, accel_pitch, correction)
            # A 6-DoF IMU has no absolute yaw reference; freeze yaw while stationary.
            if not self.stationary:
                self.yaw += aligned["z"] * dt

        return {
            "gyro_aligned": {axis: round(aligned[axis], 5) for axis in "xyz"},
            "orientation": {
                "roll": round(math.degrees(self.roll - self.zero_roll), 3),
                "pitch": round(math.degrees(self.pitch - self.zero_pitch), 3),
                "yaw": round(math.degrees(self.yaw), 3),
            },
            "stationary": self.stationary,
            "calibrated": self.calibrated,
            "calibration": {
                "location": "board" if board_calibrated else "computer",
                "automatic": self.auto_calibrated,
                "gyro_offset": {axis: round(self.offset[axis], 6) for axis in "xyz"},
                "deadzone": {axis: round(self.deadzone[axis], 6) for axis in "xyz"},
            },
        }


class SensorHub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.latest: dict[str, dict[str, Any]] = {}
        self.samples: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=250))
        self.filters: dict[str, MotionFilter] = defaultdict(MotionFilter)
        self.sources: dict[str, str] = {}
        self.bad_lines = 0

    async def publish(self, packet: dict[str, Any], source: str) -> None:
        board = packet["board"]
        self.samples[board].append(packet)
        self.sources[board] = source
        filtered = self.filters[board].process(packet)
        output = {
            **packet,
            "source": source,
            **filtered,
        }
        self.latest[board] = output
        stale: list[WebSocket] = []
        message = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
        for client in tuple(self.clients):
            try:
                await client.send_text(message)
            except Exception:
                stale.append(client)
        for client in stale:
            self.clients.discard(client)

    async def broadcast_event(self, event: dict[str, Any], source: str) -> None:
        # CAL_GYRO is performed by the firmware. Once it succeeds, also reset
        # the server-side orientation reference so the pose resting on the
        # floor becomes roll=0, pitch=0 and yaw=0 on the dashboard.
        board = str(event.get("board", "")).strip().upper()
        if event.get("type") == "calibration" and event.get("status") == "complete" and board:
            try:
                pose_reference = self.filters[board].zero_pose(list(self.samples.get(board, ())))
                event = {**event, "pose_zeroed": True, "pose_reference_deg": pose_reference}
                latest = self.latest.get(board)
                if latest is not None:
                    latest["orientation"] = {"roll": 0.0, "pitch": 0.0, "yaw": 0.0}
            except ValueError:
                event = {**event, "pose_zeroed": False}
        message = json.dumps({**event, "source": source}, ensure_ascii=False, separators=(",", ":"))
        stale: list[WebSocket] = []
        for client in tuple(self.clients):
            try:
                await client.send_text(message)
            except Exception:
                stale.append(client)
        for client in stale:
            self.clients.discard(client)

    def calibrate(self, board: str) -> dict[str, Any]:
        key = board.strip().upper()
        recent = list(self.samples.get(key, ()))
        result = self.filters[key].manual_calibrate(recent)
        return {"ok": True, "board": key, **result}

    def status(self) -> dict[str, Any]:
        now = time.time() * 1000
        boards = {}
        for board, packet in self.latest.items():
            boards[board] = {
                "online": now - packet["received_at"] < 2000,
                "source": packet.get("source", self.sources.get(board, "unknown")),
                "last_received_at": packet["received_at"],
                "calibrated": packet.get("calibrated", False),
                "stationary": packet.get("stationary", False),
            }
        return {"boards": boards, "bad_lines": self.bad_lines}


hub = SensorHub()
app = FastAPI(title="NU IMU Dashboard", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
for experience, static_directory in EXPERIENCE_STATIC.items():
    app.mount(
        f"/{experience}/static",
        StaticFiles(directory=static_directory),
        name=f"{experience}-static",
    )


class SerialManager:
    """Manage ports explicitly selected from the dashboard."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._connections: dict[str, dict[str, Any]] = {}

    def snapshot(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {
                port: {
                    "status": item["status"],
                    "baudrate": item["baudrate"],
                    "error": item.get("error"),
                }
                for port, item in self._connections.items()
            }

    def connect(self, port: str, baudrate: int, loop: asyncio.AbstractEventLoop) -> None:
        normalized = port.strip().upper()
        available = {item.device.upper(): item.device for item in list_ports.comports()}
        if normalized not in available:
            raise ValueError(f"{port} 포트를 찾을 수 없습니다. 포트 목록을 새로고침해 주세요.")
        actual_port = available[normalized]
        with self._lock:
            current = self._connections.get(actual_port)
            if current and current["status"] in {"connecting", "connected"}:
                raise ValueError(f"{actual_port}는 이미 연결되어 있습니다.")
            stop_event = threading.Event()
            item = {
                "status": "connecting",
                "baudrate": baudrate,
                "error": None,
                "stop": stop_event,
                "device": None,
            }
            self._connections[actual_port] = item
        threading.Thread(
            target=self._worker,
            args=(actual_port, baudrate, loop, stop_event),
            daemon=True,
        ).start()

    def disconnect(self, port: str) -> None:
        with self._lock:
            item = self._connections.get(port)
            if not item:
                raise ValueError(f"{port}는 연결되어 있지 않습니다.")
            item["status"] = "disconnecting"
            item["stop"].set()
            device = item.get("device")
        if device and device.is_open:
            try:
                device.close()
            except SerialException:
                pass

    def send_command(self, port: str, command: str) -> None:
        normalized = port.strip().upper()
        with self._lock:
            match = next((name for name in self._connections if name.upper() == normalized), None)
            item = self._connections.get(match) if match else None
            if not item or item["status"] != "connected" or not item.get("device"):
                raise ValueError(f"{port}가 연결되어 있지 않습니다.")
            device = item["device"]
            try:
                device.write((command + "\n").encode("ascii"))
                device.flush()
            except (SerialException, OSError) as exc:
                raise ValueError(f"{port} 명령 전송 실패: {exc}") from exc

    def _worker(
        self,
        port: str,
        baudrate: int,
        loop: asyncio.AbstractEventLoop,
        stop_event: threading.Event,
    ) -> None:
        device: serial.Serial | None = None
        try:
            print(f"[serial] 수동 연결 시도: {port} @ {baudrate}")
            device = serial.Serial(port, baudrate, timeout=0.25)
            device.reset_input_buffer()
            with self._lock:
                item = self._connections.get(port)
                if not item or item["stop"] is not stop_event:
                    device.close()
                    return
                item["device"] = device
                item["status"] = "connected"
                item["error"] = None
            print(f"[serial] 연결됨: {port}")

            while not stop_event.is_set():
                raw = device.readline()
                if not raw:
                    continue
                text = raw.decode("utf-8", errors="replace").strip()
                if text.startswith("{"):
                    try:
                        decoded = json.loads(text)
                    except json.JSONDecodeError:
                        decoded = None
                    if isinstance(decoded, dict) and decoded.get("type") in {
                        "calibration",
                        "status",
                        "error",
                        "event",
                    }:
                        asyncio.run_coroutine_threadsafe(
                            hub.broadcast_event(decoded, f"serial:{port}"), loop
                        )
                        continue
                try:
                    packet = parse_sensor_line(text)
                except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                    hub.bad_lines += 1
                    continue
                asyncio.run_coroutine_threadsafe(hub.publish(packet, f"serial:{port}"), loop)
        except (SerialException, OSError) as exc:
            if not stop_event.is_set():
                with self._lock:
                    item = self._connections.get(port)
                    if item and item["stop"] is stop_event:
                        item["status"] = "error"
                        item["error"] = str(exc)
                print(f"[serial] {port} 연결 오류: {exc}")
        finally:
            if device and device.is_open:
                device.close()
            with self._lock:
                item = self._connections.get(port)
                if item and item["stop"] is stop_event and stop_event.is_set():
                    self._connections.pop(port, None)
                elif item and item["stop"] is stop_event:
                    item["device"] = None


serial_manager = SerialManager()


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/{experience}")
async def experience_index(experience: str) -> FileResponse:
    """Serve every motion experience from the shared sensor process."""
    static_directory = EXPERIENCE_STATIC.get(experience)
    if static_directory is None:
        raise HTTPException(status_code=404, detail="존재하지 않는 모션 페이지입니다.")
    return FileResponse(static_directory / "index.html")


@app.get("/api/status")
async def api_status() -> dict[str, Any]:
    return {**hub.status(), "serial_connections": serial_manager.snapshot()}


@app.get("/api/serial/ports")
async def api_serial_ports() -> dict[str, Any]:
    usb_hints = (
        "USB SERIAL",
        "USB 직렬",
        "USB-SERIAL",
        "USB TO SERIAL",
        "USB-TO-SERIAL",
        "USB UART",
        "USB CDC",
        "CP210",
        "CH340",
        "CH341",
        "FTDI",
        "ARDUINO",
        "ADAFRUIT",
        "NRF",
    )

    def port_priority(item: Any) -> tuple[int, int, str]:
        identity = " ".join(
            filter(None, (item.description, item.manufacturer, item.product, item.hwid))
        ).upper()
        is_usb_serial = any(hint in identity for hint in usb_hints)
        is_usb = item.vid is not None or "USB" in identity
        digits = "".join(character for character in item.device if character.isdigit())
        return (0 if is_usb_serial else 1 if is_usb else 2, int(digits or 9999), item.device)

    detected = sorted(list_ports.comports(), key=port_priority)
    ports = [
        {
            "device": item.device,
            "description": item.description or "Serial device",
            "hwid": item.hwid,
            "recommended": port_priority(item)[0] <= 1,
        }
        for item in detected
    ]
    return {"ports": ports, "connections": serial_manager.snapshot()}


@app.post("/api/serial/connect")
async def api_serial_connect(request: Request) -> dict[str, Any]:
    body = await request.json()
    port = str(body.get("port", "")).strip()
    baudrate = int(body.get("baudrate", 115200))
    if not port:
        raise HTTPException(status_code=422, detail="연결할 COM 포트를 선택해 주세요.")
    if baudrate not in {9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600}:
        raise HTTPException(status_code=422, detail="지원하지 않는 통신 속도입니다.")
    try:
        serial_manager.connect(port, baudrate, asyncio.get_running_loop())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, "port": port, "status": "connecting"}


@app.delete("/api/serial/connect/{port}")
async def api_serial_disconnect(port: str) -> dict[str, Any]:
    try:
        serial_manager.disconnect(port)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "port": port, "status": "disconnected"}


@app.post("/api/serial/command")
async def api_serial_command(request: Request) -> dict[str, Any]:
    body = await request.json()
    port = str(body.get("port", "")).strip()
    command = str(body.get("command", "")).strip().upper()
    allowed = {"CAL_GYRO", "CAL_STATUS", "RESET_CAL"}
    if command not in allowed:
        raise HTTPException(status_code=422, detail="지원하지 않는 보드 명령입니다.")
    try:
        serial_manager.send_command(port, command)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, "port": port, "command": command}


@app.post("/api/sensor")
async def api_sensor(request: Request) -> dict[str, Any]:
    """Wi-Fi boards can POST the same JSON packet to this endpoint."""
    try:
        packet = normalize_packet(await request.json())
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"잘못된 센서 JSON: {exc}") from exc
    await hub.publish(packet, "wifi")
    return {"ok": True, "board": packet["board"]}


@app.post("/api/calibrate/{board}")
async def api_calibrate(board: str) -> dict[str, Any]:
    try:
        return hub.calibrate(board)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    hub.clients.add(websocket)
    try:
        await websocket.send_json({"type": "snapshot", "boards": hub.latest})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(websocket)


async def demo_worker() -> None:
    seq = 0
    while True:
        now = time.monotonic()
        for board, phase in (("LEFT", 0.0), ("RIGHT", 1.3)):
            packet = normalize_packet(
                {
                    "board": board,
                    "seq": seq,
                    "timestamp_ms": int(now * 1000),
                    "accel": {
                        "x": math.sin(now + phase) * 2,
                        "y": math.cos(now * 0.7 + phase) * 2,
                        "z": 9.81 + math.sin(now * 0.5 + phase) * 0.25,
                    },
                    "gyro": {
                        "x": math.sin(now * 1.4 + phase),
                        "y": math.cos(now * 1.1 + phase) * 0.7,
                        "z": math.sin(now * 0.8 + phase) * 0.5,
                    },
                }
            )
            await hub.publish(packet, "demo")
        seq += 1
        await asyncio.sleep(0.02)


@app.on_event("startup")
async def startup() -> None:
    config = app.state.config
    if config.demo:
        asyncio.create_task(demo_worker())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NU IMU 실시간 웹 대시보드")
    parser.add_argument("--demo", action="store_true", help="센서 없이 데모 데이터 생성")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--web-port", type=int, default=8000)
    return parser


if __name__ == "__main__":
    import uvicorn

    args = build_parser().parse_args()
    app.state.config = args
    uvicorn.run(app, host=args.host, port=args.web_port)
else:
    app.state.config = build_parser().parse_args([])
