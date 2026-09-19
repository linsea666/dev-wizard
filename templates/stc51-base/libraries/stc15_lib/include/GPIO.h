
#ifndef	__GPIO_H
#define	__GPIO_H

#include	"config.h"

#define	GPIO_PullUp		0	//上拉准双向口
#define	GPIO_HighZ		1	//浮空输入
#define	GPIO_OUT_OD		2	//开漏输出
#define	GPIO_OUT_PP		3	//推挽输出

#define	GPIO_Pin_0		0x01	//IO引脚 Px.0
#define	GPIO_Pin_1		0x02	//IO引脚 Px.1
#define	GPIO_Pin_2		0x04	//IO引脚 Px.2
#define	GPIO_Pin_3		0x08	//IO引脚 Px.3
#define	GPIO_Pin_4		0x10	//IO引脚 Px.4
#define	GPIO_Pin_5		0x20	//IO引脚 Px.5
#define	GPIO_Pin_6		0x40	//IO引脚 Px.6
#define	GPIO_Pin_7		0x80	//IO引脚 Px.7
#define	GPIO_Pin_All	0xFF	//IO所有引脚
	
#define	GPIO_P0			0		//
#define	GPIO_P1			1
#define	GPIO_P2			2
#define	GPIO_P3			3
#define	GPIO_P4			4
#define	GPIO_P5			5


typedef struct
{
	u8	Mode;		/**< 工作模式: GPIO_PullUp(上拉准双向,复位默认,读引脚前先写1) / GPIO_HighZ(浮空输入) / GPIO_OUT_OD(开漏,需外接上拉) / GPIO_OUT_PP(推挽,驱动LED/蜂鸣器用) */
	u8	Pin;		/**< 引脚掩码: GPIO_Pin_0 ~ GPIO_Pin_7 可用 | 组合多个，GPIO_Pin_All=整组 8 个 */
} GPIO_InitTypeDef;

/**
 * @brief 把一组端口（P0~P5）中选定的引脚设置为指定工作模式
 *
 * @param GPIO  端口号：GPIO_P0 ~ GPIO_P5
 * @param GPIOx 配置结构体：Mode（工作模式）+ Pin（引脚掩码，可 | 组合）
 * @return 0=配置成功；1=参数无效（未做任何操作）；2=Mode 非法
 * @note 例：把 P2.2 配成推挽输出驱动 LED——
 *       GPIO_InitTypeDef g;
 *       g.Mode = GPIO_OUT_PP;
 *       g.Pin  = GPIO_Pin_2;
 *       GPIO_Inilize(GPIO_P2, &g);
 *       注意 GPIO_Pin_x 的 x 是位号：GPIO_Pin_2 即 Px.2。
 */
u8	GPIO_Inilize(u8 GPIO, GPIO_InitTypeDef *GPIOx);

#endif
