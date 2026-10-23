import json
import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from flask import Flask, flash, render_template, request
from openpyxl import load_workbook
from pypdf import PdfReader
from rfq_parser import parse_requirements, parse_groups
from matching import evaluate_model, extra_specs


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
REFERENCE_PATH = DATA_DIR / "reference_data.json"

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-on-render")
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024


MODEL_TIER_ORDER = [
    "F5 r2600",
    "F5 r2800",
    "F5 r4600",
    "F5 r4800",
    "F5 r5600",
    "F5 r5800",
    "F5 r5900",
    "F5 r10600",
    "F5 r10800",
    "F5 r10900",
    "F5 r12600-DS",
    "F5 r12800-DS",
]
MODEL_TIERS = {model.lower(): index + 1 for index, model in enumerate(MODEL_TIER_ORDER)}
EXCLUDED_MODELS = {"f5 r12900-ds"}

PLATFORM_GALLERY = [
    {
        "platform_family": "r2000 Series",
        "platform_image_url": "/static/platforms/r2000-front-view.png",
        "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r2000r4000-series/title--platform-overview.html#f5-r2000r4000-series-models",
        "models": "R2600 / R2800",
        "interfaces": "4x 25G/10G/1G SFP28/SFP+/SFP, 4x 10G/1G Copper",
    },
    {
        "platform_family": "r4000 Series",
        "platform_image_url": "/static/platforms/r4000-front-view.png",
        "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r2000r4000-series/title--platform-overview.html#f5-r2000r4000-series-models",
        "models": "R4600 / R4800",
        "interfaces": "4x 25G/10G/1G SFP28/SFP+/SFP, 4x 10G/1G Copper",
    },
    {
        "platform_family": "r5000 Series",
        "platform_image_url": "/static/platforms/r5000-front-view.png",
        "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r5000r10000-series/title--platform-overview.html#f5-r5000r10000r12000-series-models",
        "models": "R5600 / R5800 / R5900",
        "interfaces": "2x 100G/40G QSFP28/QSFP+, 8x 25G/10G SFP28/SFP+",
    },
    {
        "platform_family": "r10000 Series",
        "platform_image_url": "/static/platforms/r10000-front-view.png",
        "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r5000r10000-series/title--platform-overview.html#f5-r5000r10000r12000-series-models",
        "models": "R10600 / R10800 / R10900",
        "interfaces": "4x 100G/40G QSFP28/QSFP+, 16x 25G/10G SFP28/SFP+",
    },
]

QUALITATIVE_FEATURES = {
    "redundant_power": {
        "label": "전원 이중화",
        "keywords": ["전원", "power", "psu", "dual power", "redundant power"],
    },
    "redundant_fan": {
        "label": "FAN 이중화/Hot-Swap",
        "keywords": ["fan", "팬", "hot-swap", "hotswap", "hot swap"],
    },
}


@app.after_request
def add_no_store_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def load_reference():
    if not REFERENCE_PATH.exists():
        return {"f5_models": [], "comparisons": [], "sources": [], "pdf_summary": {}}
    reference = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
    reference["f5_models"] = [
        model
        for model in reference.get("f5_models", [])
        if str(model.get("model", "")).lower() not in EXCLUDED_MODELS
    ]
    reference["comparisons"] = [
        comparison
        for comparison in reference.get("comparisons", [])
        if str(comparison.get("f5_model", "")).lower() not in EXCLUDED_MODELS
    ]
    for comparison in reference["comparisons"]:
        for metric in comparison.get("metrics", []):
            metric["values"] = {
                product: value
                for product, value in metric.get("values", {}).items()
                if str(product).lower() not in EXCLUDED_MODELS
            }
    return reference


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

        raw = uploaded_file.read()
        return raw.decode("utf-8-sig", errors="ignore")
    finally:
        try:
            temp_path.unlink()
        except OSError:
            pass


def number_with_unit(value):
    if value is None:
        return 0.0
    text = str(value).replace(",", "").strip().lower()
    found = re.search(r"(\d+(?:\.\d+)?)\s*(gb|g|k|m)?\b", text)
    if not found:
        return 0.0
    number = float(found.group(1))
    unit = found.group(2) or ""
    if unit == "k":
        return number * 1_000
    if unit == "m":
        return number * 1_000_000
    return number


