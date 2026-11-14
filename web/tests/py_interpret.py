# python reference: interpret/interpret.py on each line of a features jsonl -> json list (stdout)
import json, sys
sys.path.insert(0, '/workspace/palm-ai/interpret')
from interpret import interpret, load_rules
rules, calib = load_rules()
out = [interpret(json.loads(l), rules, calib) for l in open(sys.argv[1]) if l.strip()]
print(json.dumps(out, ensure_ascii=False))
