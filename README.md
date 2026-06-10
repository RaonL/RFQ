# F5 RFQ 맞춤견적 웹

F5 rSeries RFQ 파일을 업로드하면 기준 모델을 자동 인식하고, 보유한 가격표와 비교 자료를 기준으로 맞춤 견적 CSV를 생성하는 Flask 앱입니다.

## 현재 기능

- PDF, XLSX, CSV, TXT RFQ 업로드
- `r2600`, `r4600`, `r5600`, `r10600`, `r12600-DS` 모델 자동 인식
- 수량 표현 자동 추정: 예) `r4600 2대`, `2EA r5600`
- 마진율과 할인율 반영
- F5 rSeries 경쟁사 비교표 표시
- 견적 결과 CSV 다운로드

## 기준 데이터

- `data/reference_data.json`: 제공된 F5 데이터시트와 경쟁사 비교 엑셀에서 추출한 기준 자료
- `data/pricebook.csv`: 실제 가격표
- `data/pricebook_template.csv`: 가격표 입력 양식

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

1. GitHub 저장소 `RaonL/RFQ`에 이 코드를 push합니다.
2. Render에서 New Web Service를 만들고 해당 저장소를 연결합니다.
3. `render.yaml` 설정을 사용하면 빌드와 실행 명령이 자동 적용됩니다.

## 가격표 업데이트

`data/pricebook.csv`의 `list_price`를 실제 공급 기준으로 채우면 견적 단가가 계산됩니다.

```csv
sku,model,description,list_price,currency
F5-R4600,F5 r4600,F5 rSeries r4600 appliance,120000000,KRW
```
