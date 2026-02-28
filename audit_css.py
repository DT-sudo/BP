import re
from pathlib import Path

# ── 1. Parse CSS selectors
css_text = Path('frontend/static/css/styles.css').read_text()
css_classes = set(re.findall(r'\.([\w][\w-]*)', css_text))

# ── 2. Parse used classes from HTML
used = set()

for f in Path('frontend/templates').rglob('*.html'):
    txt = f.read_text()
    for cls_str in re.findall(r'class="([^"]+)"', txt):
        for c in cls_str.split():
            used.add(c)

# ── 3. Parse used classes from JS
for f in Path('frontend/static/js').rglob('*.js'):
    txt = f.read_text()
    for m in re.findall(r"classList\.(?:add|remove|toggle|contains|replace)\(([^)]+)\)", txt):
        for q in re.findall(r"['\"]([^'\"]+)['\"]", m):
            for c in q.split():
                used.add(c)
    for m in re.findall(r"querySelector(?:All)?\(['\"]([^'\"]+)['\"]\)", txt):
        for c in re.findall(r'\.([\w][\w-]*)', m):
            used.add(c)
    for m in re.findall(r"className\s*=\s*['\"]([^'\"]+)['\"]", txt):
        for c in m.split():
            used.add(c)
    for m in re.findall(r"['\"`]([a-z][\w-]+(?: [\w-]+)*)['\"`]", txt):
        for c in m[0].split():
            if re.match(r'^[a-z][\w-]+$', c) and len(c) > 2:
                used.add(c)

# ── 4. Find CSS classes NOT used anywhere
dead = sorted(css_classes - used)
print(f"CSS defines {len(css_classes)} class selectors, {len(used)} used in HTML+JS\n")
print("POTENTIALLY DEAD CSS CLASSES:")
for c in dead:
    print(f"  .{c}")
