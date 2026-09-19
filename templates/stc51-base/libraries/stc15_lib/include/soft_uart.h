#ifndef __SOFT_UART_H
#define __SOFT_UART_H

#include "config.h"

/* 如果要使用 printf, 定义 USE_STDIO 宏即可 */
#ifdef USE_STDIO
#include <stdio.h>
#define print printf
#else
/**
 * @brief 通过模拟串口（P3.1，9600,8,N,1）发送一个 0 结尾的字符串
 *
 * 调试监控用：PC 端串口助手设为 9600,8,N,1 即可看到输出。
 * 波特率按 MAIN_Fosc 自动适应，仅支持
 * 11.0592 / 12 / 16 / 22.1184 / 24 MHz——其他主频编译直接报错。
 *
 * @param buffer 要发送的字符串首地址（以 '\0' 结尾）
 * @note 阻塞式发送；每发一个字节会短暂关闭总中断（EA=0），
 *       对时序敏感的中断请避开发送窗口。
 */
void print(char *);
#endif

#ifdef DEBUG
/**
 * @brief 调试输出宏：定义了 DEBUG 才生效，自动在末尾补回车换行
 * @param str 字符串字面量，如 LOG("ADC ready")
 */
#define LOG(str) \
    print(str); \
    print("\r\n")
#else
#define LOG(str)
#endif

#endif
