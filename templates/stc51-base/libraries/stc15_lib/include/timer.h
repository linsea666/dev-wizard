
#ifndef	__TIMER_H
#define	__TIMER_H

#include	"config.h"

#define	Timer0						0
#define	Timer1						1
#define	Timer2						2
#define	Timer3						3
#define	Timer4						4

#define	TIM_16BitAutoReload			0
#define	TIM_16Bit					1
#define	TIM_8BitAutoReload			2
#define	TIM_16BitAutoReloadNoMask	3

#define	TIM_CLOCK_1T				0
#define	TIM_CLOCK_12T				1
#define	TIM_CLOCK_Ext				2

typedef struct
{
	u8	TIM_Mode;		/**< 工作模式: TIM_16BitAutoReload(16位自动重装,最常用) / TIM_16Bit / TIM_8BitAutoReload / TIM_16BitAutoReloadNoMask */
	u8	TIM_Polity;		/**< 中断优先级: PolityHigh / PolityLow */
	u8	TIM_Interrupt;	/**< 是否允许定时器中断: ENABLE / DISABLE */
	u8	TIM_ClkSource;	/**< 时钟源: TIM_CLOCK_1T(每时钟+1) / TIM_CLOCK_12T(12分频,传统8051速度) / TIM_CLOCK_Ext(外部引脚计数) */
	u8	TIM_ClkOut;		/**< 是否在引脚输出可编程时钟: ENABLE / DISABLE */
	u16	TIM_Value;		/**< 装载初值: 计到溢出为止；16位自动重装模式下溢出后自动重装。例: 16MHz/1T 定时1ms = 65536-16000 */
	u8	TIM_Run;		/**< 配置完是否立即启动: ENABLE / DISABLE */
} TIM_InitTypeDef;

/**
 * @brief 初始化定时器（本库支持 T0 / T1 / T2），可立即启动
 *
 * @param TIM  定时器号：Timer0 / Timer1 / Timer2（Timer3/4 宏有但本库未实现）
 * @param TIMx 配置结构体，各字段含义见 TIM_InitTypeDef
 * @return 0=配置成功；1=定时器号无效；2=工作模式参数非法
 * @note 串口波特率若选 BRT_Timer1，T1 会被串口占用，不能再挪作他用；
 *       DelayInit() 内部也是用本函数配 T0 的。
 */
u8	Timer_Inilize(u8 TIM, TIM_InitTypeDef *TIMx);

#endif
