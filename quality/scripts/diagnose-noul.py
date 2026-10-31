"""Re-ask the atomic Laya probes using its native yes/no (noul) question type."""
import json, os, pathlib, sys, time
from contextlib import redirect_stdout
root = pathlib.Path(__file__).resolve().parents[1]
os.environ['HF_HOME'] = str(root / 'artifacts/hf')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
source = pathlib.Path(sys.argv[1])
rows = [r for r in json.loads(source.read_text())['rows'] if r['provider'] == 'laya']
assert len(rows) == 8
with redirect_stdout(sys.stderr):
    import laya
    agent = laya.load('convaiinnovations/laya', device='mps', revision='7b928d828b7b0e022f929d9bd2e44165aa270148')
results = []
for row in rows:
    p = row['packet']
    start = time.perf_counter()
    with redirect_stdout(sys.stderr):
        result = agent.predict(p['input'], {'decision': {'type': 'noul', 'instructions': p['instructions']}}, max_len=2048, head_max_len=512)
    answer = result['answers']['decision']
    probability = answer['noul']
    label = 'yes' if probability >= .5 else 'no'
    results.append({'id': row['id'], 'name': row['name'], 'expected': row['expected'], 'label': label, 'answer': answer, 'elapsedMs': (time.perf_counter()-start)*1000, 'usage': result['usage']})
    print(json.dumps({'id': row['id'], 'name': row['name'], 'expected': row['expected'], 'actual': label}), flush=True)
    (source.parent / 'noul.json').write_text(json.dumps({'revision': agent.revision, 'decisionRule': 'Diagnostic only: noul >= 0.5 means yes; not a calibrated adoption threshold.', 'rows': results}, indent=2))
