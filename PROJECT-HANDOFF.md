# Dev Wizard 项目交接报告

> 交接时间：2026-08-31 ｜ 交接人：ZCode 会话（GLM）｜ 接收方：任意 AI 智能体
> 本报告自包含全部上下文，无需查阅历史会话即可继续开发。

---

## 1. 项目概况

| 项 | 值 |
|---|---|
| 项目名 | **Dev Wizard（开发向导）** —— VS Code 启动向导扩展 |
| 功能 | 每次 VSCode 启动弹出向导：继续上次工作 / 从模板一键新建工程（STC51、STM32、ESP32、Python、C、C++，可自定义）；配套 `setup.ps1` 一键装齐全部嵌入式工具链 |
| 仓库 | https://github.com/linsea666/dev-wizard （公开，MIT，作者 GitHub 用户名 **linsea666**，本机 Windows 账户名 sea） |
| 版本 | 扩展 v1.1.0 ｜ 仓库 HEAD `712ea1d`（main；`7526345` 已推送，其上有 1 个**未推送**的本地提交 `712ea1d`） |
| 作者本地副本 | `E:\vscode\dev-wizard`（2026-08-31 从 GitHub 重新克隆） |
| 目标用户 | 单片机初学者 / 多平台嵌入式开发者 / 机房管理员（Windows 10/11 专用脚本，扩展本体跨平台） |

## 2. 代码地图（仓库根目录）

```
extension.js          # 扩展全部逻辑（272 行，零依赖，纯 vscode API）
package.json          # publisher "sea"，v1.1.0，activationEvents onStartupFinished
scripts/setup.ps1     # 一键环境配置（PowerShell 5.1 兼容，8 步，幂等）
scripts/make-vsix.ps1 # 纯 PowerShell 打包 vsix（无需 npm/vsce）
templates/            # 6 个工程模板（stc51/stm32/esp32/python/c/cpp-base）
docs/demo-frames/     # 向导截图 f1/f3.png（README 引用）
dev-wizard-1.1.0.vsix # 扩展包（不再入库：make-vsix.ps1 生成 / CI 产物 / GitHub Release 下载）
README.md / CHANGELOG.md / LICENSE(MIT)
```

### extension.js 核心机制
- `devWizard.templatesRoot`（必设）下每个子文件夹 = 一个模板；可选 `.wizard.json` 清单定义 label/description/icon/open/replace
- 创建工程 = 复制模板 → 删 build/ → 改 EIDE 工程名（`.eide/eide.yml` 的 `name:`，兼容旧 `.eide/eide.json`）→ 重命名 `*.code-workspace` → 应用清单 replace → 自动打开
- 向导"不选择不消失"：dismissed 后 800ms 重弹循环（`showWizard`）；`devWizard.skipNext` 全局状态防止创建工程后重弹
- 命令：`sea.devWizard.show`；设置：`showOnStartup`(默认true)、`projectsRoot`(空=用templatesRoot)

### setup.ps1 八步（已实测）
1. 探测/定位 `code` CLI（三级回退：PATH→常见目录→注册表 App Paths）
2. SDCC：清华 TUNA 的 MSYS2 源解析最新版 + **5 个运行库包**（gcc-libs、libwinpthread-git、gettext-runtime、libiconv、zlib）解压进同一 mingw64 树后改名 sdcc —— 关键：MSYS2 的 sdcc 包不带运行 DLL，缺了裸机无法启动
3. ARM GCC 13.2（xpack，ghfast.top 加速）
4. OpenOCD 0.12（xpack，同上）
5. Python 3.12 便携版（python-build-standalone）+ 清华 pip 源 + **pip 装 stcgal**（STC51 烧录器，EIDE 裸调 `stcgal` 命令）
6. 生成模板库：复制 templates/ → 替换路径 token（`__SDCC_ROOT__`/`__ARM_GCC_ROOT__`/`__OPENOCD_ROOT__`）为实际安装路径
7. 装 VSCode 扩展：cl.eide、ms-python.python、marus25.cortex-debug、ms-vscode.cmake-tools + 本扩展（现场 make-vsix 打包安装）
8. 合并写 VSCode 用户设置（先备份 `settings.json.bak-setup`；PS 5.1 需剥注释再 ConvertFrom-Json）+ 把 python312、python312\Scripts、sdcc\bin 追加到用户 PATH（幂等，PATH 含 %变量% 时跳过并提示）

