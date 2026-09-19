/* STC89C51RC · 板载 LED（P2.2）闪烁演示
 *
 * 全流程（都在 VSCode 里）：
 *   1. F7 编译（或 EIDE 面板锤子图标） → build/Debug/<工程名>.hex
 *   2. USB 转串口线接板子，EIDE 底部状态栏选 COM 口
 *   3. EIDE 面板 Flash（闪电图标）→ stcgal -P stc89 开始等待
 *   4. 给板子重新上电（STC 冷启动进 ISP），握手成功自动写入
 *
 * 亮灭与你的板子 LED 极性相反时，把下面两个 P2_2 的 0/1 对调即可。
 * 换引脚：把 P2_2 改成别的口（如 P1_0）。
 */

#include <8051.h>

/* 粗略毫秒级延时：12T 模式，12MHz 下每圈约 1ms，11.0592MHz 略慢 10% */
static void delay(unsigned int ms)
{
    unsigned int i;
    while (ms--)
        for (i = 0; i < 120; i++)
            ;
}

void main(void)
{
    while (1)
    {
        P2_2 = 0;       /* 低电平 = 亮（灌电流接法，多数学习板如此） */
        delay(250);
        P2_2 = 1;       /* 高电平 = 灭 */
        delay(250);
    }
}
