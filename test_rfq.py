import io
import unittest

from app import app, parse_requirements, normalize_model, load_reference
from rfq_parser import parse_groups
from matching import evaluate_model


def values(text):
    return {item['key']: item['value'] for item in parse_requirements(text)}


class ParserRegressionTests(unittest.TestCase):
    def test_tb_and_mem(self):
        result = values('MEM : 256G 이상\nDISK : SSD 2TB 이상')
        self.assertEqual(result.get('memory_gb'), 256)
        self.assertEqual(result.get('ssd_gb'), 2000)

    def test_ssl_is_not_l4(self):
        result = values('SSL Throughput : 8Gbps 이상')
        self.assertNotIn('l4_gbps', result)
        self.assertEqual(result.get('ssl_gbps'), 8)

    def test_distinct_rps(self):
        result = values('L4 RPS : 850,000 rps 이상\nL7 RPS : 475,000 rps 이상\nMaximum Query RPS : 590,000 이상')
        self.assertEqual(result.get('l4_rps'), 850000)
        self.assertEqual(result.get('l7_rps'), 475000)
        self.assertEqual(result.get('dns_qps'), 590000)

    def test_multiple_ports(self):
        result = values('40G 6포트 이상 10G 12포트 이상')
        self.assertEqual(result.get('qsfp_40g_ports'), 6)
        self.assertEqual(result.get('sfp_plus_10g_ports'), 12)

    def test_requirement_not_product_value(self):
        result = values('Storage\n요구규격: 1TB 이상\n제품사양: 480GB M.2 SSD\n검토결과: 미충족')
        self.assertEqual(result.get('ssd_gb'), 1000)

    def test_http_is_not_generic_l4(self):
        result = values('HTTP Throughput 20Gbps 이상\nHTTP CPS 400,000 이상\nHTTP TPS 800,000 이상')
        self.assertNotIn('l4_gbps', result)
        self.assertEqual(result.get('http_tps'), 800000)

    def test_korean_units(self):
        self.assertEqual(values('동시 커넥션 2,400만 CC 이상').get('concurrent_connections'), 24000000)

    def test_no_invented_redundancy(self):
        model = normalize_model(load_reference()['f5_models'][0])
        self.assertIsNone(model.get('redundant_power'))

    def test_features_not_silently_lost(self):
        result = values('포트 미러링 기능 제공\n악의적인 백도어 미설치 확인서 제공')
        self.assertIn('port_mirroring', result)
        self.assertIn('integrity_document', result)

    def test_cpu_memory_combination(self):
        result = values('CPU/Memory\n요구규격: 4 Core/32GB 이상\n제품사양: 8 Core/32GB')
        self.assertEqual(result.get('cpu_cores'), 4)
        self.assertEqual(result.get('memory_gb'), 32)

    def test_shared_physical_ports(self):
        model = normalize_model(load_reference()['f5_models'][0])
        result = evaluate_model(model, parse_requirements('25G SFP28 4Port 이상\n10G SFP+ 4Port 이상'))
        self.assertFalse(result['all_passed'])
        self.assertTrue(any(c['key'] == 'physical_ports' for c in result['checks']))

    def test_dns_requires_test_conditions(self):
        model = normalize_model(load_reference()['f5_models'][0])
        result = evaluate_model(model, parse_requirements('초당 DNS 쿼리 30,000 QPS 이상'))
        self.assertEqual(result['checks'][0]['status'], '확인 필요')
        self.assertEqual(result['unknown_count'], 1)

    def test_separate_storage_requirements(self):
        groups = parse_groups('웹방화벽(WAF)\nDISK SSD 2TB 이상\n로그서버(WAF)\nStorage 20TB 이상')
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0]['requirements'][0]['value'], 2000)
        self.assertEqual(groups[1]['requirements'][0]['value'], 20000)

    def test_unknown_conditions_block_recommendation(self):
        model = normalize_model(load_reference()['f5_models'][0])
        result = evaluate_model(model, parse_requirements('L4 Throughput 20Gbps 이상\n특수 인증서 제출 필수'))
        self.assertFalse(result['all_passed'])
        self.assertEqual(result['unknown_count'], 1)

    def test_product_specs_do_not_create_port_requirements(self):
        result = values('인터페이스\n요구규격: 40G 6포트 이상 10G 12포트 이상\n제품사양: 2x 100G/40G QSFP28, 8x 25G/10G SFP28')
        self.assertEqual(result.get('qsfp_40g_ports'), 6)
        self.assertEqual(result.get('sfp_plus_10g_ports'), 12)

    def test_l4_l7_pair(self):
        result = values('L4/L7 Throughput 20Gbps / 13Gbps 이상')
        self.assertEqual(result.get('l4_gbps'), 20)
        self.assertEqual(result.get('l7_gbps'), 13)

    def test_unknown_port_never_silently_dropped(self):
        result = parse_requirements('200G 2Port 이상 10G 4Port 이상')
        self.assertTrue(any(r['key'].startswith('unknown_port') for r in result))

    def test_customer_uplink_optics_and_throughput_sentence(self):
        text = '최소 규격 요구사항: 업링크 1/10G 광 24Port , 지빅 10G 멀티 12개(정품, 12개* 16대 = 총 192개), L4 Throughput: 30Gbps 이상 통일'
        result = values(text)
        self.assertEqual(result.get('sfp_plus_10g_ports'), 24)
        self.assertEqual(result.get('l4_gbps'), 30)
        self.assertEqual(result.get('optics_10g_count'), 12)
        model = next(m for m in load_reference()['f5_models'] if m['model'] == 'F5 r4600')
        evaluation = evaluate_model(normalize_model(model), parse_requirements(text))
        self.assertFalse(evaluation['all_passed'])
        self.assertEqual(next(c for c in evaluation['checks'] if c['key'] == 'sfp_plus_10g_ports')['status'], '미충족')

    def test_missing_storage_is_unknown(self):
        model = next(m for m in load_reference()['f5_models'] if m['model'] == 'F5 r5600')
        result = evaluate_model(normalize_model(model), parse_requirements('SSD 2TB 이상'))
        self.assertEqual(result['checks'][0]['status'], '확인 필요')

    def test_tls_algorithm_needs_confirmation(self):
        model = normalize_model(load_reference()['f5_models'][0])
        result = evaluate_model(model, parse_requirements('SSL/TLS TPS 7000 이상'))
        self.assertEqual(result['checks'][0]['status'], '확인 필요')


