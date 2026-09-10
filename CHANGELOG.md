# Changelog

## 2.0.0

### 模板生态（方向 4）

- **Manifest v2**：`.wizard.json` 支持新字段，旧版 v1 manifest 无需任何修改即可继续使用
  - `variables`：命名变量提问，创建时逐个弹窗输入，然后递归替换 `{{name}}` 占位符
  - `defaultName`：预填工程名输入框
  - `exclude`：glob 模式，拷贝模板时跳过匹配的文件/目录（默认仍排除 `build/`）
  - `afterCreate`：工程创建后自动执行的命令列表（每个命令弹窗确认后执行）
  - `sort`：排序权重，控制模板在向导列表中的显示顺序（小者在前）
- **模板注册表（Registry）**：从 GitHub 一键安装/更新/卸载社区模板
  - 支持 `owner/repo` 简写、完整 URL、SSH 地址
  - 主路径 `git clone --depth 1`，备用路径直连 GitHub ZIP（不依赖本地 git 配置）
  - 状态持久化到 `.registry.json`
  - 命令：`Browse Templates` / `Install Template` / `Update Templates` / `Uninstall Template`
- **模板体检（Template Doctor）**：扫描模板目录，输出结构化健康报告
  - manifest 字段校验、引用文件存在性检查
  - 未定义令牌检测（已过滤 C++ `#include <header>` 和 HTML 标签的误报）
  - afterCreate 命令 PATH 可达性检查
  - 命令：`DevWizard: Template Doctor`

### 开发体验（方向 5）

- **智能构建探测**：自动识别工程类型（EIDE / CMake / Makefile / PlatformIO），状态栏一键构建
- **一键烧录**：按工程类型自动选择烧录工具
  - STM32 → openocd
  - STC51 → stcgal + 串口自动探测
  - ESP32 → idf.py
- **串口自动探测**：扫描系统 COM 端口，辅助烧录工具选择
- **context.md 自动生成**：工程创建后自动写入 `.dev-wizard/context.md`，包含工程名/类型/MCU/构建命令/烧录命令/工具链路径，AI 助手打开工程即有准确上下文
- **git init**：工程创建后可选自动初始化 git 仓库 + initial commit

### setup.ps1 组件化

- `-Component sdcc,mingw`：只安装指定组件（修复模式）
- `-OnlyFix`：自动检测缺失组件并安装
- `-NoDownload`：只处理模板/设置（假定工具链已存在）
- 安装完成后写入 `toolchain.json` 版本记录

### 架构演进

- 模块化 `src/` 目录：`manifest.js` / `registry.js` / `template-doctor.js` / `experience.js`
- 延迟加载 `vscode` 模块，支持脱离 VS Code 宿主独立运行单元测试
- `make-vsix.ps1` 更新为递归打包 `src/**/*.js`
- 版本号 1.2.0 → 2.0.0

## 1.2.0

### New: conda environment picker for Python projects

- Templates can now declare `"pythonEnv": true` in their `.wizard.json`
  manifest (the shipped `python-base` template does). When such a template is
  picked, the wizard **asks which conda environment to bind** and writes the
  chosen interpreter into the new project's `.vscode/settings.json`
  (`python.defaultInterpreterPath`) — so a project created by the wizard runs
  against the exact Anaconda/Miniconda env you picked, while other projects
  keep their own interpreters.
