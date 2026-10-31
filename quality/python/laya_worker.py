"""Line-delimited local inference for pilot packets and user-selected repository evidence."""
import json, os, sys, time, resource, platform
from contextlib import redirect_stdout

def emit(value):
    print(json.dumps(value), flush=True)

try:
    start = time.perf_counter()
    with redirect_stdout(sys.stderr):
        import laya, torch, transformers
        from laya.common import build_head, build_sequence, render_options
        requested_device = os.getenv('LAYA_DEVICE', 'auto')
        device = ('mps' if torch.backends.mps.is_available() else 'cpu') if requested_device == 'auto' else requested_device
        if device == 'mps' and not torch.backends.mps.is_available(): device = 'cpu'
        agent = laya.load('convaiinnovations/laya', device=device,
                          revision=os.environ['LAYA_REVISION'])
    MAX_LEN, HEAD_LEN = 2048, 512
    emit({'ready': True, 'model': 'convaiinnovations/laya', 'revision': agent.revision,
          'startupMs': (time.perf_counter()-start)*1000,
          'device': str(agent.device), 'requestedDevice': requested_device, 'maxLen': MAX_LEN, 'headMaxLen': HEAD_LEN,
          'runtime': {'laya': laya.__version__, 'torch': torch.__version__,
                      'transformers': transformers.__version__, 'python': platform.python_version()}})
except Exception:
    emit({'ready': False, 'errorCode': 'laya_load_failed'})
    sys.exit(1)

for line in sys.stdin:
    try:
        request = json.loads(line)
        p = request['packet']
        question = {'type': 'choice', 'instructions': p['instructions'], 'criteria': p['choices']}
        internal = {'t': 'choice', 'ins': p['instructions'], 'crit': p['choices']}
        if request['action'] == 'preflight':
            head, _, _ = build_head(agent.tok, internal, HEAD_LEN)
            full_head, _, _ = build_head(agent.tok, internal, 100000)
            _, _, stats = build_sequence(agent.tok, p['input'], internal, MAX_LEN, HEAD_LEN,
                                         return_truncation_stats=True)
            option_cut = any(len(agent.tok.encode(' '+o, add_special_tokens=False)) > 48
                             for o in render_options(internal))
            good = not stats['truncated'] and head == full_head and not option_cut
            emit({'ok': good, 'stateTokens': stats['state_tokens'], 'headTokens': len(head),
                  'errorCode': None if good else 'evidence_or_question_truncated'})
        elif request['action'] == 'predict':
            if agent.device.type == 'mps': torch.mps.synchronize()
            start = time.perf_counter()
            with redirect_stdout(sys.stderr):
                result = agent.predict(p['input'], {'decision': question}, max_len=MAX_LEN, head_max_len=HEAD_LEN)
            if agent.device.type == 'mps': torch.mps.synchronize()
            if result['usage'].get('truncated') or result['usage'].get('options'):
                emit({'errorCode': 'evidence_or_question_truncated'})
            else:
                emit({'answer': result['answers']['decision'], 'usage': result['usage'],
                      'inferenceMs': (time.perf_counter()-start)*1000,
                      'peakProcessRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024)})
        else: emit({'errorCode': 'unsupported_action'})
    except Exception:
        emit({'errorCode': 'laya_inference_failed'})