def parse_requested_number(text):
    normalized = str(text or "").replace(",", "").strip().lower()
    found = re.search(r"(\d+(?:\.\d+)?)\s*(억|만|gbps|ge|gb|g|tps|cps|rps|k|m)?", normalized)
    if not found:
        return None
    number = float(found.group(1))
    unit = found.group(2) or ""
    if unit == "억":
        return number * 100_000_000
    if unit == "만":
        return number * 10_000
    if unit == "k":
        return number * 1_000
    if unit == "m":
        return number * 1_000_000
    return number


def parse_throughput_pair(value):
    text = str(value or "")
    numbers = [float(item) for item in re.findall(r"(\d+(?:\.\d+)?)\s*G", text, re.IGNORECASE)]
    if len(numbers) >= 2:
        return numbers[0], numbers[1]
    if len(numbers) == 1:
        return numbers[0], numbers[0]
    return 0.0, 0.0


def parse_ports(interface_text):
    text = str(interface_text or "").lower()
    ports = {
        "sfp_1g_ports": 0,
        "sfp_plus_10g_ports": 0,
        "sfp28_25g_ports": 0,
        "copper_1g_ports": 0,
        "copper_10g_ports": 0,
        "qsfp_40g_ports": 0,
        "qsfp28_100g_ports": 0,
    }

    for count, desc in re.findall(r"(\d+)\s*x\s*([^,]+)", text):
        qty = int(count)
        is_base_t_1g = "base-t" in desc and not re.search(r"\b10\s*g", desc)
        is_copper = any(token in desc for token in ["copper", "utp", "rj45", "base-t", "baset"])
        is_sfp28 = "sfp28" in desc
        is_sfp_plus = "sfp+" in desc or ("sfp" in desc and not is_sfp28)
        is_qsfp = "qsfp" in desc

        if is_copper:
            if is_base_t_1g:
                ports["copper_1g_ports"] += qty
                continue
            if "1g" in desc:
                ports["copper_1g_ports"] += qty
            if "10g" in desc:
                ports["copper_10g_ports"] += qty
            continue

        if is_sfp28 and "25g" in desc:
            ports["sfp28_25g_ports"] += qty
        if is_sfp28 and "10g" in desc:
            ports["sfp_plus_10g_ports"] += qty
        if is_sfp_plus and not is_sfp28 and "10g" in desc:
            ports["sfp_plus_10g_ports"] += qty
        if is_sfp_plus and "1g" in desc:
            ports["sfp_1g_ports"] += qty
        if is_qsfp and "40g" in desc:
            ports["qsfp_40g_ports"] += qty
        if is_qsfp and "100g" in desc:
            ports["qsfp28_100g_ports"] += qty

    return ports


def normalize_slash_speed_text(text):
    return re.sub(r"(\d+)\s+g\b", r"\1g", str(text or "").lower())


def display_model_name(model_name):
    name = str(model_name or "").replace("F5 ", "F5 BIG-IP ")
    return re.sub(r"\br(\d)", r"R\1", name)


def tier_for_model(model_name):
    return MODEL_TIERS.get(str(model_name or "").lower(), 999)


def platform_visual(model_name):
    name = str(model_name or "").lower()
    base = "https://techdocs.f5.com"
    if any(token in name for token in ["r2600", "r2800"]):
        return {
            "platform_family": "r2000 Series",
            "platform_image_url": "/static/platforms/r2000-front-view.png",
            "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r2000r4000-series/title--platform-overview.html#f5-r2000r4000-series-models",
        }
    if any(token in name for token in ["r4600", "r4800"]):
        return {
            "platform_family": "r4000 Series",
            "platform_image_url": "/static/platforms/r4000-front-view.png",
            "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r2000r4000-series/title--platform-overview.html#f5-r2000r4000-series-models",
        }
    if any(token in name for token in ["r5600", "r5800", "r5900"]):
        return {
            "platform_family": "r5000 Series",
            "platform_image_url": "/static/platforms/r5000-front-view.png",
            "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r5000r10000-series/title--platform-overview.html#f5-r5000r10000r12000-series-models",
        }
    if any(token in name for token in ["r10600", "r10800", "r10900"]):
        return {
            "platform_family": "r10000 Series",
            "platform_image_url": "/static/platforms/r10000-front-view.png",
            "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r5000r10000-series/title--platform-overview.html#f5-r5000r10000r12000-series-models",
        }
    if any(token in name for token in ["r12600", "r12800"]):
        return {
            "platform_family": "r12000 Series",
            "platform_image_url": f"{base}/bigip/r12000-front-num.png",
            "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/platform-guide-r5000r10000-series/title--platform-overview.html#f5-r5000r10000r12000-series-models",
        }
    return {
        "platform_family": "rSeries",
        "platform_image_url": "",
        "platform_guide_url": "https://techdocs.f5.com/en-us/hardware/",
    }


