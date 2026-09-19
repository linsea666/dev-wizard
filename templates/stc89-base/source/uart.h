/**
 * @file uart.h
 * @brief STC89C51RC 硬件串口1 驱动（定时器 T1 产生波特率，模式1，8N1）
 *
 * 用法三步：
 *   1. uart_init();                 // 上电调用一次，9600,8,N,1
 *   2. uart_tx_string("hello\r\n"); // 发送
 *   3. uart_rx_ready() / uart_rx()  // 收数据（轮询方式）
 *
 * PC 端串口助手设置：9600, 8, N, 1；板子串口与 USB 转串口线交叉连接
 * （板 TXD → 线 RXD，板 RXD → 线 TXD），共地。
 */
#ifndef __UART_H
#define __UART_H

#include "board.h"

/**
 * @brief 初始化串口1：9600,8,N,1，占用定时器 T1（模式2 自动重装）
 *
 * @note 波特率按 board.h 的 BOARD_FOSC 计算：
 *       11.0592MHz → 精确 9600；12MHz → 精确 2400（9600 误差过大不可用）。
 *       初始化后 T1 就归串口了，别再把 T1 挪作定时用。
 */
void uart_init(void);

/**
 * @brief 阻塞发送一个字节
 * @param dat 要发送的字节
 * @note 等 TI 置位后才写 SBUF，缓冲只此一个；连续调用即可发一串。
 */
void uart_tx_byte(unsigned char dat);

/**
 * @brief 阻塞发送一个 0 结尾的字符串
 * @param s 字符串首地址（以 '\0' 结尾）
 */
void uart_tx_string(char *s);

/**
 * @brief 查询是否收到了一个字节
 * @return 1 = 有数据可读（接着调 uart_rx() 取走）；0 = 没有
 */
unsigned char uart_rx_ready(void);

/**
 * @brief 从串口读走一个字节（先 uart_rx_ready() 确认有数据再调）
 * @return 收到的字节；读走后 RI 自动清除，可以继续收下一个
 */
unsigned char uart_rx(void);

#endif /* __UART_H */
