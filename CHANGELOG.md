# Changelog

## 2.2.0

### Interaction overhaul (A 系列)

- **Wizard menu decluttered**: the five MCU templates (STC89 / STC15 /
  AT89S51 / STM32 / ESP32) collapse into one 「嵌入式工程 / Embedded」 entry;
  a second-level picker lists every chip with its name spelled out in full
  (core, flash size, toolchain, flashing method, hardware needed). Templates
  opt in via the new `.wizard.json` fields `group` / `pick` / `sort` —
  custom templates can use the same mechanism (unknown groups fall back to
  their id as the menu label).
- **Wizard is dismissable with Esc.** Pressing Esc / closing the startup
  quick pick no longer re-shows it in a loop — it stays closed with a hint
  that the command palette brings it back anytime. Set
  `devWizard.persistOnEsc: true` to restore the old "stays until you choose"
  behaviour. Cancelling a sub-step (name / location / chip) still returns to
  the main menu.
- **Flash command reworked** (`Dev Wizard: flash`):
  - MCU is auto-detected from `.dev-wizard/context.md` / `.eide/eide.yml`,
    and the STC protocol comes from the template's `.eide/stc.flash.json`
    (the same config EIDE's own flash button uses) — no more typing
    `STM32F103C8T6` by hand; only truly unknown projects ask, with a
    common-chips quick pick.
  - STC sub-family protocols auto-mapped (`STC89*` → `stc89`,
    `STC15*` → `stc15`); exotic families get a protocol picker instead of a
    silent wrong guess.
  - Artifact lookup fixed: scans `build/Debug/`, `build/`, `.` and prefers
    `<project>.hex` (EIDE's actual output name) — the old code only knew
    `main.hex`/`firmware.hex` and silently flashed a glob.
  - Last-used serial port is remembered per workspace and preselected.
  - **Everything runs in the integrated terminal** (visible output, re-runnable)
    and STC flashing shows the cold-boot hint ("give the board a power cycle")
    *before* starting — the #1 beginner trap.
- **Project-created toast now has actions** — [打开 README] / [立即构建]
  appear in the freshly opened project window instead of a plain message.
- **Doctor is actionable**: pass/fail summary in the header, clicking a
  missing extension opens its marketplace page, `stcgal` offers a copyable
  `pip install stcgal`; the list re-runs after an action, Esc exits.
- **Status bar** shows `<TYPE> · <MCU>` and opens a quick menu
  (build / flash / doctor / context.md / git init) instead of hardwiring build.
  Also fixed: an empty window no longer pops "请先打开一个工程文件夹" on
  every startup (status bar detection is silent now).

### Template fixes

- `stc51-base`: removed the bogus `__SDCC_ROOT__` include/lib flags from
  `misc-controls` (EIDE does not expand that token — same bug class fixed
  for `at89s51-base` in 2.1.1; it made every STC15 EIDE build fail). sdcc
  knows its own include/lib paths; sizes kept (4K ROM / 128B IRAM).
- New in 2.2.0 line: `stc89-base` template for **STC89C51RC** (EIDE + SDCC,
  builtin stcgal uploader with `-P stc89`, onboard LED @ P2.2 blink demo).

### Docs

- README rewritten to be concise (~140 lines); the full step-by-step tutorial
  moved to `docs/tutorial.md`.

## 2.1.2

### Feature: AT89S51 template now defaults to Keil C51 syntax

- `at89s51-base` gains `build-keil.ps1`: builds with the local Keil C51
  toolchain (C51 → BL51 → OH51) so textbook Keil syntax (`sfr` / `sbit` /
  `data` / `code` / `interrupt ... using` / `<reg51.h>`) compiles unchanged.
  Finds Keil via `-KeilRoot` / `KEIL_ROOT` / known install dirs.
- Keil build is the default `Ctrl+Shift+B` task; SDCC/EIDE tasks kept.
- `src/main.c` is now Keil-style; the previous SDCC demo lives on as
  `src/main_sdcc.c.example` (swap the two names to go back to F7/SDCC).
- `src/board.h` auto-switches headers per compiler (`__SDCC` → `at89x51.h`,
  otherwise Keil `reg51.h` with `sbit` pin defines).
- IntelliSense config now maps both Keil and SDCC keywords (known cosmetic
  limit: the `interrupt 1 using 1` line still squiggles in the editor).
- Doctor: new check for Keil C51 presence.

## 2.1.1

### Fix: AT89S51 projects could not be opened in EIDE

- **`at89s51-base/.eide/eide.yml` was missing `uploader` / `uploadConfigMap`.**
  EIDE's project loader runs `target.uploadConfig = target.uploadConfigMap[target.uploader]`,
  so a project without those keys made `_OpenProject` throw
  `TypeError: Cannot read properties of undefined (reading 'undefined')` — the
  whole `.eide` project failed to load (no build, no config tree).
  The template now ships `uploader: Custom` with an `avrdude -c usbasp -p at89s51`
  command line, which also gives a working flash button in EIDE (EIDE's own
  programmers — stcgal / OpenOCD / pyOCD / JLink / STLink — cannot drive an
  AT89S51, which is SPI-ISP on P1.5/P1.6/P1.7).
- **Dropped the bogus `-I` / `-L` paths from `misc-controls`.** They were written
  with a `__SDCC_ROOT__` placeholder that EIDE does not know, plus quotes that
  would have been passed to `sdcc` verbatim. `sdcc.exe` already knows its own
  include and library directories, so the flags are gone and the template is now
  machine-independent.
- **`build.ps1` now emits the same artifact as EIDE**: `build\Debug\<project>.hex`
  (the project name is read from `.eide/eide.yml`). Before it wrote
  `build\main.hex`, so the two build paths disagreed about where the hex was.
  `-Clean` now deletes only this script's own outputs instead of the whole
  `build\Debug\` (which also holds EIDE's `.obj` and `ref.json`).

### New: template doctor catches this class of bug

- `inspectTemplate()` now also checks EIDE project templates: every
  `targets.<name>` block must have `toolchain`, `uploader` and `uploadConfigMap`,
  and `uploader` must be one EIDE knows (`JLink` / `STLink` / `stcgal` / `STVP` /
  `pyOCD` / `OpenOCD` / `probe-rs` / `Custom`). Missing keys are reported as
  errors instead of surfacing later as an unreadable project.

## 2.1.0

### New: AT89S51 (classic 8051) build environment

- **New template `at89s51-base`** — an EIDE `C51` project wired for SDCC's
  `mcs51` target: 128 B IRAM / 0 XRAM / 4 KB code (AT89S51), `src/main.c` blank
  entry with an LED-blink demo, `src/board.h` for pins and crystal, and register
  access through SDCC's own `<at89x51.h>` — no Keil `reg51.h` copy needed.
- **Standalone build script `build.ps1`** ships with the template, so the project
  also compiles without EIDE (and without `make`): it locates SDCC
  (`-SdccRoot` → `SDCC_ROOT` → `PATH` → common install dirs), compiles,
  converts `.ihx` → `.hex` with `packihx`, and prints Flash/RAM usage out of
  `main.mem`. `-Clean`, `-Flash` (USBasp + avrdude) and `-CodeSize`
  (AT89S52 = 8192) are supported; two matching tasks were added to the
  template's `tasks.json`.
- **Flash support in `experience.js`**: `AT89*` MCUs are recognised —
  `buildFlashCommand` now builds an
  `avrdude -c usbasp -p at89s5x -U flash:w:<hex>:i` invocation (with an explicit
  hint when avrdude is not installed), and `.dev-wizard/context.md` records the
  right build/flash command, including the `build.ps1` shortcut for EIDE
  projects that carry one.
- **Doctor additions**: `packihx` and `avrdude` are probed (avrdude is optional
  — missing shows ⚠ instead of ✗), the SDCC version is read from `sdcc -v`, and
  the EIDE toolchain paths are checked for actual existence (dir + `bin\`).

> EIDE's built-in uploaders (stcgal / openocd / pyocd / jlink / stlink) cannot
> program AT89S51 — use avrdude + USBasp, or a programmer GUI such as ProgISP.
> Note that `at89s51-base` is distributed through the repo (`templates/`, not
> bundled in the .vsix): install it with *Dev Wizard: install template* →
> `linsea666/dev-wizard:templates/at89s51-base`, or drop the folder into
> `devWizard.templatesRoot`.

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