def normalize_model(model):
    specs = model.get("specs", {})
    l4, l7 = parse_throughput_pair(specs.get("L4/L7 Throughput"))
    model_name = model.get("model", "")
    ports = parse_ports(specs.get("인터페이스"))
    tier = int(model.get("tier") or tier_for_model(model_name))
    visual = platform_visual(model_name)

    return {
        "model": model_name,
        "display_model": display_model_name(model_name),
        "tier": tier,
        "series": model.get("series", ""),
        **visual,
        "raw_specs": specs,
        "l4_gbps": l4,
        "l7_gbps": l7,
        "l4_cps": number_with_unit(specs.get("L4 CPS")),
        "l7_rps": number_with_unit(specs.get("L7 RPS (HTTP)")),
        "arp_table": None,
        "ssl_tps": number_with_unit(
            specs.get("SSL TPS (RSA 2K)") or specs.get("SSL TPS RSA 2K")
        ),
        "concurrent_connections": number_with_unit(specs.get("동시 커넥션")),
        "ssd_gb": number_with_unit(specs["Storage"]) if specs.get("Storage") else None,
        "memory_gb": number_with_unit(specs["Memory"]) if specs.get("Memory") else None,
        **ports,
        "redundant_power": None,
        "redundant_fan": None,
        **extra_specs(model_name, specs),
    }


def comparison_for_model(model_name, reference):
    for comparison in reference.get("comparisons", []):
        if comparison.get("f5_model") == model_name:
            return comparison
    return None


def metric_value(comparison, metric_name, product_name):
    if not comparison:
        return "-"
    for row in comparison.get("rows", []):
        if row.get("metric") == metric_name:
            return row.get("values", {}).get(product_name, "-") or "-"
    return "-"


def competitor_summary(model_name, reference):
    comparison = comparison_for_model(model_name, reference)
    if not comparison:
        return []

    products = [comparison.get("f5_model", "")] + comparison.get("competitors", [])
    return [
        {
            "product": product,
            "l4_l7": metric_value(comparison, "L4/L7 Throughput", product),
            "l4_cps": metric_value(comparison, "L4 CPS", product),
            "ssl_tps": metric_value(comparison, "SSL TPS (RSA 2K)", product)
            if metric_value(comparison, "SSL TPS (RSA 2K)", product) != "-"
            else metric_value(comparison, "SSL TPS RSA 2K", product),
            "connections": metric_value(comparison, "동시 커넥션", product),
        }
        for product in products
        if product
    ]


def recommend_model(requirements, reference):
    models = [normalize_model(model) for model in reference.get("f5_models", [])]
    evaluations = [evaluate_model(model, requirements) for model in models]
    for evaluation in evaluations:
        evaluation["competitors"] = competitor_summary(evaluation["model"]["model"], reference)

    matched = [evaluation for evaluation in evaluations if evaluation["all_passed"]]
    matched.sort(key=lambda item: item["model"]["tier"])
    alternatives = sorted(
        evaluations,
        key=lambda item: (
            item["shortfall_score"],
            item["failed_count"],
            -item["fit_score"],
            -item["model"]["tier"],
        ),
    )[:3]
    return (matched[0] if matched else None), alternatives, evaluations


def summarize_passed(evaluation, limit=5):
    if not evaluation:
        return []
    return [check["label"] for check in evaluation["checks"] if check["passed"]][:limit]


