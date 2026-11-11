#!/usr/bin/env python3
"""把 src 合并成单个 HTML"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'dist', '我的第一款游戏.html')

html = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

# 内联 CSS
css = io.open(os.path.join(ROOT, 'css', 'style.css'), encoding='utf-8').read()
html = html.replace('<link rel="stylesheet" href="css/style.css">',
                    '<style>\n' + css + '\n</style>')

# 内联 JS（按 index.html 中的顺序）
def repl(m):
    src = m.group(1)
    code = io.open(os.path.join(ROOT, src), encoding='utf-8').read()
    return '<script>\n/* ===== ' + src + ' ===== */\n' + code + '\n</script>'

html = re.sub(r'<script src="([^"]+)"></script>', repl, html)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, 'w', encoding='utf-8').write(html)
size = os.path.getsize(OUT)
print(f'已生成: {OUT}')
print(f'大小: {size:,} 字节 ({size/1024:.0f} KB)')
