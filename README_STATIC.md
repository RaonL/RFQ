# F5 RFQ Static Edition

기존 `RaonL/RFQ` 저장소에 **추가해서 사용하는 정적 실행 경로**입니다. 서버/유료 AI API 없이 브라우저에서 RFQ 추출 초안을 만들고 등록 장비와 비교합니다.

## 적용 범위

- 기존 `app.py`, `rfq_parser.py`, `matching.py`, `templates/`는 롤백 참고용으로 보존합니다. **그 Python 로직이 수정된 것은 아닙니다.** Static Site는 `site/*.mjs`만 사용합니다.
- 기존 `data/reference_data.json`을 그대로 읽습니다. 사양 전체를 새 공식 문서와 재검증한 데이터 교체 작업이 아닙니다.
- 기존 Web Service의 `render.yaml`을 덮어쓰지 않습니다. 새 Static Site 예시는 `render-static.yaml`입니다.
- 정적 버전은 `main`에 반영되어 있습니다. Render 배포는 사용자가 별도로 수행합니다.

## 1. 기존 저장소에 파일 추가

ZIP의 **내용물**을 기존 RFQ 저장소 루트에 추가하세요. ZIP 자체를 웹사이트 루트로 배포하는 것이 아닙니다. 특히 기존 `data/reference_data.json`과 `static/platforms/`는 유지하세요.

패치로 적용할 때는 ZIP 방식과 중복 적용하지 마세요.

```bash
git switch -c fix/static-rfq-validation
git apply --check /path/to/RFQ_static_update.patch
git apply /path/to/RFQ_static_update.patch
```

Node.js 22 이상에서:

```bash
npm test
npm run build
# 생성 결과: dist/
python -m http.server 8080 --directory dist
```

`dist/index.html`을 파일 탐색기에서 바로 여는 `file://` 방식이 아니라 HTTP 서버로 확인하세요.

## 2. Render 수동 배포

기존 Web Service를 유지한 채 **New → Static Site**를 만들고 검증한 뒤 전환하는 방식을 권장합니다.

| 설정 | 값 |
|---|---|
| Repository | RaonL/RFQ |
| Branch | `main` |
| Root Directory | 비워 두기(저장소 루트) |
| Build Command | `node scripts/build.mjs` |
| Publish Directory | `dist` |
| Start Command | 없음 |
| API 키 | 필요 없음 |

`npm ci`/외부 패키지 설치가 필요 없는 빌드입니다. `package.json`에는 런타임 의존성이 없습니다. Python 서버를 시작하지 않습니다.

선택적으로 Blueprint를 사용할 때만 `render-static.yaml`을 지정하세요. 기존 `render.yaml`은 Python Web Service용입니다. 새 사이트의 URL은 별도로 확인하고, 기존 Web Service는 검증 전 삭제하지 마세요.

## 3. 사용 흐름

1. 요구사항을 붙여넣거나 TXT/CSV/XLSX/XLSM/PDF를 선택합니다.
2. **요구 수치 추출**을 눌러 수치·단위·비교 조건을 원문과 대조합니다. 고객사·설치장소·인사말은 비교 항목에서 제외합니다.
3. 잘못된 값은 추출 표에서 수정합니다. 기능·참고 문구는 접힌 **기능·문구 별도 검토**에 보존되며 수치 집계에 넣지 않습니다. 필요한 항목은 수치 항목으로 지정할 수 있습니다. 값이 빠졌거나 수치 해석에 실패한 요구조건은 수치 확인 대상으로 유지합니다.
4. 원문 옆에서 항목·비교 조건·수치를 바로 수정하고 **등록 장비와 비교**를 누릅니다. SSL 시험 기준 또는 처리량 계층에 따라 후보가 달라질 때만 질문이 표시됩니다. **모름**을 선택하면 해당 항목을 별도 검토로 남기고 나머지 조건을 비교합니다.
5. 우선 후보와 충족·미충족·수치 확인 개수를 먼저 확인합니다. 기능·전체 모델·경쟁 모델·검토 문구는 펼쳐서 확인하고, 필요하면 JSON으로 저장합니다.

입력·추출값·모델 제외 정책이 바뀌면 이전 결과는 무효화합니다. 로그서버 그룹은 ADC 추천에서 제외합니다. 기존 r12900-DS 제외 정책은 유지하되 사용자가 명시적으로 포함할 수 있습니다.

## 4. 수정한 판정 문제

- 한 줄의 L4/L7 등 복수 요구사항을 모두 탐색합니다.
- RSA 2048/2K/4096 같은 키 길이를 TPS로 읽지 않습니다.
- RSA 4096을 RSA 2048 성능과 동등하게 취급하지 않습니다.
- MB/GB/TB, MiB/GiB/TiB, K/M/만/억을 지표 단위에 맞춰 변환합니다.
- `이상 / 이하 / 초과 / 미만 / =`를 보존합니다. 복합 L4/L7의 공통 비교 조건도 적용합니다.
- CPU 주파수와 코어 수를 별도로 추출합니다.
- 값 없는 성능 항목과 모호한 수치·단위는 `수치 확인`으로 남깁니다. 정성 문구는 별도 검토로 보존합니다.
- `L4 CPS 170,000 cps`의 단위 `cps`는 별도 요구항목으로 중복 생성하지 않습니다.
- GSLB 요구 RPS는 사용자 제공 표의 DNS Express 최대 Query RPS와 비교합니다. 충족 장비 목록과 보고서에 비교 기준을 표시합니다. 실제 GSLB 부하분산 성능에는 별도 시험이 필요합니다.
- DNS·ECDSA 시험 기준이 미지정인 경우 수치는 우선 비교하며 `시험조건 별도 확인`을 표시합니다. ECDSA P-384, RSA 4096 등 명시적으로 다른 알고리즘에는 해당하는 등록값이 필요합니다.
- 같은 물리 포트가 여러 속도 조건에 중복 배정되지 않도록 용량 할당을 검사합니다.
- 누락된 사양을 0으로 바꾸지 않습니다.
- 동점일 때 낮은 tier를 우선합니다. tier는 가격이 아닙니다.
- 장비 설명과 비교는 동일한 등록 자료를 사용합니다.