- Conda installs are auto-discovered from `devWizard.condaRoot` (new setting,
  explicit override), `python.condaPath`, and the usual install locations
  (`%USERPROFILE%\anaconda3|miniconda3`, `%LOCALAPPDATA%\...`, `%ProgramData%\...`,
  `~/anaconda3|miniconda3`). The `base` env plus every folder under `envs\`
  that contains a Python interpreter is offered; picking "skip" (or having no
  conda at all) keeps the previous behaviour untouched.
- `setup.ps1` and the bundled portable Python 3.12 remain unchanged — conda is
  purely optional and never written to PATH by this extension.

## 1.1.3

### Setup script bugfix (critical for Chinese-Windows users)

- **Fixed `setup.ps1` failing to even start on systems with a non-UTF-8 OEM
  code page (e.g. Chinese Windows, GBK / 936).** The script ships with Chinese
  comments/strings but had **no UTF-8 BOM**, so PowerShell 5.1 read it as GBK and
  mangled the quote characters inside Chinese strings → `ParserError` ("表达式中
  包含意外的标记", script never ran). Added a **UTF-8 BOM** to `setup.ps1`,
  `make-vsix.ps1` (invoked by the extension-packaging step) and
  `docs/demo-frames/shot.ps1`.
- **Verified in a clean VS Code sandbox** (isolated `APPDATA`/`USERPROFILE`/
  `PATH`, real `setup.ps1` executed end-to-end): all 10 steps complete, CMake
  3.30 + MinGW-w64 gcc/g++ 14.2.0 deploy correctly, and C / C++ / `std::thread`
  compile → link → run, plus a CMake `MinGW Makefiles` configure + build + run,
  all with exit code 0.

## 1.1.2

### Setup script (A7: C/C++ toolchain one-click deploy)

- `setup.ps1` now also installs the **C/C++ build environment** so the
  `c-base` / `cpp-base` templates compile out of the box:
  - **CMake 3.30** (portable build) → `<ToolsRoot>\cmake-*`, and its `bin` is
    added to the user PATH and written to `cmake.cmakePath`.
  - **MinGW-w64 GCC/G++** (TUNA / MSYS2 mirror) → `<ToolsRoot>\mingw64`, a
    complete **merged / self-contained** tree: gcc/g++ plus the `cc1` runtime
    DLLs (gmp/mpc/mpfr/isl/winpthread/iconv/zlib), **binutils** (`as`/`ld`/
    `ar`), the MinGW-w64 CRT (`crt-git`: crt2.o / libmingw32 / libmingwex /
    libmsvcrt), the Windows headers (`headers-git`: windows.h),
    `winpthreads` (pthread.h + libpthread.a, needed for C++ `<thread>`),
    `make` (`mingw32-make.exe`, needed by CMake's "MinGW Makefiles"
    generator), `gettext-runtime` (libintl-8.dll, linked by binutils/make) and
    `windows-default-manifest` (default-manifest.o, required by `ld` at link
    time). `mingw64\bin` is added to the user PATH. **Verified end-to-end**:
    gcc/g++ compile, link and run C / C++ / `std::thread` programs, and CMake
    configures + builds with the MinGW Makefiles generator.
- VS Code setting `cmake.cmakePath` is now written during setup.
- The 8 toolchains the doctor checks are now all deployed by `setup.ps1`
  (embedded 5 + CMake + MinGW-w64 gcc/g++), so a fresh machine passes the
  environment check with no manual steps.
- Setup walkthrough renumbered to 10 steps (was 8); `README` C/C++ section and
  directory-layout / PATH notes updated accordingly.

## 1.1.1

### Wizard

- Added `sea.devWizard.doctor` command (环境体检): a quick ✅/⚠/✗ check of
  VS Code version, the 4 required extensions (EIDE / Cortex-Debug / CMake Tools
  / Python), 8 toolchains on PATH, `templatesRoot`, and EIDE toolchain paths.
- New project-location picker: after naming, the wizard asks where to put the
  project (default `projectsRoot`, falling back to `templatesRoot`) instead of
  a hard-coded `projects` folder.
- STM32 template now offers a second-level MCU picker (F103C8T6 / F407VGT6 /
  G030F6P6); the chosen chip is substituted into the project via the `<mcu>`
  token.
- Exit option renamed to "退下吧，我自己来 / I'll take it from here" (the
  stay-on-screen-until-a-choice behaviour is intentional and unchanged).

### Docs

- README expanded with an environment-check walkthrough, the project-location
  picker, the STM32 MCU picker, and the `<mcu>` token; tutorial text now uses
  the renamed exit label consistently.

### Setup script

- **Fixed a critical fresh-machine bug**: the MSYS2 SDCC package needs runtime
  DLLs (`libgcc_s_seh-1`, `libstdc++-6`, `libwinpthread-1`, `libintl-8`,
  `zlib1`) that are not bundled with it. `setup.ps1` now also installs
  gcc-libs / libwinpthread / gettext-runtime / libiconv / zlib into the SDCC
  folder, so `sdcc.exe` starts on machines without any other MinGW toolchain
  on PATH. (Verified end-to-end: 8051 blink compiles with a stripped PATH.)
- Downloads are now validated by magic bytes (zstd/zip/gz) so a mirror error
  page can no longer pass as a successful download.
- `setup.ps1` now installs **stcgal** via pip (EIDE spawns bare `stcgal` for
  STC51 flashing - previously it was never installed).
- `setup.ps1` adds the portable python, its Scripts dir and `sdcc\bin` to the
  **user PATH** (idempotent; skipped with guidance when the PATH uses
  `%variables%`).

## 1.1.0

- Templates are now discovered dynamically from `devWizard.templatesRoot`
  (any subfolder = one wizard entry, optional `.wizard.json` manifest)
- Added C and C++ (CMake) templates
- Wizard stays on screen until a real choice is made (re-shows if dismissed)

## 1.0.0

- Startup wizard: continue last work / new project from fixed template list
- STC51, STM32, ESP32, Python templates
- Persistent until choice; auto-open new project workspace
