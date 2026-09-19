#ifndef BOARD_H
#define BOARD_H

/* ---------------------------------------------------------------------------
 * 板级定义 —— 只在这一个文件里写引脚和晶振，其它 .c 只引用宏名
 *
 * 按常见的 AT89S51 最小系统板给的值，跟你手上的板子不一致就改这里。
 *
 * 这份头文件两种编译器都能用：
 *   Keil C51（默认，sfr/sbit 语法）—— build-keil.ps1 / Ctrl+Shift+B
 *   SDCC（__sfr __at 语法）         —— F7（EIDE）/ build.ps1
 * ------------------------------------------------------------------------- */

#ifdef __SDCC            /* ---- SDCC ---- */
#include <at89x51.h>
#define LED       P1_0
#define ISP_MOSI  P1_5
#define ISP_MISO  P1_6
#define ISP_SCK   P1_7

#else                    /* ---- Keil C51 ---- */
#include <reg51.h>

/* 板载 LED：接在 P1.0，低电平点亮 */
sbit LED      = P1^0;

/* ---- AT89S51 的 ISP 下载口 -----------------------------------------------
 * AT89S51 用 SPI 方式下载，三根信号线就是 P1 的高三位：
 *   USBasp  RST  -> 芯片 RST(9)
 *           MOSI -> P1.5(MOSI)    MISO -> P1.6(MISO)    SCK -> P1.7(SCK)
 * 这三只脚在下载时被编程器占用，别拿来驱动需要一直保持电平的外设。
 * ------------------------------------------------------------------------- */
sbit ISP_MOSI = P1^5;
sbit ISP_MISO = P1^6;
sbit ISP_SCK  = P1^7;

#endif

/* 晶振频率：串口波特率、定时器初值都按这个算 */
#define FOSC 11059200L

#endif /* BOARD_H */
