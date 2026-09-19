/**
 * @file board.h
 * @brief STM32F103C8T6（Blue Pill / 最小系统板）板级定义
 *
 * 换板子只改这一个文件。
 * 标准 72MHz 时钟由 lib 里的 system_stm32f10x.c 上电自动配置好（HSE 8M 倍频到 72M）。
 */
#ifndef __BOARD_H
#define __BOARD_H

#include "stm32f10x.h"

/* ─────────────────── 板载 LED ───────────────────
 * Blue Pill 的板载 LED 接 PC13，灌电流：引脚输出低 = 亮，高 = 灭。
 * 外接 LED 到其它引脚的话，改下面三个宏即可（例如 LED_GPIO_CLK 用 RCC_APB2Periph_GPIOA）。 */
#define LED_RCC         RCC_APB2Periph_GPIOC    /* LED 端口的时钟（GPIOC） */
#define LED_PORT        GPIOC                   /* LED 端口 */
#define LED_PIN         GPIO_Pin_13             /* LED 引脚 PC13 */
#define LED_ON()        GPIO_ResetBits(LED_PORT, LED_PIN)    /* 点亮（低电平有效） */
#define LED_OFF()       GPIO_SetBits(LED_PORT, LED_PIN)      /* 熄灭 */
#define LED_TOGGLE()    (LED_PORT->ODR ^= LED_PIN)           /* 翻转（读改写 ODR） */

/* ─────────────────── 调试串口（预留） ───────────────────
 * 常用接线：USART1 = PA9(TX) / PA10(RX)，交叉接 USB 转串口。
 * 本模板先用 GPIO 演示；要串口打印时 RCC 开 USART1+GPIOA 时钟，
 * GPIO_Init 配 PA9 为复用推挽，USART_Init 配 115200,8,N,1 即可。 */

/* ─────────────────── 简易毫秒延时 ───────────────────
 * 空转延时（够点灯用）；要精确定时请配 SysTick 或 TIM2。 */
static inline void board_delay_ms(volatile unsigned int ms)
{
    /* 72MHz 下每圈约 8 个周期，系数按实测微调 */
    while (ms--)
        for (volatile unsigned int i = 0; i < 7200; i++)
            ;
}

#endif /* __BOARD_H */
