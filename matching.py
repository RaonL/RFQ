"""Evidence-aware evaluation, with unknown and insufficient kept separate."""
import re


RSERIES_URL = 'https://www.f5.com/content/dam/f5/corp/global/pdf/data-sheet/f5-application-delivery-controller-system-rseries-data-sheet.pdf'
DNS_URL = 'https://cdn.studio.f5.com/files/k6fem79d/production/e34b659aa50f6d9f5006a487b2865f708128dab2.pdf'
R2600_VERIFIED = {
    'l4_rps': 850000, 'ecdsa_tps': 5000, 'ssl_gbps': 8,
    'dns_qps': 590000, 'cpu_cores': 8,
}
PORT_SPEEDS = {'sfp_1g_ports': 1, 'sfp_plus_10g_ports': 10, 'sfp28_25g_ports': 25,
               'copper_1g_ports': 1, 'copper_10g_ports': 10,
               'qsfp_40g_ports': 40, 'qsfp28_100g_ports': 100}


def extra_specs(model_name, specs):
    extra = dict(R2600_VERIFIED) if model_name.lower() == 'f5 r2600' else {}
    # These figures were verified against the linked vendor tables; no other models inferred.
    extra['evidence_urls'] = {key: DNS_URL if key == 'dns_qps' else RSERIES_URL for key in extra}
    return extra


def format_value(value, unit):
    if value is None:
        return '자료 없음'
    if value is True:
        return '필수'
    return f'{value:,.0f} {unit}'.strip() if float(value).is_integer() else f'{value:g} {unit}'.strip()


def port_conflict(model, requirements):
    """Allocate the actual shared physical ports once. No implicit breakout."""
    pools = []
    for count, description in re.findall(r'(\d+)\s*x\s*([^,]+)', model['raw_specs'].get('인터페이스', ''), re.I):
        desc = description.lower()
        family = 'copper' if re.search(r'copper|utp|base-t|rj', desc) else ('qsfp' if 'qsfp' in desc else 'sfp')
        speeds = set()
        for speed in (1, 10, 25, 40, 100):
            if re.search(rf'(?<!\d){speed}g', desc):
                speeds.add(speed)
        if 'base-t' in desc and '1000' in desc:
            speeds.add(1)
        pools.append(dict(family=family, speeds=speeds, count=int(count)))
    demands = {}
    for req in requirements:
        if req['key'] in PORT_SPEEDS:
            demands[req['key']] = max(demands.get(req['key'], 0), req['value'])
    for key in sorted(demands, key=lambda key: PORT_SPEEDS[key], reverse=True):
        family = 'copper' if key.startswith('copper') else ('qsfp' if key.startswith('qsfp') else 'sfp')
        remaining = demands[key]
        for pool in sorted(pools, key=lambda pool: len(pool['speeds'])):
            if pool['family'] == family and PORT_SPEEDS[key] in pool['speeds']:
                used = min(pool['count'], remaining)
                pool['count'] -= used
                remaining -= used
        if remaining:
            return True
    return False


def evaluate_model(model, requirements):
    checks = []
    for req in requirements:
        key = req['key']
        actual = model.get(key)
        status = '확인 필요'
        note = req.get('note', '')
        if actual is not None:
            if req['value'] is True:
                status = '충족' if actual is True else '확인 필요'
            elif actual < req['value']:
                status = '미충족'
            elif key not in {'dns_qps', 'cpu_cores'}:
                status = '충족'
        if key == 'ssl_tps' and not re.search(r'2\s*k|rsa', req.get('source', ''), re.I) and status == '충족':
            status = '확인 필요'
            note += ' 등록 수치는 RSA 2K 기준입니다. 요구 TLS 알고리즘·키 길이를 확인해주세요.'
        if key == 'dns_qps':
            note += ' DNS Express 활성화 시 권한 DNS 최대 응답 성능입니다. GSLB/QPS 시험 조건·라이선스 확인 필요.'
        if key == 'cpu_cores':
            note += ' 물리 코어와 테넌트 할당 코어를 구분해야 합니다. r2600은 물리 8코어 / 테넌트 4 CPU입니다.' if model['model'].lower() == 'f5 r2600' else ' 물리/테넌트 할당 코어 구분 확인 필요.'
        if actual is None:
            note += ' 등록된 제품 데이터에 근거가 없습니다.'
        passed = status == '충족'
        checks.append(dict(key=key, label=req['label'], required=format_value(req['value'], req['unit']) + (' 이상' if req['value'] is not True else ''),
                           actual=format_value(actual, req['unit']), status=status, result=status,
                           note=note, passed=passed, source=req.get('source', ''),
                           evidence_url=model.get('evidence_urls', {}).get(key, ''),
                           evidence='공식 문서 (시험 조건 확인)' if key in model.get('evidence_urls', {}) else ('등록 기준 자료 (문서 개정·페이지 확인 필요)' if actual is not None else '근거 확인 필요')))
    port_checks = [c for c in checks if c['key'] in PORT_SPEEDS]
    if port_checks and all(c['passed'] for c in port_checks) and port_conflict(model, requirements):
        checks.append(dict(key='physical_ports', label='물리 포트 동시 할당', required='속도별 포트 수 동시 확보', actual='동일 물리 포트 중복 사용 필요', status='미충족', result='미충족', note='브레이크아웃·확장 구성은 별도 검증해야 합니다.', passed=False, source=' / '.join(c['source'] for c in port_checks), evidence='등록 인터페이스 구성', evidence_url=''))
    passed = sum(c['passed'] for c in checks)
    unknown = sum(c['status'] == '확인 필요' for c in checks)
    failed = len(checks) - passed - unknown
    shortfall = sum(1 if model.get(r['key']) is None else (0 if r['value'] is True else max(0, (r['value'] - model[r['key']]) / max(r['value'], 1))) for r in requirements)
    return dict(model=model, checks=checks, passed_count=passed, failed_count=failed,
                unknown_count=unknown, failed_checks=[c for c in checks if not c['passed']],
                fit_score=round(passed / len(checks) * 100, 1) if checks else 0,
                shortfall_score=round(shortfall / max(len(requirements), 1) * 100, 2),
                all_passed=bool(checks) and passed == len(checks))
