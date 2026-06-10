import json
import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from flask import Flask, flash, render_template, request
from openpyxl import load_workbook
from pypdf import PdfReader


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
REFERENCE_PATH = DATA_DIR / "reference_data.json"

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-on-render")


QUALITATIVE_FEATURES = {
    "redundant_power": {
        "label": "전원 이중화",
        "keywords": ["전원", "power", "psu", "이중화", "redundant"],
        "supported": True,
    },
    "redundant_fan": {
        "label": "FAN 이중화/Hot-Swap",
        "keywords": ["fan", "팬", "hot-swap", "hotswap", "hot swap", "이중화"],
        "supported": True,
    },
}


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def load_reference():
    if not REFERENCE_PATH.exists():
        return {"f5_models": [], "comparisons": [], "sources": [], "pdf_summary": {}}
    return json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))


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
    found = re.search(r"(\d+(?:\.\d+)?)", text)
    if not found:
        return 0.0
    number = float(found.group(1))
    if "k" in text:
        return number * 1_000
    if "m" in text:
        return number * 1_000_000
    if "g" in text:
        return number
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
        "sfp": 0,
        "copper": 0,
        "speed_1g": 0,
        "speed_10g": 0,
        "speed_25g": 0,
    }

    for count, desc in re.findall(r"(\d+)\s*x\s*([^,]+)", text):
        qty = int(count)
        if "sfp" in desc:
            ports["sfp"] += qty
        if "copper" in desc or "utp" in desc or "rj45" in desc:
            ports["copper"] += qty
        if "1g" in desc:
            ports["speed_1g"] += qty
        if "10g" in desc:
            ports["speed_10g"] += qty
        if "25g" in desc:
            ports["speed_25g"] += qty

    return ports


def normalize_model(model):
    specs = model.get("specs", {})
    l4, l7 = parse_throughput_pair(specs.get("L4/L7 Throughput"))
    ports = parse_ports(specs.get("인터페이스"))
    model_name = model.get("model", "")

    return {
        "model": model_name,
        "display_model": display_model_name(model_name),
        "series": model.get("series", ""),
        "raw_specs": specs,
        "l4_gbps": l4,
        "l7_gbps": l7,
        "ssl_tps": number_with_unit(
            specs.get("SSL TPS (RSA 2K)") or specs.get("SSL TPS RSA 2K")
        ),
        "concurrent_connections": number_with_unit(specs.get("동시 커넥션")),
        "ssd_gb": number_with_unit(specs.get("Storage")),
        "memory_gb": number_with_unit(specs.get("Memory")),
        **ports,
        "redundant_power": True,
        "redundant_fan": True,
    }


def display_model_name(model_name):
    name = str(model_name or "").replace("F5 ", "F5 BIG-IP ")
    return re.sub(r"\br(\d)", r"R\1", name)


def extract_threshold(text, keywords, unit_hint=None):
    lowered = text.lower()
    for keyword in keywords:
        key = keyword.lower()
        idx = lowered.find(key)
        if idx < 0:
            continue
        window = lowered[idx + len(key) : idx + len(key) + 90]
        found = re.search(r"(\d+(?:,\d{3})*(?:\.\d+)?)\s*(gbps|gb|g|tps|k|m)?", window)
        if not found:
            continue
        raw = found.group(1).replace(",", "")
        number = float(raw)
        unit = (found.group(2) or unit_hint or "").lower()
        if unit == "k":
            return number * 1_000
        if unit == "m":
            return number * 1_000_000
        return number
    return None


def extract_port_requirement(text, keywords):
    lowered = text.lower()
    for keyword in keywords:
        idx = lowered.find(keyword.lower())
        if idx < 0:
            continue
        window = lowered[max(0, idx - 40) : idx + 80]
        patterns = [
            r"(\d+)\s*(?:port|ports|포트|port 이상)",
            r"(\d+)\s*(?:개|ea)\s*(?:이상)?",
        ]
        for pattern in patterns:
            found = re.search(pattern, window, re.IGNORECASE)
            if found:
                return int(found.group(1))
    return None


def parse_requirements(text):
    requirements = []

    numeric_checks = [
        ("l4_gbps", "L4 Throughput", ["l4 throughput", "l4 처리량", "l4"], "Gbps"),
        ("l7_gbps", "L7 Throughput", ["l7 throughput", "l7 처리량", "l7"], "Gbps"),
        ("ssl_tps", "SSL TPS", ["ssl 2k tps", "ssl tps", "ssl"], "TPS"),
        (
            "concurrent_connections",
            "Concurrent Connection",
            ["concurrent connection", "동시 커넥션", "동시접속", "동시 연결", "connection"],
            "",
        ),
        ("ssd_gb", "SSD", ["ssd", "storage", "disk", "스토리지"], "GB"),
        ("memory_gb", "Memory", ["memory", "메모리", "ram"], "GB"),
    ]

    for key, label, keywords, unit in numeric_checks:
        value = extract_threshold(text, keywords, unit)
        if value is not None:
            requirements.append({"key": key, "label": label, "value": value, "unit": unit})

    port_checks = [
        ("sfp", "SFP/SFP+/SFP28 Port", ["sfp28", "sfp+", "sfp"]),
        ("copper", "UTP/Copper Port", ["utp", "copper", "rj45"]),
        ("speed_1g", "1G 지원 Port", ["1g"]),
        ("speed_10g", "10G 지원 Port", ["10g"]),
        ("speed_25g", "25G 지원 Port", ["25g"]),
    ]

    for key, label, keywords in port_checks:
        value = extract_port_requirement(text, keywords)
        if value is not None:
            requirements.append({"key": key, "label": label, "value": value, "unit": "Port"})

    lowered = text.lower()
    for key, feature in QUALITATIVE_FEATURES.items():
        if all(word in lowered for word in ["전원", "이중화"]) and key == "redundant_power":
            requirements.append({"key": key, "label": feature["label"], "value": True, "unit": ""})
            continue
        if any(word in lowered for word in feature["keywords"]) and (
            "이중화" in lowered or "hot" in lowered or "redundant" in lowered
        ):
            requirements.append({"key": key, "label": feature["label"], "value": True, "unit": ""})

    deduped = []
    seen = set()
    for req in requirements:
        if req["key"] in seen:
            continue
        seen.add(req["key"])
        deduped.append(req)
    return deduped


