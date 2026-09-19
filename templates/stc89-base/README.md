# stc89-base · STC89C51RC 工程

面向 **STC89C51RC**（经典 12T 8051 内核，4K Flash / 512B RAM）的 EIDE + SDCC 工程，
内置板载 LED（**P2.2**）闪烁示例——建好工程即可直接编译烧录。

## 流程（全在 VSCode 里）

1. `F7`（或 EIDE 面板 Build/锤子图标）编译 → 产物 `build/Debug/<工程名>.hex`
2. USB 转串口线接板子，EIDE 底部状态栏选好 COM 口
3. EIDE 面板 **Flash（闪电/芯片图标）** 烧录 —— 走 stcgal（`-P stc89`，115200）
4. **给板子重新上电**（STC 冷启动进 ISP，stcgal 会自动等到握手成功）

## 备注

- LED 极性：示例按"低电平点亮"（灌电流）写；如果你的板子是高电平点亮，
  把 main.c 里两个 `P2_2` 的 0/1 对调即可（闪烁本身不受影响）。
- 换引脚：改 main.c 里的 `P2_2` 为其他口（如 `P1_0`）。
- 晶振 12MHz/11.0592MHz 均可跑（软件延时，闪烁周期略有差异）。
- 独立编译（不开 EIDE）：`sdcc main.c && packihx main.ihx > main.hex`。
