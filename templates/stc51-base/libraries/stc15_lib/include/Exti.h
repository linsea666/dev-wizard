
#ifndef	__EXTI_H
#define	__EXTI_H

#include	"config.h"

#define	EXT_INT0			0	//初始化外中断0
#define	EXT_INT1			1	//初始化外中断1
#define	EXT_INT2			2	//初始化外中断2
#define	EXT_INT3			3	//初始化外中断3
#define	EXT_INT4			4	//初始化外中断4

#define	EXT_MODE_RiseFall	0	//上升沿/下降沿中断
#define	EXT_MODE_Fall		1	//下降沿中断

typedef struct
{
	u8	EXTI_Mode;			/**< 触发方式: EXT_MODE_RiseFall(上升沿和下降沿都触发) / EXT_MODE_Fall(仅下降沿) */
	u8	EXTI_Polity;		/**< 中断优先级: PolityHigh / PolityLow */
	u8	EXTI_Interrupt;		/**< 中断允许: ENABLE / DISABLE */
} EXTI_InitTypeDef;

/**
 * @brief 初始化外部中断
 *
 * @param EXT 中断号: EXT_INT0 ~ EXT_INT4
 * @param INTx 配置结构体，字段含义见 EXTI_InitTypeDef
 * @return 0=配置成功；1=中断号无效；2=参数错误
 * @note INT0/INT1 两种触发方式都支持（引脚 P3.2/P3.3）；
 *       INT2~INT4 仅支持下降沿。中断服务函数里记得清对应标志位。
 */
u8	Ext_Inilize(u8 EXT, EXTI_InitTypeDef *INTx);

#endif
