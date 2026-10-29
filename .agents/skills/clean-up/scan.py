#!/usr/bin/env python3
"""Vestige scan for the deck. Run from the repo root: python3 .agents/skills/clean-up/scan.py

Prints candidates only. Every hit is a lead to verify by hand: classes and
keys are often built at runtime (`is-${key}`, `${prefix}-${level}`,
`labels[row.kind]`, a logo map), so grep before deleting.
"""
import glob
import json
import os
import re

# One pass, so a // inside a string or a quote inside a comment can't
# derail the other.
TOKEN = re.compile(r"/\*.*?\*/|//[^\n]*|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\"(?:[^\"\\\n]|\\.)*\"", re.S)


def read(path):
    with open(path) as f:
        return f.read()


def strip_comments(text, blank_strings=False):
    def sub(m):
        t = m.group(0)
        if t.startswith('/'):
            return ''
        return "''" if blank_strings else t
    return TOKEN.sub(sub, text)


css_files = ['src/styles.css', 'src/lab/lab.css', *sorted(glob.glob('src/lab/takes/*.css'))]
css = strip_comments('\n'.join(read(f) for f in css_files if os.path.exists(f)))
code_files = [f for f in glob.glob('src/**/*', recursive=True) if f.endswith(('.js', '.jsx'))]
code = {f: read(f) for f in code_files}
all_code = '\n'.join(code.values()) + read('index.html') + read('lab.html')


def section(name):
    print(f'\n== {name} ==')


section('CSS classes no source file names (check for template-built names)')
for c in sorted(set(re.findall(r'\.([a-zA-Z][\w-]*)', re.sub(r'url\([^)]*\)', '', css)))):
    if c == 'woff2':
        continue
    if not re.search(r'(?<![\w-])' + re.escape(c) + r'(?![\w-])', all_code):
        print(' ', c)

section('CSS custom properties never read')
for v in sorted(set(re.findall(r'(--[\w-]+)\s*:', css))):
    uses = len(re.findall(re.escape(v) + r'(?![\w-])', css)) - 1
    uses += len(re.findall(re.escape(v) + r'(?![\w-])', all_code))
    if uses <= 0:
        print(' ', v)

section('className tokens with no CSS rule (often harmless semantic hooks)')
seen = set()
for f in sorted(glob.glob('src/**/*.jsx', recursive=True)):
    for a, b in re.findall(r'className=(?:"([^"]*)"|\{`([^`]*)`\})', code[f]):
        for c in re.sub(r'\$\{[^}]*\}', ' ', a or b).split():
            if c.endswith('-') or (f, c) in seen:
                continue
            seen.add((f, c))
            if not re.search(r'\.' + re.escape(c) + r'(?![\w-])', css) \
                    and not re.search(r'querySelector[^\n]*' + re.escape(c), all_code):
                print(f'  {f}: {c}')

section('Exports no other file imports')
for f, t in sorted(code.items()):
    for name in re.findall(r'export\s+(?:const|function|let|class)\s+(\w+)', t):
        if not any(re.search(r'\b' + name + r'\b', code[g]) for g in code if g != f):
            print(f'  {f}: {name} (refs in own file: {len(re.findall(rf"\b{name}\b", t)) - 1})')

section('Files under src/ nothing imports')
for f in sorted(code_files + glob.glob('src/**/*.css', recursive=True)):
    base = os.path.splitext(os.path.basename(f))[0]
    if base in ('main', 'index') or f.startswith('src/lab/takes/'):
        continue
    if not re.search(r"['/]" + re.escape(base) + r"(\.\w+)?'", all_code):
        print(' ', f)

section('Copy keys no component reads (src/deck/)')
deck = [f for f in code if f.startswith('src/deck/')]
content = strip_comments('\n'.join(code[f] for f in deck), blank_strings=True)
others = strip_comments('\n'.join(t for f, t in code.items() if f not in deck))
# Keys of the logo map are read by portco id; skip any that names a logo file.
logos = {os.path.splitext(os.path.basename(p))[0].replace('-', '')
         for p in glob.glob('public/logos/*')}
for k in sorted(set(re.findall(r'(?<![\w.])(\w+)\s*:', content))):
    if k.lower() in logos:
        continue
    if not re.search(r'\b' + k + r'\b', others) and not re.search(r'\.' + k + r'\b', content):
        print(' ', k)

section('Assets nothing references')
styles = read('src/styles.css')
for p in sorted(glob.glob('public/**/*.*', recursive=True)):
    name = os.path.basename(p)
    if os.path.splitext(name)[0] not in all_code and name not in all_code \
            and name not in read('index.html'):
        print(' ', p)
for p in sorted(glob.glob('src/fonts/*')):
    if os.path.basename(p) not in styles:
        print(' ', p)

section('Skills in skills-lock.json no doc or skill mentions')
lock = json.loads(read('skills-lock.json')).get('skills', {}) if os.path.exists('skills-lock.json') else {}
docs = '\n'.join(read(f) for f in ['AGENTS.md', 'README.md', *glob.glob('.agents/skills/*/SKILL.md')]
                 if os.path.exists(f) and not os.path.islink(os.path.dirname(f)))
for name in sorted(lock):
    if name not in docs:
        print(' ', name)

section('Dependencies nothing imports')
pkg = json.loads(read('package.json'))
# Include tests, scripts and root configuration, without generated/vendor files.
dependency_files = set(code_files)
for pattern in ('tests/**/*', 'scripts/**/*', '*'):
    dependency_files.update(f for f in glob.glob(pattern, recursive=True)
                            if os.path.isfile(f) and f.endswith(('.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts')))
dependency_code = '\n'.join(read(f) for f in sorted(dependency_files))
for dep in {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}:
    if dep == 'vite':
        continue
    if not re.search(r'[\'"]' + re.escape(dep) + r'(?:/|[\'"])', dependency_code):
        print(' ', dep)
