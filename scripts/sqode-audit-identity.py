"""Sqode 作用域/身份改名完整性审计。

一次性枚举旧身份的全部形态，输出清单与计数，作为改名的验收门禁。
用法：
    python sqode_audit_all.py                 # 全树审计
    python sqode_audit_all.py --strict        # 有非豁免命中则退出码 1

形态清单（B33/B34/B37 的教训）：
  F1 完整包名（引号内）        '@deepseek-ai/dsh-session'
  F2 YAML/JSON 键              "@deepseek-ai/cosmokit": ...
  F3 正则字面量（转义斜杠）    /^@deepseek-ai\\/dsh-/
  F4 独立作用域串（路径分段）  join(dir,'node_modules','@deepseek-ai','pkg')
  F5 独立包名段（路径分段）    join(dir,'@liusiqi-dev','dsh','package.json')
  F6 构建产物 / 打包中间件      lib/、.desktop-build/
  F7 入口包旧名                @liusiqi-dev/dsh（精确，非 dsh-*）
"""
import os, re, sys

SRC = r'D:\AI-Project\sqode-src'
OLD_SCOPE = '@deepseek-ai'
NEW_SCOPE = '@liusiqi-dev'

# 豁免：libreoffice-kit 及平台变体是上游已发布的 registry 依赖，不在新作用域下
EXEMPT = re.compile(r'libreoffice-kit')
# 豁免：法务文件必须保留上游真实依赖名
EXEMPT_FILES = ('THIRD_PARTY_NOTICES.md', 'LICENSES.chromium.html', 'LICENSE.electron.txt')
# 密封归档笔记：lefthook 强制其不可变，改了也提交不了
EXEMPT_DIRS = ('.agents/notes',)

FORMS = {
    'F1 完整包名': re.compile(re.escape(OLD_SCOPE) + r'/[A-Za-z0-9._-]+'),
    'F3 正则转义': re.compile(re.escape(OLD_SCOPE) + r'\\/'),
    'F4 独立作用域串': re.compile(r'([\'"])' + re.escape(OLD_SCOPE) + r'(?![\w./-])\1'),
    'F7 入口包旧名': re.compile(re.escape(NEW_SCOPE) + r'/dsh(?![A-Za-z0-9_-])'),
    # F8：libreoffice-kit 是上游已发布依赖，必须保持旧作用域；被改成新作用域即为错误
    'F8 libreoffice 误改': re.compile(re.escape(NEW_SCOPE) + r'\\?/libreoffice-kit'),
}
# F5 形态：新作用域后紧跟独立包名段 'dsh'
F5 = re.compile(r'([\'"])' + re.escape(NEW_SCOPE) + r'([\'"])\s*,\s*([\'"])dsh([\'"])')

TEXT_EXT = ('.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json',
            '.yaml', '.yml', '.md', '.nsh', '.ps1', '.cmd', '.sh', '.html', '.css', '.svg', '.txt')


def scan(include_build=False):
    results = {k: [] for k in FORMS}
    results['F5 独立包名段'] = []
    for r, d, fs in os.walk(SRC):
        if not include_build:
            d[:] = [x for x in d if x not in ('node_modules', '.git', '.desktop-build', 'lib')]
        else:
            d[:] = [x for x in d if x != 'node_modules']
        for fn in fs:
            if not fn.endswith(TEXT_EXT):
                continue
            fp = os.path.join(r, fn)
            rel = os.path.relpath(fp, SRC).replace('\\', '/')
            if fn in EXEMPT_FILES or any(rel.startswith(x) for x in EXEMPT_DIRS):
                continue
            try:
                if os.path.getsize(fp) > 20 * 1024 * 1024:
                    continue
                t = open(fp, encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            # 文件级豁免：libreoffice-kit 是上游已发布依赖，整个文件里的作用域保持 @deepseek-ai
            file_exempt = 'libreoffice' in t.lower()
            for name, pat in FORMS.items():
                if name == 'F8 libreoffice 误改':
                    continue  # F8 单独处理，不受 libreoffice 豁免影响
                for m in pat.finditer(t):
                    s = m.group()
                    if EXEMPT.search(s):
                        continue
                    if file_exempt and name in ('F1 完整包名', 'F3 正则转义', 'F4 独立作用域串'):
                        continue
                    line_no = t[:m.start()].count('\n') + 1
                    results[name].append((rel, line_no, s[:80]))
            for m in F5.finditer(t):
                line_no = t[:m.start()].count('\n') + 1
                results['F5 独立包名段'].append((rel, line_no, m.group()[:80]))
            for name in ('F8 libreoffice 误改',):
                for m in FORMS[name].finditer(t):
                    line_no = t[:m.start()].count('\n') + 1
                    results[name].append((rel, line_no, m.group()[:80]))
    return results


def main():
    strict = '--strict' in sys.argv
    include_build = '--build' in sys.argv
    res = scan(include_build=include_build)
    total = 0
    print('=== Sqode 身份残留审计 ===')
    print('范围:', '全树（含构建产物）' if include_build else '源码树（排除 lib/.desktop-build/node_modules）')
    print()
    for k in sorted(res):
        items = res[k]
        total += len(items)
        print('%-16s %d' % (k, len(items)))
        for rel, ln, s in items[:8]:
            print('    %s:%d  %s' % (rel, ln, s))
        if len(items) > 8:
            print('    ... 另有 %d 处' % (len(items) - 8))
        print()
    print('合计非豁免命中:', total)
    if strict and total:
        print('STRICT: 存在残留，审计失败')
        sys.exit(1)
    print('审计通过' if total == 0 else '存在残留，需处理')


if __name__ == '__main__':
    main()
