"""Conservative, line-preserving RFQ extraction. Unknown requirements stay visible."""
import html
import re


NUMBER = r'(\d[\d,]*(?:\.\d+)?)\s*(억|만|tbps|gbps|mbps|tb|gb|ge|g|k|m)?'
# Specific metrics precede general terms. A generic HTTP/SSL metric is never L4.
METRICS = [
    ('dns_qps', 'DNS Query QPS/RPS', r'max(?:imum)?\s*query\s*rps|(?:초당\s*)?dns\s*(?:쿼리|qps)|qps', 'QPS'),
    ('ssl_gbps', 'SSL/TLS Throughput', r'(?:ssl|tls)(?:/tls)?\s*(?:throughput|처리량)', 'Gbps'),
    ('ecdsa_tps', 'ECDSA TPS', r'ecdsa(?:\s*p-?256)?\s*tps', 'TPS'),
    ('ssl_tps', 'SSL RSA 2K TPS', r'(?:ssl|tls)(?:/tls)?\s*(?:2k\s*)?tps', 'TPS'),
    ('http_gbps', 'HTTP/WAF Throughput', r'(?:http|waf)\s*(?:throughput|처리량)', 'Gbps'),
    ('http_cps', 'HTTP CPS', r'http\s*cps', 'CPS'),
    ('http_tps', 'HTTP TPS', r'http\s*tps', 'TPS'),
    ('l4_rps', 'L4 HTTP RPS', r'l4\s*(?:http\s*)?(?:rps|requests per second)', 'RPS'),
    ('l7_rps', 'L7 HTTP RPS', r'l7\s*(?:http\s*)?(?:rps|requests per second)', 'RPS'),
    ('l4_cps', 'L4 CPS', r'(?:l4\s*)?(?:cps|connections per second)|단위\s*커넥션', 'CPS'),
    ('l4_gbps', 'L4 Throughput', r'l4\s*(?:throughput|처리량)', 'Gbps'),
    ('l7_gbps', 'L7 Throughput', r'l7\s*(?:throughput|처리량)', 'Gbps'),
    ('concurrent_connections', '동시 커넥션', r'concurrent\s*connections?|동시\s*(?:커넥션|세션|연결|접속)', 'CC'),
    ('ssd_gb', 'SSD / Storage', r'storage|hard\s*(?:drive|disk)|disk|ssd(?:\s*storage)?|스토리지', 'GB'),
    ('memory_gb', 'Memory', r'memory|메모리|\bram\b|\bmem\b', 'GB'),
    ('cpu_cores', 'CPU Core', r'cpu(?:/memory)?', 'Core'),
    ('arp_table', 'ARP Table', r'arp\s*(?:table)?', 'Entry'),
    ('generic_tps', '트랜잭션 TPS (시험 기준 확인)', r'단위\s*트랜잭션|transactions? per second', 'TPS'),
    ('generic_gbps', 'Throughput (계층 확인)', r'throughput|처리\s*성능', 'Gbps'),
]
FEATURES = [
    ('redundant_power', '전원 이중화', r'(?:전원|power|psu).*(?:이중화|redundant|dual)'),
    ('redundant_fan', 'FAN 이중화', r'(?:fan|팬).*(?:이중화|redundant|dual)'),
    ('hot_swap', 'Hot-Swap / Fan Tray', r'hot[ -]?swap|fan\s*tray'),
    ('management_port', '별도 관리 포트', r'management\s*port|관리용.*port|관리\s*포트'),
    ('port_mirroring', '포트 미러링', r'포트\s*미러링|port mirroring'),
    ('virtual_routing', '가상화 라우팅', r'가상화?\s*라우팅|virtual routing'),
    ('control_redundancy', '제어부 이중화', r'제어부.*이중화'),
    ('backup_restore', '온라인 설정 / 백업 복구', r'백업|복구|backup|restore'),
    ('admin_access', '관리자 권한별 접근 제어', r'관리자.*(?:권한|접근제어)'),
    ('admin_logging', '관리자 접근 Logging', r'관리자.*(?:logging|로그)'),
    ('monitoring', '상태 / 장애 모니터링', r'모니터링|monitoring|health\s*check'),
    ('loop_prevention', 'Looping 방지', r'looping|루프.*방지'),
    ('dump', '장애 Dump 생성', r'dump'),
    ('qos', 'QoS', r'\bqos\b'),
    ('ddos', 'DDoS 정책 / 차단', r'ddos'),
    ('integrity_document', '백도어 미설치 / 무결성 확인서', r'백도어|무결성.*확인서'),
    ('integration_test', '사전 연동 / 세션 정합성 시험', r'사전\s*검증|세션\s*정합성|연동.*통신'),
    ('log_retention', '로그 보존 기간', r'년.*로그|로그.*년'),
    ('log_management', '통합로그관리 시스템', r'통합\s*로그\s*관리'),
    ('waf_ltm', 'Advanced WAF + LTM 통합', r'advanced waf.*ltm'),
    ('ha', 'HA 구성', r'\bha\b'),
    ('vip', 'VIP 지원', r'\bvip\b'),
    ('tls', 'TLS 지원 / 구성', r'\btls\b.*(?:지원|요구|충족)'),
]
HEADINGS = re.compile(r'^(?:\d+\s*[.)]\s*)?(웹방화벽\s*\(waf\)|로그서버\s*\(waf\)|dns\s*gslb(?:\s*[—–-].*)?|l4\s*스위치(?:\s*요구사항)?|\[.+\])$', re.I)
IGNORED = re.compile(r'^(?:구\s*분|주요\s*기능요건|수량|단위|비고|h/w|인터페이스|주요기능|세부내용|세부\s*규격|성능\s*및\s*규격|설치장소\s*:.*|이상입니다\.?|구분)$', re.I)