def format_requirement_value(req):
    value = req["value"]
    if value is True:
        return "필수"
    if req["key"] == "concurrent_connections":
        return f"{value / 1_000_000:g}M 이상"
    if req["key"] == "ssl_tps":
        return f"{value:,.0f} TPS 이상"
    return f"{value:g}{req['unit']} 이상"


def format_model_value(model, key):
    value = model.get(key)
    if key == "concurrent_connections":
        return f"{value / 1_000_000:g}M"
    if key == "ssl_tps":
        return f"{value:,.0f} TPS"
    if key in {"l4_gbps", "l7_gbps"}:
        return f"{value:g}Gbps"
    if key in {"ssd_gb", "memory_gb"}:
        return f"{value:g}GB"
    if key in {"sfp", "copper", "speed_1g", "speed_10g", "speed_25g"}:
        return f"{int(value)}Port"
    if key in {"redundant_power", "redundant_fan"}:
        return "지원" if value else "확인 필요"
    return str(value)


def evaluate_model(model, requirements):
    checks = []
    for req in requirements:
        actual = model.get(req["key"])
        if req["value"] is True:
            passed = bool(actual)
        else:
            passed = actual is not None and float(actual) >= float(req["value"])
        checks.append(
            {
                "label": req["label"],
                "required": format_requirement_value(req),
                "actual": format_model_value(model, req["key"]),
                "passed": passed,
            }
        )

    passed_count = sum(1 for check in checks if check["passed"])
    return {
        "model": model,
        "checks": checks,
        "passed_count": passed_count,
        "failed_count": len(checks) - passed_count,
        "all_passed": passed_count == len(checks) and bool(checks),
    }


def recommend_model(requirements, reference):
    models = [normalize_model(model) for model in reference.get("f5_models", [])]
    evaluations = [evaluate_model(model, requirements) for model in models]
    evaluations.sort(
        key=lambda item: (
            0 if item["all_passed"] else 1,
            item["failed_count"],
            item["model"].get("l4_gbps", 0),
            item["model"].get("ssl_tps", 0),
        )
    )
    return evaluations[0] if evaluations else None, evaluations


def mail_text(recommendation):
    model = recommendation["model"]["display_model"]
    if recommendation["all_passed"]:
        return (
            f"문의 주신 스펙 기준으로는 {model} 모델이 적합합니다.\n"
            "요구하신 주요 성능 및 구성 조건을 충족하므로 해당 장비로 제안 진행하시면 됩니다."
        )
    return (
        f"문의 주신 스펙 기준으로는 {model} 모델이 가장 근접합니다.\n"
        "일부 항목은 추가 확인이 필요하므로 세부 요구사항 확인 후 제안 진행을 권장드립니다."
    )


@app.route("/", methods=["GET", "POST"])
def index():
    reference = load_reference()
    context = {
        "models": [normalize_model(model) for model in reference.get("f5_models", [])],
        "example_text": (
            "L4 Throughput 20Gbps 이상\n"
            "L7 Throughput 13Gbps 이상\n"
            "Concurrent Connection 19M 이상\n"
            "SSL TPS 7000 이상\n"
            "1G/10G/25G SFP+ 4Port 이상\n"
            "SSD 480GB 이상\n"
            "전원/FAN 이중화"
        ),
    }

    if request.method == "POST":
        requirement_text = clean_text(request.form.get("requirement_text"))
        upload = request.files.get("requirement_file")
        if upload and upload.filename:
            uploaded_text = text_from_upload(upload)
            requirement_text = f"{requirement_text}\n{uploaded_text}".strip()

        if not requirement_text:
            flash("고객 요구 스펙을 입력하거나 파일을 업로드해주세요.")
            return render_template("index.html", **context)

        requirements = parse_requirements(requirement_text)
        if not requirements:
            flash("비교할 스펙 조건을 찾지 못했습니다. L4, L7, SSL TPS, Concurrent Connection처럼 입력해주세요.")
            return render_template("index.html", requirement_text=requirement_text, **context)

        recommendation, evaluations = recommend_model(requirements, reference)
        return render_template(
            "index.html",
            requirement_text=requirement_text,
            requirements=requirements,
            recommendation=recommendation,
            evaluations=evaluations[:6],
            mail_body=mail_text(recommendation),
            **context,
        )

    return render_template("index.html", **context)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG") == "1",
    )
