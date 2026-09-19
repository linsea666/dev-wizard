/*  新工程的代码从这里开始（Keil C51 语法版）
 *
 *  芯片：AT89S51（8051 内核 · 4 KB Flash · 128 B RAM）
 *  编译器：Keil C51（V9.57，本机装在 E:\keilc51v957）
 *
 *  编译（三选一，产物都是 build\Debug\<工程名>.hex）：
 *      Ctrl+Shift+B   选 build (Keil C51)          —— 推荐
 *      终端执行        .\build-keil.ps1
 *      终端执行        .\build-keil.ps1 -Flash      —— 编完顺便用 USBasp 下载
 *
 *  引脚定义在 src/board.h（sbit LED = P1^0 这类），改板子只改那一个文件。
 *  寄存器名（P0~P3、TCON、TMOD、SCON……）来自 Keil 自带的 <reg51.h>。
 *
 *  想用 SDCC / EIDE（F7）？把本文件删掉或改名，再把 main_sdcc.c.example
 *  改回 main.c —— 两套语法的示例都放在这个目录里了。
 *
 *  下面是一个定时器中断 + LED 闪烁示例，覆盖 Keil 常用写法
 *  （sbit / data / code / interrupt ... using）；不需要就直接重写。
 */

#include "board.h"

/* 50ms 定时器初值：11.0592 MHz，12 分频 → 机器周期 1.085us，65536-46080≈0x4C00 附近 */
#define T50MS_H 0x4C
#define T50MS_L 0x00

data unsigned char tick50 = 0;          /* data：内部 RAM 低 128B */
code unsigned char flash_tab[2] = {0, 1}; /* code：表放 ROM */

/* 定时器 0 中断：Keil 写法 interrupt 中断号 using 寄存器组 */
void timer0_isr(void) interrupt 1 using 1
{
    TH0 = T50MS_H;
    TL0 = T50MS_L;
    tick50++;                            /* 20 * 50ms = 1s */
}

void timer0_init(void)
{
    TMOD = 0x01;                         /* T0 方式 1（16 位） */
    TH0  = T50MS_H;
    TL0  = T50MS_L;
    ET0  = 1;                            /* 允许 T0 中断 */
    EA   = 1;                            /* 总中断允许 */
    TR0  = 1;                            /* 启动 T0 */
}

void main(void)
{
    unsigned char blink = 0;

    timer0_init();
    LED = 0;                             /* 低电平点亮，先亮一下表示上电 */

    while (1) {
        if (tick50 >= 20) {
            tick50 = 0;
            blink = !blink;
            LED = flash_tab[blink];
        }
    }
}