**健壮性设计**：Fetch() 带 zstd/zip/gz magic-byte 校验（防镜像错误页冒充成功）；断点续传重试 8 次；每步失败不中断只告警；tar --zstd 能力探测（老 Win10 提示 7-Zip 方案）。

## 3. 本机运行环境（接手调试时需要知道）

| 路径 | 内容 |
|---|---|
| `E:\vscode\Microsoft VS Code\` | **VSCode 1.135.0 正式安装**（桌面快捷方式指向这里） |
| `E:\vscode\dev-wizard\` | 本项目本地 git 副本 |
| `E:\vscode\tools\` | sdcc(222M)、python312(130M)、xpack-arm-none-eabi-gcc-13.2.1-1.1(1.4G)、xpack-openocd-0.12.0-7、templates |
| `E:\vscode\projects\` | 用户新工程存放处（现为空） |
| `E:\embedded\` | 早于本项目的一套 ARM GCC/OpenOCD（与 tools 重复，勿混淆） |
| `%APPDATA%\Code` | **junction → E:\vscode\user-data**（VSCode 用户数据实际在 E 盘） |
| `%USERPROFILE%\.vscode` | **junction → E:\vscode\dot-vscode**（扩展实际在 E 盘，已装全部扩展） |

### ⚠️ 本机三大坑（踩过的）
1. **junction**：上面两个 NTFS 目录联接是用户数据在 E 盘的命脉。任何针对 `E:\vscode` 子目录的"清理/删除"都会连带毁掉 VSCode 用户数据（2026-08-31 已发生过一次：07:07 有外部程序批量删除了 E:\vscode 下大量目录，导致 VSCode 全系无法启动 + 用户工程源码丢失，后经重装+重建 junction 目标修复）。**动 `E:\vscode` 前必须先确认这两个 junction 目标存在。**
2. **shell 里 `python` 命令不可用**：命中 WindowsApps 占位 stub，退出码 49 且无输出。必须用绝对路径 `E:\vscode\tools\python312\python.exe`（Git Bash 写法 `/e/vscode/tools/python312/python.exe`）。
3. **Git Bash 传参**：向 Windows 原生程序传 `/FLAG` 风格参数会被 MSYS 路径转换吃掉（曾导致 Inno 静默安装变成交互模式）。用 PowerShell `Start-Process -ArgumentList` 或设 `MSYS2_ARG_CONV_EXCL='*'`。

### Git 网络配置（已调好）
- 全局配置了两条规则：拉取走 ghfast.top 代理（`url.https://ghfast.top/https://github.com/.insteadOf`），推送经 `url.https://github.com/.pushInsteadOf = https://github.com/` 恒等重写**直连**（用户网络直连 github 时通时断，ghfast 代理不支持 push）
- GitHub 凭据已存 Windows 凭据管理器（`git:https://github.com`，用户 linsea666），push 免交互
- 提交署名用 `linsea666 <271138701+linsea666@users.noreply.github.com>`（用户明确要求贡献者只显示 linsea666）

## 4. 本次会话完成的工作（全部已推送 GitHub）