## 5. API 없이 정확한가?

**수치 비교 자체에는 AI API가 필요하지 않습니다.** 요구 수치·단위·비교 조건과 장비 기준값이 정확하면 결정적인 비교 로직으로 처리할 수 있습니다.

다만 자유로운 문장/표/PDF 추출, 최신 공식 사양 확보, 라이선스·지원 조합 확인은 별개입니다. AI API를 붙여도 원문 누락이나 잘못된 기준 데이터를 자동으로 해결하지 못합니다. 이 버전은 다음을 분리합니다.

- `수치상 충족`: 저장된 수치와 추출된 조건의 비교 결과.
- `수치 확인`: 미등록 수치, 모호한 수치·단위, 명시적으로 다른 시험 기준.
- `별도 검토`: 기능 지원·정성 문구·복수 포트 속도 호환성. 수치 후보 선정에서 제외되지만 최종 검토에 필요합니다.
- `시험조건 별도 확인`: 기준이 미지정된 DNS·ECDSA의 잠정 수치 비교. 공식 검증 완료로 표시하지 않습니다.
- `수치상 후보`: 모든 추출 수치가 맞아도 **최종 제안 승인 아님**.
- 공식 검증: `metric_evidence`의 실제 검증 기록이 필요하며 이번 이관에서는 자동으로 생성하지 않습니다.

데이터의 `metrics`에 구조화된 숫자를 등록할 수 있고, `metric_evidence`에는 `verified`, `url`, `checked_at`, `conditions`를 관리할 수 있습니다. 검증하지 않은 항목에 `verified: true`를 넣지 마세요. 특히 DNS Express/GSLB, 물리 코어/테넌트 vCPU, RSA 알고리즘은 서로 다른 시험 조건입니다.

## 6. 파일 처리와 개인정보

- 텍스트/CSV는 내장 코드로 처리합니다. 파일을 서버로 전송하는 POST 엔드포인트는 없습니다.
- XLSX/XLSM: SheetJS CE 0.20.3을 첫 사용 시 공식 CDN에서 불러옵니다. 매크로를 실행하지 않으며 수식은 저장된 계산값만 읽습니다.
- PDF: PDF.js 6.2.108을 첫 사용 시 jsDelivr에서 불러옵니다. 스캔 PDF OCR은 수행하지 않습니다.
- 외부 AI API와 API 키는 사용하지 않습니다. **외부 통신이 전혀 없는 앱은 아닙니다:** 파일 라이브러리와 PDF CMap/폰트 같은 정적 자원을 다운로드할 수 있습니다.
- CDN이 차단되면 PDF/Excel 추출은 명시적으로 실패하고 TXT/CSV 입력을 안내합니다. 보안상 CDN 실행이 허용되지 않는 환경은 라이브러리를 검증·벤더링하여 자체 호스팅해야 합니다.
- PDF 표·다단 문서는 의미상 열 구분이 보장되지 않습니다. 추출 화면에서 요구규격과 제품사양을 반드시 확인하세요.
- 한 파일 16MiB, 입력 250,000자, PDF 100페이지, 표 5,000행/100,000셀 제한이 있습니다. 악성 문서를 안전하게 실행하는 샌드박스가 아니므로 신뢰할 수 없는 파일은 열지 마세요.
- 브라우저 배포 데이터는 방문자에게 공개됩니다. 내부 단가·고객 설정·인증정보를 기준 JSON에 넣지 마세요.

## 7. 검증

2026-11-11 수치 우선 비교 수정: Node 테스트 77개와 실제 HTTP/CSP/ESM을 사용하는 Chrome 검증 14개 통과. 재현 입력은 수치 13개로 비교되며 r2600의 등록값 기준 13개 충족·0개 미충족으로 표시됩니다. 상세 범위는 `VALIDATION_STATIC.md`를 확인하세요.

```bash
npm test
node scripts/build.mjs --fixture  # 시험용 결과는 dist-fixture에만 생성
```

시험용 데이터는 `tests/fixtures/reference.json`입니다. 제품 사양을 검증한 자료가 아닙니다. 실제 `dist` 빌드는 이 데이터를 거부합니다.

선택적 오프라인 DOM/UI 테스트:

```bash
pip install playwright
python -m playwright install chromium
node scripts/build.mjs --fixture
python tests/browser_smoke.py
```

이 테스트는 네트워크 없는 DOM 테스트를 위해 모듈을 독립 함수로 감싸고 catalogue fetch만 fixture로 대체합니다. **CSP/ESM 네트워크 로딩/CDN/실제 Render E2E 테스트가 아닙니다.** 상세 범위는 `VALIDATION_STATIC.md`를 확인하세요.

## 공식 참고

- Render Static Sites: https://render.com/docs/static-sites
- Render Blueprint: https://render.com/docs/blueprint-spec
- SheetJS standalone: https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- PDF.js: https://mozilla.github.io/pdf.js/getting_started/
