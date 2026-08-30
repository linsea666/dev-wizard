# Dev Wizard (开发向导)

![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![vscode](https://img.shields.io/badge/VS%20Code-1.80%2B-007ACC) ![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

一个 VS Code 启动向导：**每次打开 VSCode 都会问你"今天做什么？"**——回到上次的工作，
或从模板一键创建新工程（STC51 / STM32 / ESP32 / Python / C / C++ / 你自己的任意类型）。
配套的 `setup.ps1` 把 SDCC、ARM GCC、OpenOCD、Python 等工具链**全自动配好**，
让"新芯片的第一个工程"从半天环境配置变成一条命令。

> **今天要做什么？ What are we doing today?**
>
> 📂 继续上次的工作 / Continue last work
> ──── 开始新工程 / New project ────
> 🧩 新建 STC51 工程 … 🔩 STM32 … 📡 ESP32 … 🐍 Python … ✨ 你自己的任意类型
>
> *（不做出选择，向导就一直停留在屏幕上）*

<p align="center"><i>(screenshot placeholder — run the wizard and press PrintScreen 🙂)</i></p>

## 这个项目解决什么问题 / The problem

做嵌入式（或任何多语言）开发的人对这些场景一定不陌生：

- **环境配置是劝退第一步**。学 51 单片机想用 VSCode + SDCC 代替 Keil，
  得在网上翻半天教程：装编译器、配头文件路径、改链接参数……配完自己都
  记不清动过哪些地方，换台电脑全部重来
- **每换一种芯片就换一套 IDE**。51 用 Keil，STM32 用 CubeIDE，ESP32 又是
  ESP-IDF——快捷键、构建流程、烧录方式全都不一样
- **开新工程没有仪式感，全是体力活**：复制上一个工程 → 删旧代码 → 改工程
  名 → 改配置 → 祈祷还能编译

Dev Wizard 把这三件事全部自动化：

1. **`setup.ps1` 一键配环境**——工具链自动下载安装、模板自动生成、扩展自动
   装好、VSCode 配置自动写好（已有环境自动复用，不重复下载）
2. **向导一键建工程**——模板就是"一个能编译的完整工程"，选类型、起名字，
   复制-改名-打开一气呵成
3. **统一的开发体验**——所有芯片都在同一个编辑器里：同样的快捷键、同样的
   构建按钮（F7）、同样的产物目录

## 服务对象 / Who is this for

| 你是… | 你会得到… |
|---|---|
| **单片机初学者** | 跑一遍 `setup.ps1`，环境、模板、编译按钮全部就位。51/STM32 之旅从写代码开始，而不是从配环境开始 |
| **多平台嵌入式开发者** | STC51、STM32、ESP32 换着做？新工程零成本起步，工具链路径一次配好终身受用 |
| **老师 / 实验室管理员** | `setup.ps1` 幂等可重复执行，给整个机房统一部署开发环境就一行命令 |
| **任何 VSCode 重度用户** | 工程类型完全由你的模板目录决定——加一种语言/平台/框架，就是往文件夹里放一个目录 |

## 设计哲学 / Design notes

- **向导只是入口，模板才是资产**。扩展本体刻意保持两百行以内；每个模板
  是一个"能编译的完整工程"，沉淀的是工具链配置经验
- **模板即文件夹**。没有 DSL、没有构建步骤——放一个目录就能出现在向导里，
  分享模板 = 分享文件夹
- **零依赖**。纯 VSCode API，不拖 node_modules，clone 即源码，zip 即安装包

## Quick start / 快速开始（Windows 10/11，推荐）

clone 之后跑一个脚本，脚本会把 **STC51(SDCC)、STM32(ARM GCC)、OpenOCD、Python**
全部装好、模板生成好、扩展装好、VSCode 配置写好——然后你就可以直接用了：

```powershell
git clone https://github.com/linsea666/dev-wizard
cd dev-wizard
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

跑完重启 VSCode，向导弹出，**六种工程全部 F7 直接编译**。全程约 10-20 分钟
（取决于网速，下载约 300 MB）。

<details>
<summary><b>setup.ps1 到底做了什么？（点开看明细）</b></summary>

| 步骤 | 内容 | 下载源 | 大小 |
|---|---|---|---|
| 1 | 询问安装位置（默认 `C:\dev`，检测到已有安装可复用） | — | — |
| 2 | SDCC 4.x（8051 编译器） | 清华 TUNA / MSYS2 源 | ~10 MB |
| 3 | Arm GNU Toolchain 13.2（STM32 编译器） | GitHub Release（ghfast.top 加速） | ~250 MB |
| 4 | OpenOCD 0.12（STM32 烧录调试） | GitHub Release（ghfast.top 加速） | ~30 MB |
| 5 | Python 3.12 + 清华 pip 源 | npmmirror 镜像 | ~26 MB |
| 6 | 生成模板库（自动替换路径占位符） | 本仓库 | — |
| 7 | 安装扩展：EIDE / Python / Cortex-Debug / CMake Tools / 本扩展 | VSCode 市场 | — |
| 8 | 合并写入 VSCode 用户设置（已有设置会先备份为 `settings.json.bak-setup`） | — | — |

- **幂等**：随时可重跑，已安装的工具自动跳过；下载中断重跑即可续上
- **不覆盖**：已有 VSCode 设置只会合并更新工具链路径，其他键原样保留
- 工具链目录布局：`<安装位置>\sdcc`、`\xpack-arm-none-eabi-gcc-*`、`\xpack-openocd-*`、`\python312`、`\templates`、`\projects`
</details>

> **前置条件**：仅 Windows 10/11 + 已安装 VSCode（勾选"添加到 PATH"）。
> 没装 VSCode？脚本会明确报错提醒。macOS/Linux 用户请参考下方手动安装。

## Install / 安装教程（已有环境的用户）

> 如果你像仓库作者一样已经配好了各工具链，可以跳过 setup.ps1，手动安装扩展 +
> 指向自己的模板目录即可；无需编译、无需 node_modules，一分钟装好。

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

- `.eide/eide.yml` (EIDE ≥ 3.27) or `.eide/eide.json` (older) → its `name`
  field is set to the project name
  ([EIDE](https://marketplace.visualstudio.com/items?itemName=cl.eide) embedded projects)
- a `*.code-workspace` in the template root is renamed to `<name>.code-workspace`
  and opened instead of the plain folder
- the template's `build/` output folder is stripped from the copy

### Toolchain path tokens / 工具链路径占位符

Templates that reference tools installed by `setup.ps1` should use **path tokens**
instead of absolute paths — `setup.ps1` replaces them with the real locations on
each machine (so the same template works everywhere):

| Token | Replaced with | Typical use |
|---|---|---|
| `__SDCC_ROOT__` | SDCC install root | EIDE `misc-controls` include/lib flags for 8051 |
| `__ARM_GCC_ROOT__` | Arm GNU Toolchain root | custom linker paths |
| `__OPENOCD_ROOT__` | OpenOCD root | debug scripts |

Example (from the bundled STC51 template, `.eide/eide.yml`):

```yaml
misc-controls: >-
  --iram-size 128 --xram-size 0 --code-size 4096
  -I__SDCC_ROOT__/share/sdcc/include
  -I__SDCC_ROOT__/share/sdcc/include/mcs51
  -L__SDCC_ROOT__/share/sdcc/lib/small
```

> Tokens are resolved when `setup.ps1` materializes the template library.
> On machines set up without the script, put the real paths in the template
> yourself (or run setup.ps1 pointing at your existing tools folder — it
> detects and reuses installed tools).

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