def normalize_text(text):
    text = html.unescape(str(text or '')).replace('\\\n', '\n').replace('\r', '\n').replace(' | ', '\n')
    # Split clauses, while preserving thousands separators and parenthesized BOM notes.
    output = []
    depth = 0
    for index, char in enumerate(text):
        if char == '(':
            depth += 1
        elif char == ')':
            depth = max(0, depth - 1)
        thousands = char == ',' and index > 0 and index + 1 < len(text) and text[index - 1].isdigit() and text[index + 1].isdigit()
        output.append('\n' if char in ',;' and depth == 0 and not thousands else char)
    return ''.join(output)


def numeric_value(text, unit):
    match = re.search(NUMBER, text, re.I)
    if not match:
        return None
    value = float(match[1].replace(',', ''))
    suffix = (match[2] or '').lower()
    multiplier = {'억': 1e8, '만': 1e4, 'k': 1e3, 'm': 1e6}.get(suffix, 1)
    if unit == 'GB':
        multiplier = 1000 if suffix == 'tb' else 1
    elif unit == 'Gbps':
        multiplier = {'tbps': 1000, 'mbps': .001}.get(suffix, 1)
    return value * multiplier


def requirement(key, label, value, unit, source, note=''):
    return dict(key=key, label=label, value=value, unit=unit,
                type='boolean' if value is True else 'numeric', source=source, note=note)


def port_requirements(line):
    """Each physical port group becomes one requirement, at its highest speed."""
    result = []
    end = 0
    pattern = r'(\d+)\s*(?:ports?\b|포트|개\s*이상|개\s*$)'
    for count in re.finditer(pattern, line, re.I):
        desc = line[end:count.start()].lower()
        end = count.end()
        speeds = re.search(r'(\d+(?:\s*/\s*\d+)*)\s*(?:g(?:e|bps)?)(?![a-z])', desc)
        if not speeds:
            if re.search(r'10\s*/\s*100\s*/\s*1000\s*base-t', desc):
                speed = 1
            else:
                result.append(requirement('unknown_port_' + str(count.start()), '포트 규격 확인', True, '', line, '속도 또는 매체를 해석하지 못했습니다.'))
                continue
        else:
            speed = max(int(x) for x in re.findall(r'\d+', speeds[1]))
        copper = bool(re.search(r'copper|utp|rj|base-t|baset', desc))
        key = ({1: 'copper_1g_ports', 10: 'copper_10g_ports'} if copper else {
            1: 'sfp_1g_ports', 10: 'sfp_plus_10g_ports', 25: 'sfp28_25g_ports',
            40: 'qsfp_40g_ports', 100: 'qsfp28_100g_ports'}).get(speed)
        if key:
            note = '포트 속도 모드·트랜시버·동시 사용 구성을 별도 확인해야 합니다.'
            if speeds and '/' in speeds[1]:
                note += ' 복수 속도 표기는 최고 속도 포트 수로 비교하며 하위 속도 지원도 확인해야 합니다.'
            result.append(requirement(key, f'{speed}G {"Copper" if copper else "광/데이터"} Port', int(count[1]), 'Port', line, note))
        else:
            result.append(requirement('unknown_port_' + str(count.start()), '포트 규격 확인', True, '', line, '등록하지 않은 포트 속도/매체 조건입니다.'))
    return result


