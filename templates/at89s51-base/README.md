# AT89S51 工程模板（Keil C51 / SDCC 双编译器）

一块"拿来就能编译"的 AT89S51 工程骨架，**默认用 Keil C51 编译器**——
`reg51.h`、`sfr`、`sbit`、`data`、`code`、`interrupt ... using` 这些 Keil 语法
直接写、直接编，不用改一个字。同时保留了 SDCC / EIDE 那条路。

| 项目 | 值 |
| --- | --- |
| 芯片 | AT89S51（8051 内核 · 4 KB Flash · 128 B RAM · 32 个 I/O） |
| 默认编译器 | **Keil C51**（命令行 C51 → BL51 → OH51，Keil 语法原生支持） |
| 备用编译器 | SDCC（`mcs51` 目标）—— EIDE `F7` 或 `build.ps1` |
| 寄存器头 | Keil：`<reg51.h>`（Keil 自带）／ SDCC：`<at89x51.h>`（SDCC 自带），都在 `src/board.h` 里按编译器自动切换 |
| 工程格式 | EIDE `C51` 工程（`.eide/eide.yml`，F7 用；Keil 路径不依赖它） |
| 晶振 | 默认 11.0592 MHz（`src/board.h` 里的 `FOSC`） |
| 产物 | `build\Debug\<工程名>.hex`（两条编译链产物路径一致） |

## 语法与编译方式怎么配对

| 你写的语法 | 用哪条路 |
| --- | --- |
| Keil 风格：`sfr P1=0x90;`、`sbit k=P1^0;`、`#include <reg51.h>`、`interrupt 1 using 1` | **Ctrl+Shift+B → `build (Keil C51)`**（默认任务）或 `.\build-keil.ps1` |
| SDCC 风格：`__sbit __at(0x90)`、`__interrupt(1)`、`#include <at89x51.h>` | `F7`（EIDE）或 `.\build.ps1` |

两种语法**不能混在同一个文件里**。模板的 `src/main.c` 默认是 Keil 风格，
`src/main_sdcc.c.example` 是 SDCC 风格的对照示例——想走 SDCC 就把两个文件名互换。

## 编译方式一览

**1. Keil C51（默认，Ctrl+Shift+B）**

```powershell
.\build-keil.ps1                        # 编译，输出 build\Debug\<工程名>.hex
.\build-keil.ps1 -Clean                 # 先删掉上次的产物再编译
.\build-keil.ps1 -Flash                 # 编译后用 USBasp + avrdude 下载
.\build-keil.ps1 -KeilRoot E:\keilc51v957   # 手动指定 Keil 安装目录
```

脚本按 `-KeilRoot` → `KEIL_ROOT` 环境变量 → `E:\keilc51v957` → `C:\Keil_v5`
的顺序找 Keil，内部依次调 `C51.exe`（编译）→ `BL51.exe`（链接）→
`OH51.exe`（转 hex），并打印 `Program Size: data=… code=…` 容量占用。

**2. SDCC / EIDE（F7）**

EIDE 读 `.eide/eide.yml` 用 SDCC 构建，产物同名同路径；
或者命令行 `.\build.ps1`（参数见脚本头注释）。

## 实时报错（写代码时就有红色波浪线）

装了 C/C++ 扩展（ms-vscode.cpptools）后无需任何操作——
`.vscode/c_cpp_properties.json` 已经把 SDCC / Keil 两套关键字映射成普通 C，
`reg51.h`、`sbit`、`data`、`code` 这些写法编辑器都能正常解析、补全。

两个已知残留（只影响显示，不影响编译）：

- `void t0(void) interrupt 1 using 1` 这行，编辑器会把 `interrupt`/`using`
  报红（C 语法层面绕不开，宏映射吃不掉裸数字）——**忽略这行即可**，
  它带来的连锁报红也都在这个函数附近；
- 容量超限、链接错误这类只有真实编译才能发现，波浪线干净不等于能过编译。

## 目录结构

```
.
├── .eide/eide.yml          EIDE 工程与 SDCC 编译参数（F7 用）
├── .vscode/tasks.json      Ctrl+Shift+B 的任务定义（Keil 默认）
├── .vscode/c_cpp_properties.json  实时报错/补全（IntelliSense）配置
├── src/
│   ├── main.c              入口（Keil 风格：定时器中断 + LED 闪烁）
│   ├── main_sdcc.c.example SDCC 风格对照示例（改名 main.c 后可走 F7）
│   └── board.h             引脚与晶振定义，双编译器自适应，改板子只改这个文件
├── build.ps1               SDCC 构建脚本（可选）
├── build-keil.ps1          Keil C51 构建脚本（默认）
└── at89s51-dev.code-workspace
```

## 引脚与晶振

`src/board.h` 已经按常见的 AT89S51 最小系统板写好：
