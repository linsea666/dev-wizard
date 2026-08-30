# Dev Wizard (开发向导)

A startup wizard for Visual Studio Code. Every time you open VS Code it asks:

> **今天要做什么？ What are we doing today?**
>
> 📂 继续上次的工作 / Continue last work
> ──── 开始新工程 / New project ────
> 🧩 新建 STC51 工程 … 🔩 STM32 … 📡 ESP32 … 🐍 Python … ✨ 你自己的任意类型

Pick **continue** to jump straight back to your last project. Pick a template type,
type a project name, and the wizard copies the template, renames everything and
opens the new workspace for you — **it stays on screen until you make a choice**.

一个 VS Code 启动向导扩展：每次启动询问你今天做什么。可以一键回到上次的工作，
也可以选择工程类型、输入工程名，自动从模板复制、改名并打开新工程。
**不做出选择，向导就一直停留在屏幕上。**

<p align="center"><i>(screenshot placeholder — run the wizard and press PrintScreen 🙂)</i></p>

## Features / 特性

- **Startup wizard / 启动弹出** — optional, can be turned off in settings
- **Persistent / 不选择不消失** — dismissed by mistake? It re-appears automatically
- **Last-work shortcut / 一键回到上次工作**
- **Template driven / 模板驱动** — every subfolder of the templates folder becomes
  a wizard entry. Describe it with a small `.wizard.json` (optional)
- **Zero dependencies / 零依赖** — pure VS Code API, no node_modules
- Built-in experience tailored for embedded development (STC51 / STM32 / ESP32 /
  Python), but the templates are 100% yours — anything works

## Install / 安装

### From VSIX (easiest)

```powershell
code --install-extension dev-wizard-1.1.0.vsix
```

### From source / 从源码

```powershell
git clone https://github.com/YOUR_ACCOUNT/dev-wizard
cd dev-wizard
# VSIX = zip; or use: npm i -g @vscode/vsce && vsce package
code --install-extension dev-wizard-1.1.0.vsix
```

## Configuration / 配置

| Setting | Default | Description |
|---|---|---|
| `devWizard.showOnStartup` | `true` | Show wizard on every VS Code start |
| `devWizard.projectsRoot` | same as templatesRoot | Where new projects are created |
| `devWizard.templatesRoot` | *(empty)* | Folder of project templates — **this is the only thing you must set** |

Example:

```json
{
    "devWizard.templatesRoot": "D:/my-templates",
    "devWizard.projectsRoot":  "D:/my-projects"
}
```

## Authoring templates / 编写模板

A template is just a folder inside `templatesRoot`:

```
my-templates/
├── stc51-base/          ← template = a complete project you can already build
│   ├── .wizard.json     ← (optional) how it appears in the wizard
│   ├── .eide/eide.json
│   ├── source/main.c
│   └── ...
├── python-base/
│   ├── .wizard.json
│   └── main.py
└── anything-else/       ← no manifest? wizard shows the folder name
```

`.wizard.json` (all fields optional):

```json
{
    "label":       "新建 STC51 工程",     // list title
    "description": "SDCC + EIDE ...",     // list subtitle
    "icon":        "chip",                // any codicon name
    "open":        "workspace",           // "workspace" | "folder" (auto-detected if omitted)
    "replace": [                          // text replaced with the project name after copying
        { "files": ["CMakeLists.txt"], "find": "esp32-base" }
    ]
}
```

Automatic behaviour, no manifest needed:

- `.eide/eide.json` → its `name` field is set to the project name
  ([EIDE](https://marketplace.visualstudio.com/items?itemName=cl.eide) embedded projects)
- a `*.code-workspace` in the template root is renamed to `<name>.code-workspace`
  and opened instead of the plain folder
- the template's `build/` output folder is stripped from the copy

## Recommended companions / 推荐搭配

| Wizard type | Needs |
|---|---|
| STC51 | [EIDE](https://marketplace.visualstudio.com/items?itemName=cl.eide) + [SDCC](https://sdcc.sourceforge.net/) |
| STM32 | EIDE + Arm GNU Toolchain + OpenOCD (or ST-Link utility) |
| ESP32 | [ESP-IDF extension](https://marketplace.visualstudio.com/items?itemName=espressif.esp-idf-extension) |
| Python | [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) |
| C / C++ | [CMake Tools](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cmake-tools) + MinGW or MSVC |

## License / 许可证

[MIT](LICENSE)
