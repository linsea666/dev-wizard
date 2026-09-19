/**
 * @file board.h
 * @brief STC89C51RC 学习板板级定义（LED / 晶振 / 常用速记）
 *
 * 换板子/换引脚只改这一个文件，业务代码不用动。
 */
#ifndef __BOARD_H
#define __BOARD_H

#include "stc89c51rc.h"     /* 中文注释版寄存器（勿与 <8051.h> 同时包含） */

/* ─────────────────── 晶振频率 ───────────────────
 * 按你板子上的晶振丝印改这里（影响 uart.c 的波特率计算）。
 * 11.0592MHz 是 51 学习板的"黄金频率"——9600/115200 等常用波特率都能整除零误差；
 * 12MHz 只能精确出 2400，跑 9600 会累计 8% 误差导致串口乱码。 */
#define BOARD_FOSC      11059200UL

/* ─────────────────── 板载 LED ───────────────────
 * 板载 LED 接在 P2.2。多数学习板是"灌电流"接法：引脚输出 0 = 亮，1 = 灭。
 * 如果你的板子写 0 反而灭、写 1 亮（高电平点亮），把下面两个宏的 0/1 对调即可。 */
#define LED_PORT        P2          /* LED 所在端口（整组） */
#define LED_PIN         P2_2        /* LED 引脚位 */
#define LED_ON()        (LED_PIN = 0)   /* 点亮（低电平有效） */
#define LED_OFF()       (LED_PIN = 1)   /* 熄灭 */
#define LED_TOGGLE()    (LED_PIN = !LED_PIN)  /* 翻转状态 */

/* ─────────────────── 毫秒延时 ───────────────────
 * 软件空转延时，按 BOARD_FOSC 校准（12T 机器周期），±10% 级精度。
 * 要精确延时请用定时器（参考 timer 用法或直接抄 DelaySync 思路）。 */
static void board_delay_ms(unsigned int ms)
{
    unsigned int i;
    while (ms--)
        for (i = 0; i < (unsigned int)(BOARD_FOSC / 12UL / 13000UL) + 1; i++)
            ;
}

#endif /* __BOARD_H */