def parse_requirements(text):
    results = []
    pending = None
    pending_pair = None
    skip_product = False
    for raw in normalize_text(text).splitlines():
        line = re.sub(r'^[\s\\•ㅇ–—-]+', '', raw).strip()
        if not line:
            continue
        if re.match(r'제품사양|검토결과|정리하자면|r\d+은', line, re.I):
            skip_product = True
            continue
        found_metric = next((m for m in METRICS if re.search(m[2], line, re.I)), None)
        if found_metric and not re.match(r'요구규격', line):
            skip_product = False
        if skip_product and not re.match(r'요구규격', line):
            continue
        pair_kind = 'cpu' if re.search(r'cpu\s*/\s*memory', line, re.I) else ('throughput' if re.search(r'l4\s*/\s*l7\s*throughput', line, re.I) else None)
        if pair_kind or (pending_pair and re.match(r'^(?:요구규격\s*[:：]?\s*)?\d', line)):
            kind = pair_kind or pending_pair
            pair = re.search(r'(\d[\d,]*(?:\.\d+)?)\s*(?:core|gbps|g)\s*/\s*(\d[\d,]*(?:\.\d+)?)\s*(?:gbps|gb|g)', line, re.I)
            if pair:
                fields = [('cpu_cores', 'CPU Core', 'Core'), ('memory_gb', 'Memory', 'GB')] if kind == 'cpu' else [('l4_gbps', 'L4 Throughput', 'Gbps'), ('l7_gbps', 'L7 Throughput', 'Gbps')]
                for index, (key, label, unit) in enumerate(fields, 1):
                    results.append(requirement(key, label, float(pair[index].replace(',', '')), unit, line))
                pending_pair = None
            else:
                pending_pair = kind
            pending = None
            continue
        if HEADINGS.match(line) or IGNORED.match(line) or re.match(r'^(?:수량\s*:)?\s*\d+\s*(?:대|식)(?:\s+일체형)?$', line):
            continue
        optics = re.search(r'(?:지빅|gbic|transceiver|트랜시버)\s*(\d+)\s*g.*?(\d+)\s*개', line, re.I)
        if optics:
            results.append(requirement('optics_' + optics[1] + 'g_count', optics[1] + 'G 트랜시버 공급 수량', int(optics[2]), '개', line, '장비 포트 수와 별도입니다. 멀티모드·호환성·정품 여부·장비별/전체 수량을 BOM으로 확인해야 합니다.'))
            if '정품' in line:
                results.append(requirement('genuine_optics', '정품 트랜시버 증빙', True, '', line))
            total = re.search(r'총\s*(\d+)\s*개', line)
            if total:
                results.append(requirement('optics_total_count', '전체 트랜시버 공급 수량', int(total[1]), '개', line))
            continue
        ports = port_requirements(line)
        if ports:
            results.extend(ports)
            pending = None
        if found_metric:
            key, label, pattern, unit = found_metric
            match = re.search(pattern, line, re.I)
            tail = line[match.end():]
            value = numeric_value(tail, unit)
            # The metric may be a heading; the next nonempty line holds its value.
            pending = found_metric if value is None else None
            if value is not None:
                note = ''
                if key in {'dns_qps', 'generic_tps', 'generic_gbps', 'http_gbps', 'http_cps', 'http_tps'}:
                    note = '시험 조건·계층·기능 활성화 기준 확인 필요'
                if any(token in line.lower() for token in ['약', 'peak', '평균', '양방향']):
                    note += ' 최대/평균/양방향/근사값 조건을 원문과 대조해야 합니다.'
                results.append(requirement(key, label, value, unit, line, note))
        elif pending and re.match(r'^(?:요구규격\s*[:：]?\s*)?\d', line):
            key, label, _, unit = pending
            value = numeric_value(line, unit)
            if value is not None:
                results.append(requirement(key, label, value, unit, line))
            pending = None
        elif not ports and not any(re.search(p, line, re.I) for _, _, p in FEATURES):
            results.append(requirement('unparsed_' + str(len(results)), '원문 검토 필요', True, '', line,
                                       '자동 해석하지 못한 조건입니다. 확인 전 전체 충족으로 판정하지 않습니다.'))
        for key, label, pattern in FEATURES:
            if re.search(pattern, line, re.I):
                results.append(requirement(key, label, True, '', line, '라이선스·구성·공식 지원 문서 또는 공급사 확인 필요'))
    if pending:
        results.append(requirement('missing_' + pending[0], pending[1] + ' (값 확인)', True, '', pending[1], '요구 수치를 확인해주세요.'))
    if pending_pair:
        results.append(requirement('missing_pair', '복합 요구값 확인', True, '', pending_pair, 'CPU/Memory 또는 L4/L7 값을 확인해주세요.'))
    # Same metric at a different value remains visible rather than silently taking the first.
    unique = {}
    for item in results:
        unique.setdefault((item['key'], item['value'], item['source'] if item['key'].startswith('unparsed_') else ''), item)
    return list(unique.values())


def parse_groups(text):
    groups = []
    current = dict(name='요구사항', lines=[], quantity='', kind='adc')
    for raw in normalize_text(text).splitlines():
        line = re.sub(r'^[\s\\•ㅇ–—-]+', '', raw).strip()
        if HEADINGS.match(line):
            if any(x.strip() for x in current['lines']):
                groups.append(current)
            current = dict(name=line, lines=[], quantity='', kind='log' if '로그서버' in line else 'adc')
        else:
            current['lines'].append(raw)
            quantity = re.search(r'(?:수량\s*[:：]\s*|^)(\d+)\s*(대|식)(?:\s+일체형)?\s*$', line)
            if quantity:
                current['quantity'] = quantity[1] + quantity[2]
    if any(x.strip() for x in current['lines']):
        groups.append(current)
    parsed = []
    seen = set()
    for group in groups:
        group['requirements'] = parse_requirements('\n'.join(group.pop('lines')))
        signature = (group['name'], group['quantity'], tuple((r['key'], r['value']) for r in group['requirements']))
        if group['requirements'] and signature not in seen:
            seen.add(signature)
            parsed.append(group)
    return parsed