class WebTests(unittest.TestCase):
    def test_home(self):
        self.assertEqual(app.test_client().get('/').status_code, 200)

    def test_equipment_groups(self):
        response = app.test_client().post('/', data={'requirement_text': '웹방화벽(WAF)\nMEM 256G 이상\n8 대 일체형\n로그서버(WAF)\nStorage 20TB 이상\n1 대'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('로그서버(WAF)', response.get_data(as_text=True))
        self.assertIn('20,000', response.get_data(as_text=True))

    def test_upload_preserves_lines(self):
        response = app.test_client().post('/', data={'requirement_file': (io.BytesIO('L4 Throughput 20Gbps 이상\nSSD 480GB 이상'.encode()), 'rfq.txt')})
        self.assertEqual(response.status_code, 200)
        self.assertIn('480', response.get_data(as_text=True))

    def test_invalid_upload_is_explained(self):
        response = app.test_client().post('/', data={'requirement_file': (io.BytesIO(b'not a pdf'), 'rfq.pdf')})
        self.assertEqual(response.status_code, 400)
        self.assertIn('파일을 읽지 못했습니다', response.get_data(as_text=True))

    def test_input_is_html_escaped(self):
        response = app.test_client().post('/', data={'requirement_text': 'L4 Throughput 20Gbps 이상\n<script>alert(1)</script>'})
        self.assertNotIn('<script>alert(1)</script>', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
