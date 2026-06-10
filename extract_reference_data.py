import json
import os
import re
from pathlib import Path

import openpyxl
from pypdf import PdfReader


BASE_DIR = Path(__file__).resolve().parent
PDF_PATH = Path(
    os.getenv("F5_DATA_SHEET_PATH", BASE_DIR / "source" / "F5_rSeries_Appliance_Data_Sheet.pdf")
)
XLSX_PATH = Path(
    os.getenv("F5_COMPARISON_XLSX_PATH", BASE_DIR / "source" / "r-Series_경쟁사_비교자료(20260504).xlsx")
)


def clean(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def extract_comparison():
    workbook = openpyxl.load_workbook(str(XLSX_PATH), data_only=True)
    comparisons = []
    f5_models = {}

    for sheet in workbook.worksheets:
        raw_rows = list(sheet.iter_rows(values_only=True))
        header_positions = []
        for index, row in enumerate(raw_rows, start=1):
            values = [clean(cell) for cell in row]
            if values and values[0] == "비교 항목":
                header_positions.append(index)

        for pos_index, header_row_index in enumerate(header_positions):
            headers = [clean(cell) for cell in raw_rows[header_row_index - 1]]
            if len(headers) < 2 or not headers[1]:
                continue

            next_header = (
                header_positions[pos_index + 1]
                if pos_index + 1 < len(header_positions)
                else len(raw_rows) + 1
            )
            model_name = headers[1]
            rows = []

            for row in raw_rows[header_row_index: next_header - 1]:
                values = [clean(cell) for cell in row[: len(headers)]]
                if not values or not values[0]:
                    continue
                metric = values[0]
                if metric.startswith("※") or metric.startswith("*"):
                    continue
                if metric.startswith("F5 ") and "상세 비교" in metric:
                    continue
                rows.append(
                    {
                        "metric": metric,
                        "values": {
                            headers[col_index]: values[col_index]
                            for col_index in range(1, min(len(headers), len(values)))
                            if headers[col_index]
                        },
                    }
                )

            comparisons.append(
                {
                    "series": sheet.title,
                    "f5_model": model_name,
                    "competitors": [header for header in headers[2:] if header],
                    "rows": rows,
                }
            )

            f5_specs = {row["metric"]: row["values"].get(model_name, "") for row in rows}
            f5_models[model_name.lower()] = {
                "series": sheet.title,
                "model": model_name,
                "specs": f5_specs,
            }

    return comparisons, list(f5_models.values())


def extract_pdf_summary():
    reader = PdfReader(str(PDF_PATH))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    model_hits = sorted(set(re.findall(r"\br\d{4,5}(?:-DS)?\b", text, re.IGNORECASE)))

    sections = []
    for marker in [
        "KEY BENEFITS",
        "STANDARDIZE YOUR APP DELIVERY SERVICES",
        "GAIN FLEXIBILITY WITH MULTI-TENANCY",
        "A MODERN PLATFORM ARCHITECTURE DESIGN",
        "PURPOSE-BUILT FOR AUTOMATION",
        "FIPS COMPLIANCE AT SCALE",
        "MIGRATING TO F5 RSERIES",
    ]:
        idx = text.upper().find(marker)
        if idx >= 0:
            snippet = clean(text[idx : idx + 900])
            sections.append({"title": marker.title(), "summary": snippet})

    return {
        "source_file": PDF_PATH.name,
        "pages": len(reader.pages),
        "models_found": model_hits,
        "sections": sections[:7],
    }


def main():
    comparisons, f5_models = extract_comparison()
    reference = {
        "sources": [
            {
                "type": "pdf",
                "name": PDF_PATH.name,
                "path_note": "Original source kept outside repository.",
            },
            {
                "type": "xlsx",
                "name": "r-Series competitor comparison 20260504.xlsx",
                "path_note": "Original source kept outside repository.",
            },
        ],
        "pdf_summary": extract_pdf_summary(),
        "f5_models": f5_models,
        "comparisons": comparisons,
    }

    output = BASE_DIR / "data" / "reference_data.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(reference, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
