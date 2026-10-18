# Solve in Toy

NU40 보드 두 대와 6축 IMU 두 대를 위한 양손형 모션 대시보드입니다.
카메라 없이 USB 시리얼 IMU 데이터만 사용합니다.

## 폴더 구성

- `andrew/andrew.ino`: 좌우 보드 공용 펌웨어
- `app.py`: 시리얼 수신, 센서 보정, 자세 계산, WebSocket 서버
- `static`: 메인 대시보드
- `_lightsaber`: IMU 광선검 에셋
- `_tennis_racket`: IMU 테니스 라켓 에셋
- `_gun`: IMU 블래스터 에셋
- `_fishing_rod`: IMU 낚싯대 에셋

각 3D 에셋은 외부 모델 파일을 불러오지 않고 JavaScript 도형으로 생성됩니다.
로컬 Three.js 파일을 함께 포함하므로 에셋 표시에는 인터넷 연결이 필요하지 않습니다.

## 펌웨어 업로드

양쪽 보드에 같은 `andrew.ino`를 사용합니다. 업로드 전에 아래 설정만 변경합니다.

```cpp
// 왼손 보드
#define DEFAULT_HAND_SIDE HAND_LEFT

// 오른손 보드
#define DEFAULT_HAND_SIDE HAND_RIGHT
```

왼손 보드 업로드 후 값을 `HAND_RIGHT`로 바꾸고 오른손 보드에 다시 업로드합니다.

## 실행

`start_dashboard.bat`을 더블클릭합니다. 처음 실행할 때 필요한 Python 패키지가 없으면
`requirements.txt`를 이용해 설치합니다. 대시보드가 열리면 각 보드의 COM 포트를 선택하고
`CONNECT`를 누릅니다.

수동 실행은 다음과 같습니다.

```powershell
python -m pip install -r requirements.txt
python app.py
```

센서 없이 화면을 확인하려면 다음 명령을 사용합니다.

```powershell
python app.py --demo
```

## 화면 주소

| 화면 | 주소 |
| --- | --- |
| 대시보드 | `http://127.0.0.1:8000/` |
| 광선검 | `http://127.0.0.1:8000/lightsaber` |
| 테니스 라켓 | `http://127.0.0.1:8000/tennis` |
| 총 | `http://127.0.0.1:8000/gun` |
| 낚싯대 | `http://127.0.0.1:8000/fishing` |

`app.py`는 `andrew.ino`가 보내는 g 및 deg/s 값을 대시보드 내부 표준인 m/s² 및
rad/s로 변환합니다. 기존 `board/accel/gyro` JSON과 CSV 형식도 계속 지원합니다.

## 영점 보정

센서를 움직이지 않고 평평하게 둔 뒤 대시보드의 영점 보정 버튼을 누릅니다.
대시보드는 보드에 `CAL_GYRO` 명령을 보내며, `andrew.ino`가 보정을 마치면 현재 자세를
화면의 0도 기준으로 다시 설정합니다.

Arduino IDE의 시리얼 모니터가 COM 포트를 사용 중이면 대시보드에서 연결할 수 없으므로
시리얼 모니터를 먼저 닫아야 합니다.
