
#ifndef __DELAY_H
#define __DELAY_H

#include "config.h"
#include "timer.h"

/**
 * @brief 软件空转延时（毫秒），不占用任何定时器
 *
 * 按 config.h 的 MAIN_Fosc 自动校准，误差约 ±10%；延时期间 CPU 忙等（阻塞）。
 *
 * @param ms 延时的毫秒数（u8 上限 255）
 * @note 需要更精确的延时用 DelayInit() + DelaySync()（会占用定时器 T0）。
 */
void delay_ms(unsigned char ms);

/**
 * @brief 初始化定时器 T0（16 位自动重装），供 DelaySync() 做精确延时
 *
 * @note 只需在主循环前调用一次；会占用定时器 T0（不开中断）——
 *       如果你的工程自己要用 T0，与精确延时二选一。
 */
void DelayInit(void);

/**
 * @brief 基于定时器 T0 的精确毫秒延时（阻塞，按主频精确计时）
 *
 * @param ms 延时的毫秒数（u16，最大 65535）
 * @note 必须先调用 DelayInit()；运行期间 T0 被独占，结束即停表。
 */
void DelaySync(u16 ms);

#endif
