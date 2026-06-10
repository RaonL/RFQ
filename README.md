# F5 스펙 매칭 추천 웹

고객이 F5 장비 견적 요청 시 전달한 요구 스펙을 입력하면, 사전에 등록된 F5 rSeries 장비 스펙과 자동 비교하여 가장 적합한 모델을 추천하는 Flask 웹앱입니다.

## 현재 기능

- 고객 요구 스펙 textarea 입력
- PDF, XLSX, CSV, TXT 파일 업로드
- L4/L7 Throughput, SSL TPS, Concurrent Connection, SSD, Port 조건 자동 추출
- 전원/FAN 이중화 같은 정성 조건 인식
- F5 rSeries 장비별 충족/미충족 비교
- 가장 적합한 최소 모델 추천
- 제안용 메일 문구 자동 생성

## 예시 입력

```text
L4 Throughput 20Gbps 이상
L7 Throughput 13Gbps 이상
Concurrent Connection 19M 이상
SSL TPS 7000 이상
1G/10G/25G SFP+ 4Port 이상
SSD 480GB 이상
전원/FAN 이중화
```

## 예시 결과

```text
추천 장비: F5 BIG-IP R2600

문의 주신 스펙 기준으로는 F5 BIG-IP R2600 모델이 적합합니다.
요구하신 주요 성능 및 구성 조건을 충족하므로 해당 장비로 제안 진행하시면 됩니다.
```

## 기준 데이터

- `data/reference_data.json`: 제공된 F5 데이터시트와 경쟁사 비교 엑셀에서 추출한 기준 자료

원본 PDF/XLSX는 저장소에 넣지 않도록 `.gitignore`에 포함했습니다.

기준 데이터를 다시 추출할 때는 원본 파일을 `source/` 폴더에 두거나 환경변수로 경로를 지정합니다.

```bash
set F5_DATA_SHEET_PATH=C:\path\to\F5_rSeries_Appliance_Data_Sheet.pdf
set F5_COMPARISON_XLSX_PATH=C:\path\to\r-Series.xlsx
python extract_reference_data.py
```

## 로컬 실행

```bash
pip install -r requirements.txt
python app.py
```

브라우저에서 `http://localhost:5000`으로 접속합니다.

## Render 배포

1. GitHub 저장소 `RaonL/RFQ`에 push합니다.
2. Render에서 Web Service를 만들고 해당 저장소를 연결합니다.
3. `render.yaml` 설정을 사용하면 빌드와 실행 명령이 자동 적용됩니다.
