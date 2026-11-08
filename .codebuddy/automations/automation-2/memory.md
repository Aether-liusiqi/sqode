# 构建守护：失败自动修复重试（automation-2）

## 2026-10-30 03:09 轮次

状态：已修复根因并重启构建，构建进行中（`prepare:runtime` → `prepare:primary-runtime`）。

根因（第 5 个环境坑，已验证）：`@electron/get` 的缓存键 = sha256(URL 的目录部分)。本机缓存只有 npmmirror 键
`76389d15…`(v44.0.0)，github 键 `16cfa46e…` 不存在，而 github.com:443 不通，导致 `download:electron` 无限挂起。

验证：用最小脚本调 `downloadArtifact`，带 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
3.1 秒命中缓存返回；不带则无响应。

处置：`sqode_prep_build5.py` 新增 `env['ELECTRON_MIRROR']`（另四项环境处理保持原样）。03:01:49 重启，
`download:electron` 已 success=true，`extract:electron`、`prepare:cli` 亦通过。已设 standby-timeout-ac 0，
构建结束前不再改睡眠设置。

上轮（01:24）曾按「同一根因两次失败即停」只报告不动手，本轮因修复已端到端实测通过才动手。

## 排查提示（下轮直接用）
- 判定失败位置最快路径：读最新 `packaging-runs/<dir>/events.jsonl` 最后几行，有 stage-start 无 stage-end 的即卡死点。
- 不要靠 `packaging-runs` 目录名判断谁在跑；`p4b_pkg.log` 末尾出现 `ERR_PNPM` 即已结束。
- 成功判据：events 里 `windows-package` success=true + `unsigned-artifacts` 下安装包时间戳为本轮时间。
