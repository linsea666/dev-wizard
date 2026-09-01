# Changelog

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
