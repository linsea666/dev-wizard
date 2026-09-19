#ifndef __CONFIG_H
#define __CONFIG_H

/* ⚠ MAIN_Fosc 是全库的时间基准：delay 延时、模拟串口 9600 波特率、
 * 硬件串口波特率计算全部按它校准——换晶振/主频必须同步改这里，
 * 可选值见文件末尾 MAIN_Fosc 段（11.0592/12/16/22.1184/24 MHz）。
 * 模拟串口 print() 只支持列出的几个频率。 */

typedef unsigned char uint8_t;
typedef unsigned int uint16_t;
typedef unsigned long uint32_t;

typedef signed char int8_t;
typedef signed int int16_t;
typedef signed long int32_t;

/* redefine storage type */
#define reentrant __reentrant
#define compact
#define small __near
#define large __far
#define data __data
#define bdata
#define idata __idata
#define pdata __pdata
#define xdata __xdata
#define code __code

/* redefine keywords */
#define interrupt(x) __interrupt(x)
#define using(x) __using(x)
#define at(x) __at(x)

/* ★ 写中断函数请用 ISR(编号) 宏（Keil 与 SDCC 都认，编辑器零报错）：
 *   void Timer0ISR(void) ISR(1) { ... }
 *   ⚠ 不要手写 Keil 风格的 `interrupt 1`（数字裸跟在关键字后）——
 *   那不是标准 C，智能感知映射不了，会报一条假红线（编译不受影响）。 */
#ifdef __SDCC
    #define ISR(vec) __interrupt(vec)
#else
    #define ISR(vec) interrupt vec
#endif
#define _priority_
#define _task_

/* redefine internal type */
typedef __bit bit;
typedef __sbit sbit;
typedef __sfr sfr;
typedef __sfr16 sfr16;
typedef __sfr32 sfr32;

/* 定义主时钟频率 */
#ifndef MAIN_Fosc
//#define MAIN_Fosc 11059200L
//#define MAIN_Fosc 12000000L
//#define MAIN_Fosc 22118400L
//#define MAIN_Fosc 24000000L
#define MAIN_Fosc 16000000L // 主时钟默认 16MHz
#endif

#ifndef MCU_Type
#define MCU_Type STC15F_L2K56S2
#endif

#define Main_Fosc_KHZ (MAIN_Fosc / 1000)

#include "STC15Fxxxx.H"

#endif
