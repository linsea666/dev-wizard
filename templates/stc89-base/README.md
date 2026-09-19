# stc89-base · STC89C51RC 工程

面向 **STC89C51RC**（经典 12T 8051 内核，4K Flash / 512B RAM）的 EIDE + SDCC 工程，
内置**点灯 + 串口**完整示例——建好工程即可直接编译烧录，全库中文注释（F12 跳定义 / 悬停看说明）。

## 演示内容（main.c）

- 板载 LED（P2.2）每秒闪烁
- 串口（9600,8,N,1）每秒上报 `led blink #N`
- 收到 PC 发来的字节自动回显并闪一下

## 文件说明

| 文件 | 作用 |
|---|---|
| `source/board.h` | 板级定义：LED 引脚/极性、晶振频率、延时——换板只改这里 |
| `source/uart.h/.c` | 硬件串口1 驱动（占 T1 产生波特率），中文注释讲透原理 |
| `source/main.c` | 业务代码：点灯 + 串口收发演示 |

## 流程（全在 VSCode 里）

1. `F7`（或 EIDE 面板 Build/锤子图标）编译 → 产物 `build/Debug/<工程名>.hex`
2. USB 转串口线接板子，EIDE 底部状态栏选好 COM 口
3. EIDE 面板 **Flash（闪电/芯片图标）** 烧录 —— 走 stcgal（`-P stc89`，115200）
4. **给板子重新上电**（STC 冷启动进 ISP，stcgal 会自动等到握手成功）
5. 打开 VSCode 串口监视器（EIDE 自带，9600）看板子每秒上报

## 备注

- LED 极性：示例按"低电平点亮"（灌电流）写；板子相反就改 `board.h` 两个宏。
- 换引脚：改 `board.h` 的 `LED_PIN`（如 P1_0）。
- **晶振**：`board.h` 的 `BOARD_FOSC` 必须和板子实际晶振一致——11.0592MHz 出精确 9600；
  12MHz 只能精确 2400（9600 会乱码，这是 51 的经典知识点）。
- 独立编译（不开 EIDE）：`sdcc main.c uart.c && packihx main.ihx > main.hex`。
