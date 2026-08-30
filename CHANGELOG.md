# Changelog

## 1.1.0

- Templates are now discovered dynamically from `devWizard.templatesRoot`
  (any subfolder = one wizard entry, optional `.wizard.json` manifest)
- Added C and C++ (CMake) templates
- Wizard stays on screen until a real choice is made (re-shows if dismissed)

## 1.0.0

- Startup wizard: continue last work / new project from fixed template list
- STC51, STM32, ESP32, Python templates
- Persistent until choice; auto-open new project workspace