1. **修复裸机致命 bug**：MSYS2 SDCC 包不带运行库 DLL，新机器装完 `sdcc.exe` 无法启动（此前在作者机器上能跑纯属 PATH 残留旧 SDCC 提供了 DLL）。setup.ps1 现已补齐 5 个运行库包 → 修复后净 PATH 下 8051 点灯程序完整编译出 HEX。
2. **修复 PS 5.1 脚本崩溃**：pip/tar 的 stderr 重定向在 `$ErrorActionPreference="Stop"` 下触发 NativeCommandError 中止整个脚本。相关调用已改为临时 Continue + 文件存在性检测代替 `pip show`。
3. **健壮性增强**：下载 magic-byte 校验；tar --zstd 探测；装 stcgal；python/sdcc 入用户 PATH。
4. **README 重写为详细教程**（commit defe1b4）：0~5 步快速开始（含截图）、六种工程类型指南（51 接线/烧录/晶振、STM32 F5 调试）、FAQ、11 条排障表、卸载章节。
5. **全流程从零验证通过**（2026-08-31，方法见 §5）。
6. 事故恢复：E:\vscode 遭外部批量删除后，重装 VSCode、重建 junction 目标、重装扩展、从测试环境免下载恢复全部工具链与模板。

Git 提交：`eca2773`（setup 修复）、`defe1b4`（README 教程）、`7526345`（changelog）。

---

## 4b. 2026-09-01 干净电脑模拟验证（WorkBuddy 智能体补做）

