/* STM32F103C8T6（Blue Pill）· 入门演示：板载 LED（PC13）闪烁
 *
 * ══════════════ 全流程（都在 VSCode 里）══════════════
 *  1. F7 编译（EIDE，ARM GCC）  → build/Debug/<工程名>.elf / .hex
 *  2. ST-Link 接板子（SWD：SWDIO/SWCLK/GND/3V3 四根线）
 *  3. EIDE 面板 Flash（闪电图标）→ OpenOCD 下载并复位运行
 * ═════════════════════════════════════════════════════
 *
 * 上电后现象：PC13 LED 每秒翻转一次（亮 0.5s / 灭 0.5s）。
 * 芯片上电后 system_stm32f10x.c 自动把主频配到 72MHz（HSE 8M × 9 倍频）。
 *
 * ── STM32 GPIO 的三步固定套路（所有外设都类似）──
 *  1. 开时钟：  RCC_APB2PeriphClockCmd(...)   —— 外设没时钟就是"没通电"
 *  2. 配引脚：  GPIO_Init(...)                —— 模式/速度写成结构体一次填好
 *  3. 用引脚：  GPIO_SetBits / ResetBits / ReadInputDataBit
 *
 * 📖 参数中文解释（GPIO 模式表/串口配置/中断向量/常见坑）见 docs/参数速查_STM32F103C8T6.md
 */

#include "stm32f10x.h"
#include "board.h"

int main(void)
{
    GPIO_InitTypeDef gpio;      /* 引脚配置结构体（先定义后填字段再交给 GPIO_Init） */

    /* 1. 开 GPIOC 的时钟：GPIO 挂在 APB2 总线上（APB1 上是 USART2/TIM2 等低速外设） */
    RCC_APB2PeriphClockCmd(LED_RCC, ENABLE);

    /* 2. 配 PC13：2MHz 推挽输出（点灯足够；驱动能力要求高用 GPIO_Speed_50MHz） */
    gpio.GPIO_Pin   = LED_PIN;
    gpio.GPIO_Speed = GPIO_Speed_2MHz;
    gpio.GPIO_Mode  = GPIO_Mode_Out_PP;     /* 推挽输出：能主动输出高低电平 */
    GPIO_Init(LED_PORT, &gpio);

    LED_OFF();      /* 从"灭"起步，状态可预期 */

    /* 3. 主循环：每 500ms 翻转一次 LED */
    while (1)
    {
        LED_TOGGLE();               /* 翻转 PC13 */
        board_delay_ms(500);
    }
}
