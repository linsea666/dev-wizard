/**
 * @file uart.c
 * @brief STC89C51RC 硬件串口1 驱动实现（中文注释版）
 *
 * 原理速记：
 *   - 串口1 模式1（10 位异步：1 起始 + 8 数据 + 1 停止），SCON = 0x50
 *   - 波特率由定时器 T1 模式2（8 位自动重装）溢出率产生：
 *       波特率 = (2^SMOD / 32) × FOSC / (12 × (256 - TH1))
 *     11.0592MHz 时 TH1 = 253 → 精确 9600，这就是学习板都用 11.0592 晶振的原因
 *   - 发送：写 SBUF → TI 硬件置位 → 软件清 TI
 *   - 接收：RI 硬件置位 → 读 SBUF → 软件清 RI
 */
#include "uart.h"

void uart_init(void)
{
    /* T1：模式2（8位自动重装，TH1 溢出后自动重装，不用反复填初值） */
    TMOD = (TMOD & 0x0F) | 0x20;    /* 高4位给T1：0x20 = T1 模式2，低4位保留 T0 原配置 */

#if (BOARD_FOSC == 11059200UL)
    TH1 = 253;                      /* 9600 = (1/32) × 11059200 / (12 × 3)，零误差 */
    TL1 = 253;                      /* TL1 只是首次计数起点，写同值 */
#elif (BOARD_FOSC == 12000000UL)
    TH1 = 243;                      /* 2400 = (1/32) × 12000000 / (12 × 13)，零误差 */
    TL1 = 243;
#else
#error "uart.c: BOARD_FOSC 只支持 11059200 或 12000000，请在 board.h 里改"
#endif

    SCON = 0x50;                    /* 模式1(8位UART) + REN=1 允许接收 */
    PCON |= 0x00;                   /* SMOD=0 不加倍；要 19200 可置 PCON.7=1(仅11.0592精确) */

    ES = 0;                         /* 不开串口中断：本驱动是轮询式 */
    EA = 1;                         /* 总中断打开（本驱动不依赖它，习惯上保留） */

    TR1 = 1;                        /* 启动 T1 —— 波特率开始跑 */
}

void uart_tx_byte(unsigned char dat)
{
    SBUF = dat;                     /* 触发发送：硬件自动移位出去 */
    while (!TI)
        ;                           /* 等发送完成（TI 发完一帧由硬件置 1） */
    TI = 0;                         /* TI 必须软件清零，下一帧才能发 */
}

void uart_tx_string(char *s)
{
    while (*s)
        uart_tx_byte(*s++);
}

unsigned char uart_rx_ready(void)
{
    return RI;                      /* RI=1 表示收到一帧，等软件去读 */
}

unsigned char uart_rx(void)
{
    unsigned char dat;
    dat = SBUF;                     /* 先读数据 */
    RI = 0;                         /* RI 必须软件清零，才能收下一帧 */
    return dat;
}