接手人按 §1 仓库信息，在 `E:\workbuddy work\clean-verify\` 搭建完全隔离的沙箱（伪造 `APPDATA` / `USERPROFILE` + `code.cmd` 代理把 Code.exe 接到沙箱 `--user-data-dir` / `--extensions-dir`），从 GitHub 全新克隆后跑真实 `setup.ps1`：

- 16m55s 零重试零告警，下载 + 安装 + 6 模板 + 12 扩展全部成功（退出码 0）
- 幂等性重跑 22s，全部 "already installed"
- 净 PATH 工具链自包含性逐项核对：ARM GCC（text 808 B 与原记录吻合）、Python、stcgal、OpenOCD 自包含；**SDCC 不自包含**（见 §5.2 修正）
- 扩展本体用 Node + vscode 桩件驱动 3 场景全过：列模板、建 STC51 工程（eide.yml 改名 + workspace 重命名 + openFolder）、无模板引导
- 真实最初始 VSCode 启动后向导弹窗准确出现（截图 `clean-verify\logs\vscode-wizard.png`）
- 真实环境零污染（用户 PATH 356→356、settings 哈希一致、扩展 27→27，全部由驱动器自动备份 + 还原）
- 沙箱路径恰好含 "workbuddy work"（一个空格）→ 暴露 STC51 `eide.yml` 的 `misc-controls` 路径未加引号的潜在 bug

修复：`712ea1d` —— STC51 模板三个 -I/-L 参数用双引号包起，ToolsRoot 含空格也能用。沙箱验证：`fix-verify.ps1` 引号感知解析后 9 个原子 token、3 个完整路径、0 断裂。

## 5. 验证记录（回归测试方法论，可直接复用）

从零模拟"新用户新电脑"四阶段，全部通过：
1. **全新 clone** GitHub 公开仓库 → 空目录跑 `setup.ps1`（真实下载 ~310MB，退出码 0；重跑验证幂等）
2. **净 PATH**（仅 System32）下逐项验证工具链自包含：
   - ARM GCC 13.2.1（xpack）—— **完全自包含**，按 eide.yml 的 EIDE 配置手工全量构建（11 个源文件 + startup + 模板 .ld + `--specs=nano/nosys` `-Wl,--gc-sections`）产出 16 080 B 的 fw.elf（text 段 **808 B**，与上次会话记录完全吻合）。
   - Python 3.12.7 + stcgal 1.10 + OpenOCD 0.12.0 —— **完全自包含**，独立可跑。
   - **SDCC 4.6.0 —— 不完全自包含**：它会 shell 出去调 `sdcpp.exe`，净 System32 PATH 下报 `'"sdcpp.exe"' 不是内部或外部命令`。`setup.ps1` 第 8b 步把 `sdcc\bin` 加进用户 PATH 后正常；**写本文档时 setup 默认配置可用，但"净 PATH 自包含"对 SDCC 不成立**——若用户手动从 PATH 删掉 `sdcc\bin` 又会断。
3. **全新 VSCode 档案**（`--user-data-dir`/`--extensions-dir` 隔离）：GUI 安装 vsix → 向导自动弹出显示 6 模板 → 建 STC51 工程成功（eide.yml 改名 + workspace 重命名 + 自动打开）
4. 未配置 templatesRoot 时向导正确显示"未找到模板"引导

## 6. 已知问题 / 风险

- **用户源码丢失**：原 `E:\vscode\projects` 下 stc51-dev、stc51-test、stm32-blink 三个用户工程在删除事件中丢失（仓库不受影响）。projects 现为空。
- **stcgal 烧录链未实测**（无硬件）：EIDE 配的 uploader 是 stcgal，需 USB-TTL 接 P3.0/P3.1、断电重进 ISP；`stc.flash.json` 默认 oscFreq=16MHz 需按板子调整。这是 README 承诺中唯一未经真机验证的环节。
- **ESP32 / C/C++ 模板未端到端实测**：ESP32 仅骨架（需用户自装 ESP-IDF）；C/C++ 需自装 MinGW/MSVC——README 已如实说明。
- **github 直连间歇性不通**：push 失败先重试；fetch 已走代理不受影响。
- VSCode 更新器在 `E:\vscode` 根留下的 `unins000.*` 是旧卸载器残留（无害）。
- **SDCC 不完全自包含**（见 §5.2）：clean PATH 下编译会断；依赖 `setup.ps1` 第 8b 步加 `sdcc\bin` 进用户 PATH。**已修**——如该步被用户手动回滚会复发。
- ~~**eide.yml misc-controls 未加引号**（commit `712ea1d` 已修）~~：旧版 STC51 模板的 `-I__SDCC_ROOT__/share/sdcc/include` 在 ToolsRoot 含空格（如 `C:\Program Files\dev`）时按空白切分后路径被截断。`712ea1d` 把三个 -I/-L 参数用双引号包起，干净电脑沙箱实测通过。
- ~~**仓库里跟踪的 `.vsix` 是过期产物**~~：原提交的 `dev-wizard-1.1.0.vsix` 是 README/CHANGELOG 重写前的旧包。已在本次提交将其从 git 索引移除（`.gitignore` 已有 `*.vsix`），扩展包不再入库，统一由 `make-vsix.ps1` 生成、CI 上传为 artifact、或走 GitHub Release。
- ~~**`.vsix` 不可复现**~~：已修（`make-vsix.ps1`）。所有文本统一规范为 LF、XML 去 BOM、zip 条目时间戳固定为 1980-01-01；同版本同源码两次构建 SHA256 一致（实测 `8E3B16EE…FE05`），且不再受调用方 `core.autocrlf` 影响。

## 7. 建议待办（按优先级）

1. 找一台真机 + STC15 板子验证 stcgal 烧录链，补进 README
2. 考虑扩展发布到 VSCode Marketplace（当前需手动装 vsix；publisher 是 "sea"，若要用 linsea666 需改 package.json + 重打包升 1.1.1）
3. `--user-data-dir`/`--extensions-dir` 场景的 README 补充（VSCode 便携模式用户）
4. 模板分享机制（用户把 templates 目录打包分享已是现状，可做导入命令）
5. ~~CI：GitHub Actions 跑 PowerShell 语法检查 + make-vsix 冒烟测试（已加 `.github/workflows/ci.yml`，push/PR 触发；本地用 `sim-ci.ps1` 模拟验证 PASS）~~

## 8. 关键命令速查

```powershell
# 本地副本：E:\vscode\dev-wizard
# 打包扩展
powershell -ExecutionPolicy Bypass -File scripts/make-vsix.ps1
# 一键环境（幂等，可重跑）
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 [-ToolsRoot D:\dev] [-NoDownload]
# 安装扩展到本机 VSCode
E:\vscode\Microsoft VS Code\bin\code.cmd --install-extension dev-wizard-1.1.0.vsix
# python 一律用绝对路径
E:\vscode\tools\python312\python.exe
# 净 PATH 工具链冒烟测试
$env:PATH='C:\Windows\System32;C:\Windows'; E:\vscode\tools\sdcc\bin\sdcc.exe --version
```
