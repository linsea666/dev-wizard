# Changelog

## Unreleased (setup script)

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
