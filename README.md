# Dev Wizard (开发向导)

![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![vscode](https://img.shields.io/badge/VS%20Code-1.80%2B-007ACC) ![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

一个 VS Code 启动向导：**每次打开 VSCode 都会问你"今天做什么？"**——回到上次的工作，
或从模板一键创建新工程（STC89 / STC15 / AT89S51 / STM32 / ESP32 / Python / C / C++）。
配套 `setup.ps1` 把工具链全自动配好，"新芯片的第一个工程"从大半天环境配置
变成**一条命令 + 一次重启**；建完的工程编译（F7）、烧录、体检也全在 VSCode 里完成。

> 📂 继续上次的工作 ──── 开始新工程 ──── 🔩 嵌入式工程（选芯片：STC89 / STC15 / AT89S51 / STM32 / ESP32）· 🐍 Python · ✨ C / C++

详细图文教程（含每一步截图级别的说明）见 **[docs/tutorial.md](docs/tutorial.md)**。

## 功能一览

- **启动向导**：开机一问"今天做什么"，Esc 可收起，命令面板随时唤回
- **一键建工程**：模板就是"一个能编译的完整工程"，选类型起名字即得；Python 模板还带 conda 环境选择器
- **一键构建/烧录**：按工程类型自动选 EIDE/CMake/Makefile/PlatformIO；烧录自动识别芯片协议（STC89/STC15/AT89/STM32/ESP32），STC 烧录前提醒冷启动
- **环境体检 doctor**：扩展、工具链、模板目录一屏检查，缺什么点一下就能修
- **模板生态**：`installTemplate` 从 git 仓库装模板、`templateDoctor` 校验模板质量
- **context.md**：建工程自动生成 AI 助手上下文文件（给 Copilot/Claude 用）

## 快速开始

```powershell
git clone https://github.com/linsea666/dev-wizard
cd dev-wizard
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

重启 VSCode → 向导自动弹出 → 选模板建工程 → `F7` 编译。
`setup.ps1` 支持组件化：`-Component python` 只装单组件、`-OnlyFix` 自动补缺失（详见 [docs/tutorial.md](docs/tutorial.md)）。

已有环境、只想装扩展？手动方式： Releases 下载 `.vsix` → VSCode `扩展面板 … → 从 VSIX 安装` → 设置里把
`devWizard.templatesRoot` 指向本仓库的 `templates/` 目录。

## 内置模板

| 模板 | 芯片 | 编译 | 烧录 | 内置示例 |
|---|---|---|---|---|
| stc51-base | STC15F104W | SDCC | stcgal（串口，冷启动） | 空白入口 + stc15 库 |
| stc89-base | STC89C51RC | SDCC | stcgal `-P stc89`（串口，冷启动） | 板载 LED @ P2.2 闪烁 |
| at89s51-base | AT89S51 | Keil C51 / SDCC | USBasp + avrdude（SPI-ISP） | Keil 语法 LED + SDCC 备份 |
| stm32-base | STM32F103C8T6 等 | ARM GCC | OpenOCD（SWD） | 标准库点灯 |
| esp32-base | ESP32 | ESP-IDF | `idf.py flash` | CMake 骨架 |
| python-base | — | Python | — | main.py + conda 环境选择 |
| c-base / cpp-base | — | MinGW / MSVC | — | CMake 控制台工程 |

## 命令速查（Ctrl+Shift+P 搜 "Dev Wizard"）

| 命令 | 用途 |
|---|---|
| what are we doing today? | 打开启动向导 |
| build / flash | 一键构建 / 一键烧录（自动识别工程与芯片） |
| environment check | 环境体检（可点击修复） |
| template doctor | 模板体检（字段校验/引用检查） |
| install / update / uninstall / browse templates | 模板注册表：装/更/卸/逛 |
| write context.md | 生成/更新 AI 助手上下文 |
| git init | 初始化 git 并提交首版 |

> STC 系列烧录口诀：**点烧录 → 板子断电再上电**（STC 冷启动进 ISP，stcgal 会自动等）。

## 写自己的模板

模板 = 一个文件夹，放进 `templatesRoot` 即出现在向导里。可选的 `.wizard.json` 清单：

```jsonc
{
    "label": "新建 STC89 工程",
    "description": "SDCC + EIDE，点灯示例",
    "icon": "chip",
    "open": "workspace",          // 或 "folder"
    "mcus": ["STM32F103C8T6"],    // 二级芯片选择，填入 <mcu> 占位符
    "defaultName": "led-demo",    // 工程名默认值
    "pythonEnv": true,            // 建工程时弹 conda 环境选择器
    "variables": [],              // v2：自定义变量（{{name}} 占位）
    "exclude": ["build/"],        // 复制时排除
    "afterCreate": []             // v2：创建后执行的命令（默认逐条确认）
}
```

工程名会替换模板里的 `<name>`/`{{name}}`，EIDE 工程的 `eide.yml` 自动同步改名。
更多字段与占位符见 [docs/tutorial.md](docs/tutorial.md)。

## 配置

| 设置 | 默认 | 说明 |
|---|---|---|
| `devWizard.showOnStartup` | `true` | 启动时弹向导 |
| `devWizard.persistOnEsc` | `false` | Esc 后是否继续重弹（旧行为） |
| `devWizard.templatesRoot` | — | 模板目录（必配） |
| `devWizard.projectsRoot` | — | 新工程存放目录 |
| `devWizard.condaRoot` | 自动探测 | conda 安装根目录 |
| `devWizard.writeContextFile` | `true` | 建工程时生成 context.md |
| `devWizard.gitInitOnCreate` | `false` | 建工程后询问 git init |
| `devWizard.allowAfterCreate` | `ask` | afterCreate 命令：ask/allow/deny |

## FAQ

**已有 Keil/SDCC 环境会冲突吗？** 不会。工具装在独立目录，不写注册表不抢 PATH；
Keil 由 `build-keil.ps1` 自动探测（`-KeilRoot` 可指定）。

**向导每次都弹很烦？** 按 Esc 收起（本次不再弹）；或在设置关 `showOnStartup`。

**烧录失败提示 Waiting？** STC 芯片在等你冷启动——给板子断电再上电即可。

## 卸载

VSCode 扩展面板卸载 Dev Wizard；工具链目录（默认 `C:\dev`）直接删除即可。

## License

[MIT](LICENSE)
