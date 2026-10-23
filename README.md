# F5 스펙 매칭 추천 웹

고객이 F5 장비 견적 요청 시 전달한 요구 스펙을 입력하면, 사전에 등록된 F5 rSeries 장비 스펙과 자동 비교하여 가장 적합한 모델을 추천하는 Flask 웹앱입니다.

## 현재 기능

- 고객 요구 스펙 textarea 입력
- PDF, XLSX, CSV, TXT 파일 업로드
- L4/L7 Throughput, SSL TPS, Concurrent Connection, SSD, Port 조건 자동 추출
- SFP/SFP+/SFP28/Copper 포트 유형 분리 비교
- 모든 필수 조건을 만족하는 모델 중 최저 tier 모델 추천
- 조건을 만족하는 모델이 없을 때 근접 모델 3개와 미충족 항목 표시
- 전원/FAN 이중화 같은 정성 조건 인식
- F5 rSeries 장비별 충족/미충족/여유 있음/확인 필요 비교
- 간단 답변, 상세 답변, 내부 검토 보고용 메일 문구 자동 생성
- 경쟁 모델 비교표 접힘 표시

## 예시 입력

```text
L4 Throughput 20Gbps 이상
L7 Throughput 13Gbps 이상
Concurrent Connection 19M 이상
SSL TPS 7000 이상
25G SFP28 4Port 이상
10G Copper 4Port 이상
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

## 2026-10-23 요구규격 검토 업데이트

- 입력 줄바꿈을 보존하고 WAF / 로그서버 / DNS GSLB / L4 스위치 또는 `[사업명]` 제목별로 분리합니다.
- TB는 1,000GB 기준으로 변환합니다. 한국어 만/억, K/M, MEM, CPU/Memory 복합 표기를 처리합니다.
- HTTP/WAF, L4/L7, SSL 처리량 및 L4 HTTP RPS, L7 RPS, DNS Query QPS/RPS, ECDSA TPS를 구분합니다.
- 같은 줄의 여러 포트 조건을 읽고, 같은 물리 포트를 여러 속도에 중복 할당하지 않습니다. 브레이크아웃은 자동 가정하지 않습니다.
- 전원/FAN, HA, Hot-Swap, QoS, 접근 로그, 무결성 확인서, 연동시험 등은 근거가 없으면 `확인 필요`로 유지합니다.
- 로그서버는 rSeries 후보 추천에서 제외하고 별도 체크리스트로 표시합니다.
- 제품사양/검토결과 줄을 요구규격으로 해석하지 않습니다. 장비 제목·항목·요구규격·제품사양은 별도 줄로 입력하세요.
- 인식하지 못한 문장도 원문 검토 항목으로 표시하며 전체 충족 판정을 막습니다. 한 입력에 여러 사업을 넣으면 `[사업명]` 제목으로 나누세요.
- 미충족과 자료 부족을 구분하고 비교표에서 원문과 근거를 펼쳐 볼 수 있습니다.

새로 확인한 r2600의 L4 HTTP RPS / ECDSA / SSL 처리량 / 물리 코어 수는 [F5 공식 rSeries 데이터시트](https://www.f5.com/content/dam/f5/corp/global/pdf/data-sheet/f5-application-delivery-controller-system-rseries-data-sheet.pdf)를, DNS 수치는 [BIG-IP DNS 데이터시트 p.18](https://cdn.studio.f5.com/files/k6fem79d/production/e34b659aa50f6d9f5006a487b2865f708128dab2.pdf)을 기준으로 합니다.

DNS 수치는 DNS Express 활성화 시 권한 DNS 최대 응답 성능이므로 GSLB QPS와 자동 동등 판정하지 않습니다. r2600 물리 8코어와 테넌트 4 CPU도 구분해야 합니다. 다른 모델의 미등록 항목은 추정하지 않습니다. 기존 비교표 수치는 원본 문서 개정·페이지 및 라이선스 검증 전 참고용입니다.

테스트: `python -m unittest -v` (외부 API 없이 파서·판정·Flask 요청 검증)

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

