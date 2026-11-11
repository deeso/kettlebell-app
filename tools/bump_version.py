"""Set the app version everywhere it lives, so phones pick up the update and the files agree.

  python tools/bump_version.py 1.15.1

Updates APP_VERSION in index.html, VERSION in sw.js and "app" in js/seed.js.
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = sys.argv[1].lstrip('v')
assert re.fullmatch(r'\d+\.\d+\.\d+', v), 'version must look like 1.15.1'
for rel, pat, rep in [('index.html', r'window\.APP_VERSION = "[^"]*"', f'window.APP_VERSION = "{v}"'),
                      ('sw.js', r"const VERSION = 'v[^']*'", f"const VERSION = 'v{v}'"),
                      ('js/seed.js', r'"app": "[^"]*"', f'"app": "{v}"')]:
    p = os.path.join(ROOT, rel); s = open(p, encoding='utf-8').read()
    s2, n = re.subn(pat, rep, s, count=1); assert n == 1, f'no version found in {rel}'
    open(p, 'w', encoding='utf-8').write(s2); print(rel, '->', v)
