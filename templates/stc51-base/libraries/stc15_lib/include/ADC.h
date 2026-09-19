
#ifndef	__ADC_H
#define	__ADC_H

#include	"config.h"

#define	ADC_P10		0x01	//IO引脚 Px.0
#define	ADC_P11		0x02	//IO引脚 Px.1
#define	ADC_P12		0x04	//IO引脚 Px.2
#define	ADC_P13		0x08	//IO引脚 Px.3
#define	ADC_P14		0x10	//IO引脚 Px.4
#define	ADC_P15		0x20	//IO引脚 Px.5
#define	ADC_P16		0x40	//IO引脚 Px.6
#define	ADC_P17		0x80	//IO引脚 Px.7
#define	ADC_P1_All	0xFF	//IO所有引脚

#define ADC_90T		(3<<5)
#define ADC_180T	(2<<5)
#define ADC_360T	(1<<5)
#define ADC_540T	0
#define ADC_FLAG	(1<<4)	//软件清0
#define ADC_START	(1<<3)	//自动清0
#define ADC_CH0		0
#define ADC_CH1		1
#define ADC_CH2		2
#define ADC_CH3		3
#define ADC_CH4		4
#define ADC_CH5		5
#define ADC_CH6		6
#define ADC_CH7		7

#define ADC_RES_H2L8	1
#define ADC_RES_H8L2	0

#define ADC_Start() ADC_CONTR |= 0x08
#define ADC_ClearITFlag() ADC_CONTR &= 0xEF

typedef struct
{
	u8	ADC_Px;			/**< 打开哪些通道的模拟输入: ADC_P10 ~ ADC_P17，可 | 组合，ADC_P1_All=全部（对应 P1.0~P1.7） */
	u8	ADC_Speed;		/**< 转换速度: ADC_90T(最快) / ADC_180T / ADC_360T / ADC_540T(最稳) */
	u8	ADC_Power;		/**< 模块电源: ENABLE / DISABLE（也可之后用 ADC_PowerControl 控制） */
	u8	ADC_AdjResult;	/**< 结果存放格式: ADC_RES_H2L8(左高2右低8) / ADC_RES_H8L2 —— Get_ADC10bitResult 两种都整理为 10 位右对齐 */
	u8	ADC_Polity;		/**< 中断优先级: PolityHigh / PolityLow */
	u8	ADC_Interrupt;	/**< 转换完成中断: ENABLE / DISABLE（轮询方式用 DISABLE） */
} ADC_InitTypeDef;

/**
 * @brief 配置 ADC（通道/速度/结果对齐/中断），本身不打开模块电源
 *
 * @param ADCx 配置结构体，字段含义见 ADC_InitTypeDef
 * @note 采样前还要 ADC_PowerControl(ENABLE)，首次上电建议延时 1ms 再采样。
 */
void	ADC_Inilize(ADC_InitTypeDef *ADCx);

/**
 * @brief 打开/关闭 ADC 模块电源
 *
 * @param pwr ENABLE（上电）/ DISABLE（关电省功耗）
 * @note 冷启动第一次上电后内部基准需要稳定，建议延时 1ms 再开始转换。
 */
void	ADC_PowerControl(u8 pwr);

/**
 * @brief 启动一次 ADC 转换并阻塞等待结果
 *
 * @param channel 通道号 0~7（ADC_CH0~ADC_CH7，对应 P1.0~P1.7）
 * @return 10 位转换结果 0~1023（0=0V，1023≈VCC），电压 = 结果 * VCC / 1023
 * @note 轮询阻塞式；要中断方式请把 ADC_Interrupt 配成 ENABLE 并在 ADC 中断里取值。
 */
u16		Get_ADC10bitResult(u8 channel);

#endif