def mail_texts(recommendation, alternatives):
    primary = recommendation or (alternatives[0] if alternatives else None)
    model = primary["model"]["display_model"] if primary else "확인 필요"
    passed = summarize_passed(primary)
    passed_text = ", ".join(passed) if passed else "충족 항목 없음"
    alternative_names = [item["model"]["display_model"] for item in alternatives if item is not primary][:2]
    alternative_text = ", ".join(alternative_names) if alternative_names else "대안 모델 없음"

    if recommendation:
        simple = (
            f"문의 주신 스펙 기준으로는 {model} 모델이 적합합니다.\n"
            f"주요 충족 조건은 {passed_text}이며, 대안 모델은 {alternative_text}입니다."
        )
        detail = (
            f"고객 요구 스펙을 등록된 F5 rSeries 기준 데이터와 비교한 결과, {model} 모델이 등록 데이터에서 추출한 조건을 충족합니다. 원문·라이선스·구성 검토가 필요합니다.\n"
            f"주요 충족 조건: {passed_text}\n"
            f"대안 검토 모델: {alternative_text}\n"
            "최종 제안 전 공식 문서와 실제 적용 구성을 확인해주세요."
        )
        internal = (
            f"[내부 검토]\n추천 모델: {model}\n적합도: {primary['fit_score']}%\n"
            f"주요 충족 조건: {passed_text}\n대안 모델: {alternative_text}\n"
            "검토 의견: 필수 조건을 모두 충족하는 최저 tier 모델입니다."
        )
    else:
        failed = [check["label"] for check in primary["failed_checks"]] if primary else []
        failed_text = ", ".join(failed) if failed else "확인 필요"
        simple = (
            "등록 자료에서 전체 조건 충족을 확인한 모델이 없습니다.\n"
            f"가장 근접한 모델은 {model}이며, 미충족 또는 확인 필요 항목은 {failed_text}입니다."
        )
        detail = (
            "등록된 F5 rSeries 기준 데이터와 비교한 결과, 등록 데이터만으로 전체 요구 조건 충족을 확인한 모델은 없습니다.\n"
            f"가장 근접한 모델: {model}\n"
            f"주요 충족 조건: {passed_text}\n"
            f"미충족 또는 확인 필요 조건: {failed_text}\n"
            f"대안 검토 모델: {alternative_text}\n"
            "상위 구성, 복수 장비 구성, 또는 요구 조건 조정 여부를 추가 확인해야 합니다."
        )
        internal = (
            f"[내부 검토]\n결론: 전체 조건 충족 확인 불가\n"
            f"최근접 모델: {model}\n적합도: {primary['fit_score'] if primary else 0}%\n"
            f"미충족 또는 확인 필요 조건: {failed_text}\n대안 모델: {alternative_text}\n"
            "검토 의견: 최종 제안 전 공식 Datasheet 및 구성 가능 여부 확인 필요."
        )

    return {"simple": simple, "detail": detail, "internal": internal}


@app.route("/", methods=["GET", "POST"])
def index():
    reference = load_reference()
    context = {
        "models": [normalize_model(model) for model in reference.get("f5_models", [])],
        "platform_images": PLATFORM_GALLERY,
        "example_text": (
            "L4 Throughput 20Gbps 이상\n"
            "L7 Throughput 13Gbps 이상\n"
            "Concurrent Connection 19M 이상\n"
            "SSL TPS 7000 이상\n"
            "25G SFP28 4Port 이상\n"
            "10G Copper 4Port 이상\n"
            "SSD 480GB 이상\n"
            "전원/FAN 이중화"
        ),
    }

    if request.method == "POST":
        requirement_text = str(request.form.get("requirement_text") or "").strip()
        upload = request.files.get("requirement_file")
        if upload and upload.filename:
            if Path(upload.filename).suffix.lower() not in {'.pdf', '.xlsx', '.xlsm', '.csv', '.txt'}:
                flash('지원 파일 형식: PDF, XLSX, XLSM, CSV, TXT')
                return render_template('index.html', requirement_text=requirement_text, **context), 400
            try:
                uploaded_text = text_from_upload(upload)
            except Exception:
                app.logger.warning('RFQ upload could not be parsed')
                flash('파일을 읽지 못했습니다. 암호화·손상 여부를 확인하거나 텍스트를 직접 입력해주세요.')
                return render_template('index.html', requirement_text=requirement_text, **context), 400
            requirement_text = f"{requirement_text}\n{uploaded_text}".strip()

        if not requirement_text:
            flash("고객 요구 스펙을 입력하거나 파일을 업로드해주세요.")
            return render_template("index.html", **context)

        groups = parse_groups(requirement_text)
        if not groups:
            flash("요구사항을 찾지 못했습니다. 항목별로 줄을 나누어 입력해주세요.")
        for group in groups:
            recommendation, alternatives, evaluations = recommend_model(group["requirements"], reference)
            if group["kind"] == "log":
                recommendation, alternatives = None, []
            group.update(recommendation=recommendation, alternatives=alternatives,
                         evaluations=evaluations, mail_texts=mail_texts(recommendation, alternatives))
        return render_template("index.html", requirement_text=requirement_text,
                               groups=groups, **context)

    return render_template("index.html", **context)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG") == "1",
    )

