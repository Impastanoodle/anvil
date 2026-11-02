"""Print chosen keys of the raw JSON: python ref3_show.py sheet xb xb0 -- data sketch volume1 flat1"""
import json
import os
import sys

OUT = r"C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\2026-11-02\check-unmeasured"
a = sys.argv[1:]
sec, rest = a[0], a[1:]
i = rest.index("--") if "--" in rest else len(rest)
names, keys = rest[:i], rest[i + 1:]
for n in names:
    with open(os.path.join(OUT, sec, n + ".json")) as fh:
        r = json.load(fh)
    print("==", n)
    for k in keys or r.keys():
        if k in r:
            print("  ", k, json.dumps(r[k])[:1400])
