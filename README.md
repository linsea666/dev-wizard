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

## Install / 安装教程

> 无需编译、无需 node_modules，一分钟装好。

### 第 1 步：拿到 VSIX 安装包

**方式 A（推荐，直接下载）**：安装包就在本仓库里——
下载 [`dev-wizard-1.1.0.vsix`](https://github.com/linsea666/dev-wizard/raw/main/dev-wizard-1.1.0.vsix)。

> GitHub 直连慢？用加速链接下载：
> `https://ghfast.top/https://github.com/linsea666/dev-wizard/raw/main/dev-wizard-1.1.0.vsix`

**方式 B（从源码打包）**：

```powershell
git clone https://github.com/linsea666/dev-wizard.git
cd dev-wizard
powershell -ExecutionPolicy Bypass -File scripts/make-vsix.ps1
# 生成 dev-wizard-1.1.0.vsix
```

### 第 2 步：安装（二选一）

**图形界面**（鼠标点两下）：

1. 打开 VSCode → 左侧扩展面板（`Ctrl+Shift+X`）
2. 点面板标题栏右上角的 `···`
3. 选 **从 VSIX 安装...(Install from VSIX...)**
4. 选中下载好的 `.vsix` 文件

**命令行**：

```powershell
code --install-extension .\Downloads\dev-wizard-1.1.0.vsix
```

### 第 3 步：重启 VSCode

`Ctrl+Shift+P` → 输入 **Reload Window（重新加载窗口）** → 回车。
启动后向导自动弹出。

### 第 4 步：告诉向导你的模板放在哪（首次使用必做）

向导的工程类型来自 `devWizard.templatesRoot` 指向的目录——**每个子文件夹就是一个工程类型**：

```jsonc
// VSCode 设置 (Ctrl+, 打开 settings.json)
{
    "devWizard.templatesRoot": "D:/my-templates",   // 你的模板库
    "devWizard.projectsRoot":  "D:/my-projects"     // 新工程的存放位置（可省略）
}
```

还没有模板？随便建个文件夹，往里放一个能编译/运行的小工程，再放一个可选的
`.wizard.json` 描述文件（详见下方 [Authoring templates](#authoring-templates--编写模板)），
它就会出现在向导里。

### 第 5 步：验证

重启后向导自动弹出，选择一种工程类型 → 输入工程名 → 自动创建并打开。
按 Esc 关掉向导？它会自动弹回来——**只有做出选择它才会消失**。
想再次唤出：`Ctrl+Shift+P` → **Dev Wizard: what are we doing today?**

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
