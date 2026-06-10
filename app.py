import csv
import io
import json
import os
import re
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile

from flask import Flask, Response, flash, render_template, request, send_file
from openpyxl import load_workbook
from pypdf import PdfReader


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
REFERENCE_PATH = DATA_DIR / "reference_data.json"
PRICEBOOK_PATH = DATA_DIR / "pricebook.csv"

DEFAULT_MARGIN_RATE = float(os.getenv("DEFAULT_MARGIN_RATE", "0.18"))
DEFAULT_DISCOUNT_RATE = float(os.getenv("DEFAULT_DISCOUNT_RATE", "0.00"))

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-on-render")


def money(value):
    return f"{round(value):,}"


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def load_reference():
    if not REFERENCE_PATH.exists():
        return {"f5_models": [], "comparisons": [], "sources": [], "pdf_summary": {}}
    return json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))


def load_pricebook():
    prices = {}
    if not PRICEBOOK_PATH.exists():
        return prices

    with PRICEBOOK_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            model = clean_text(row.get("model") or row.get("sku")).lower()
            if not model:
                continue
            try:
                list_price = float(str(row.get("list_price", "0")).replace(",", ""))
            except ValueError:
                list_price = 0
            prices[model] = {
                "sku": clean_text(row.get("sku")),
                "model": clean_text(row.get("model")),
                "description": clean_text(row.get("description")),
                "list_price": list_price,
                "currency": clean_text(row.get("currency")) or "KRW",
            }
    return prices


def text_from_upload(uploaded_file):
    filename = uploaded_file.filename or "uploaded"
    suffix = Path(filename).suffix.lower()

    if suffix in {".txt", ".csv"}:
        raw = uploaded_file.read()
        return raw.decode("utf-8-sig", errors="ignore")

    with NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        uploaded_file.save(temp.name)
        temp_path = Path(temp.name)

    try:
        if suffix == ".pdf":
            reader = PdfReader(str(temp_path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)

        if suffix in {".xlsx", ".xlsm"}:
            workbook = load_workbook(str(temp_path), data_only=True)
            chunks = []
            for sheet in workbook.worksheets:
                chunks.append(f"Sheet: {sheet.title}")
                for row in sheet.iter_rows(values_only=True):
                    values = [clean_text(cell) for cell in row if clean_text(cell)]
                    if values:
                        chunks.append(" | ".join(values))
            return "\n".join(chunks)

        return uploaded_file.read().decode("utf-8-sig", errors="ignore")
    finally:
        try:
            temp_path.unlink()
        except OSError:
            pass


def find_requested_models(text, reference):
    text_lower = text.lower()
    matches = {}

    for item in reference.get("f5_models", []):
        model = item["model"]
        tokens = {model.lower(), model.lower().replace("f5 ", "")}
        tokens.update(re.findall(r"r\d{4,5}(?:-ds)?", model.lower()))
        if any(token and token in text_lower for token in tokens):
            matches[model] = {
                "model": model,
                "quantity": estimate_quantity(text_lower, tokens),
                "series": item.get("series", ""),
                "specs": item.get("specs", {}),
            }

    generic_hits = re.findall(r"\br\d{4,5}(?:-ds)?\b", text_lower)
    known = {item["model"].lower(): item for item in reference.get("f5_models", [])}
    for hit in generic_hits:
        if not any(hit in key for key in known):
            continue
        for key, item in known.items():
            if hit in key and item["model"] not in matches:
                matches[item["model"]] = {
                    "model": item["model"],
                    "quantity": estimate_quantity(text_lower, {hit}),
                    "series": item.get("series", ""),
                    "specs": item.get("specs", {}),
                }

    return list(matches.values())


def estimate_quantity(text, tokens):
    for token in tokens:
        if not token:
            continue
        patterns = [
            rf"{re.escape(token)}\D{{0,12}}(\d{{1,3}})\s*(?:ea|대|개|식)",
            rf"(\d{{1,3}})\s*(?:ea|대|개|식)\D{{0,12}}{re.escape(token)}",
        ]
        for pattern in patterns:
            found = re.search(pattern, text, re.IGNORECASE)
            if found:
                return max(int(found.group(1)), 1)
    return 1


def build_quote(matches, pricebook, margin_rate, discount_rate):
    rows = []
    total = 0
    for match in matches:
        model_key = match["model"].lower()
        price = pricebook.get(model_key, {})
        list_price = float(price.get("list_price") or 0)
        qty = int(match.get("quantity") or 1)
        sell_unit = list_price * (1 - discount_rate) * (1 + margin_rate)
        line_total = sell_unit * qty
        total += line_total
        rows.append(
            {
                "model": match["model"],
                "sku": price.get("sku") or match["model"],
                "description": price.get("description") or "F5 rSeries appliance",
                "quantity": qty,
                "currency": price.get("currency") or "KRW",
                "list_price": list_price,
                "sell_unit": sell_unit,
                "line_total": line_total,
                "series": match.get("series", ""),
                "specs": match.get("specs", {}),
                "priced": list_price > 0,
            }
        )
    return rows, total


def comparison_for_model(model, reference):
    for comparison in reference.get("comparisons", []):
        if comparison.get("f5_model") == model:
            return comparison
    return None


@app.route("/", methods=["GET", "POST"])
def index():
    reference = load_reference()
    pricebook = load_pricebook()
    context = {
        "models": reference.get("f5_models", []),
        "sources": reference.get("sources", []),
        "pdf_summary": reference.get("pdf_summary", {}),
        "default_margin": int(DEFAULT_MARGIN_RATE * 100),
        "default_discount": int(DEFAULT_DISCOUNT_RATE * 100),
        "pricebook_count": len(pricebook),
    }

    if request.method == "POST":
        upload = request.files.get("rfq_file")
        if not upload or not upload.filename:
            flash("RFQ 파일을 선택해주세요.")
            return render_template("index.html", **context)

        margin_rate = float(request.form.get("margin_rate", DEFAULT_MARGIN_RATE * 100)) / 100
        discount_rate = float(request.form.get("discount_rate", DEFAULT_DISCOUNT_RATE * 100)) / 100
        rfq_text = text_from_upload(upload)
        matches = find_requested_models(rfq_text, reference)

        if not matches:
            flash("업로드한 파일에서 rSeries 모델명을 찾지 못했습니다. 예: r2600, r4600, r5600")
            return render_template("index.html", rfq_text=rfq_text[:1600], **context)

        quote_rows, total = build_quote(matches, pricebook, margin_rate, discount_rate)
        comparisons = {
            row["model"]: comparison_for_model(row["model"], reference)
            for row in quote_rows
        }
        return render_template(
            "index.html",
            quote_rows=quote_rows,
            total=total,
            margin_rate=int(margin_rate * 100),
            discount_rate=int(discount_rate * 100),
            comparisons=comparisons,
            generated_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
            **context,
        )

    return render_template("index.html", **context)


@app.route("/download.csv", methods=["POST"])
def download_csv():
    rows = json.loads(request.form["rows"])
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["model", "sku", "description", "quantity", "currency", "unit_price", "line_total"])
    for row in rows:
        writer.writerow(
            [
                row["model"],
                row["sku"],
                row["description"],
                row["quantity"],
                row["currency"],
                round(float(row["sell_unit"])),
                round(float(row["line_total"])),
            ]
        )
    return Response(
        output.getvalue().encode("utf-8-sig"),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=f5_custom_quote.csv"},
    )


@app.route("/pricebook-template")
def pricebook_template():
    return send_file(DATA_DIR / "pricebook_template.csv", as_attachment=True)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG") == "1",
    )
