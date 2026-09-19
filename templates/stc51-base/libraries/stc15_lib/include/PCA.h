
#ifndef	__PCA_H
#define	__PCA_H

#include	"config.h"

/***************************用户宏定义*******************************************************/
#define		PWM0_DUTY		4000		//定义PWM的周期，数值为PCA所选择的时钟脉冲个数。
#define		PWM0_HIGH_MIN	80			//限制PWM输出的最小占空比。
#define		PWM0_HIGH_MAX	(PWM0_DUTY - PWM0_HIGH_MIN)		//限制PWM输出的最大占空比。

#define		PWM1_DUTY		3000		//定义PWM的周期，数值为PCA所选择的时钟脉冲个数。
#define		PWM1_HIGH_MIN	80			//限制PWM输出的最小占空比。
#define		PWM1_HIGH_MAX	(PWM1_DUTY - PWM1_HIGH_MIN)		//限制PWM输出的最大占空比。

#define		PWM2_DUTY		2000		//定义PWM的周期，数值为PCA所选择的时钟脉冲个数。
#define		PWM2_HIGH_MIN	80			//限制PWM输出的最小占空比。
#define		PWM2_HIGH_MAX	(PWM2_DUTY - PWM2_HIGH_MIN)		//限制PWM输出的最大占空比。

/********************************************************************************************/

#define	PCA0			0
#define	PCA1			1
#define	PCA2			2
#define	PCA_Counter		3
#define	PCA_P12_P11_P10_P37	(0<<4)
#define	PCA_P34_P35_P36_P37	(1<<4)
#define	PCA_P24_P25_P26_P27	(2<<4)
#define	PCA_Mode_PWM				0x42	//B0100_0010
#define	PCA_Mode_Capture			0
#define	PCA_Mode_SoftTimer			0x48	//B0100_1000
#define	PCA_Mode_HighPulseOutput	0x4c	//B0100_1100
#define	PCA_Clock_1T	(4<<1)
#define	PCA_Clock_2T	(1<<1)
#define	PCA_Clock_4T	(5<<1)
#define	PCA_Clock_6T	(6<<1)
#define	PCA_Clock_8T	(7<<1)
#define	PCA_Clock_12T	(0<<1)
#define	PCA_Clock_Timer0_OF	(2<<1)
#define	PCA_Clock_ECI	(3<<1)
#define	PCA_Rise_Active	(1<<5)
#define	PCA_Fall_Active	(1<<4)
#define	PCA_PWM_8bit	(0<<6)
#define	PCA_PWM_7bit	(1<<6)
#define	PCA_PWM_6bit	(2<<6)


typedef struct
{
	u8	PCA_IoUse;	/**< 引脚映射: PCA_P12_P11_P10_P37 / PCA_P34_P35_P36_P37 / PCA_P24_P25_P26_P27（三组外部引脚任选） */
	u8	PCA_Clock;	/**< 计数时钟: PCA_Clock_1T / 2T / 4T / 6T / 8T / 12T / PCA_Clock_Timer0_OF(T0溢出) / PCA_Clock_ECI(外部引脚) */
	u8	PCA_Mode;	/**< 工作模式: PCA_Mode_PWM(输出PWM) / PCA_Mode_Capture(捕获脉宽) / PCA_Mode_SoftTimer(软件定时) / PCA_Mode_HighPulseOutput(高速脉冲输出) */
	u8	PCA_PWM_Wide;	/**< PWM 位宽: PCA_PWM_8bit / PCA_PWM_7bit / PCA_PWM_6bit */
	u8	PCA_Interrupt_Mode;	/**< 中断触发: PCA_Rise_Active(上升沿) / PCA_Fall_Active(下降沿) / ENABLE / DISABLE */
	u8	PCA_Polity;	/**< 中断优先级: PolityHigh / PolityLow */
	u16	PCA_Value;	/**< 装载值（捕获/软件定时模式用） */
} PCA_InitTypeDef;

extern	bit		B_Capture0,B_Capture1,B_Capture2;
extern	u8		PCA0_mode,PCA1_mode,PCA2_mode;
extern	u16		CCAP0_tmp,PCA_Timer0;
extern	u16		CCAP1_tmp,PCA_Timer1;
extern	u16		CCAP2_tmp,PCA_Timer2;

/**
 * @brief 初始化 PCA 通道（PWM / 捕获 / 软件定时 / 高速脉冲输出）
 *
 * @param PCA_id 通道号: PCA0 / PCA1 / PCA2，或 PCA_Counter（只当 16 位计数器用）
 * @param PCAx  配置结构体，字段含义见 PCA_InitTypeDef
 * @note PWM 模式初始化后，用 UpdatePwm() 调占空比；
 *       捕获模式的结果放在全局变量 B_Capture0~2（完成标志）和 CCAP0_tmp~2（计数值）里。
 */
void	PCA_Init(u8 PCA_id, PCA_InitTypeDef *PCAx);

/**
 * @brief 更新 PWM 占空比（8 位模式）
 *
 * @param PCA_id 通道号: PCA0 / PCA1 / PCA2
 * @param pwm_value 比较值 0~255，数值越大一个周期内高电平越长（255≈常高）
 * @note 需先用 PCA_Init 配成 PCA_Mode_PWM + PCA_PWM_8bit；运行中可随时调用平滑调速。
 */
void	UpdatePwm(u8 PCA_id, u8 pwm_value);

/**
 * @brief 更新 PWM 比较值（支持 6/7/8 位宽度的重载方式）
 *
 * @param PCA_id 通道号: PCA0 / PCA1 / PCA2
 * @param high 比较值，范围按位宽: 6 位 0~63 / 7 位 0~127 / 8 位 0~255
 * @note 与 UpdatePwm 的区别：本函数走重载方式，配合 PWMn_DUTY 周期宏实现自定义周期。
 */
void 	PWMn_Update(u8 PCA_id, u16 high);


#endif
