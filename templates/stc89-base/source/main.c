/* STC89C51RC · 入门演示：板载 LED（P2.2）闪烁 + 串口输出
 *
 * ══════════════ 全流程（都在 VSCode 里）══════════════
 *  1. F7 编译（EIDE）            → build/Debug/<工程名>.hex
 *  2. USB 转串口线接板子（交叉接），EIDE 底部状态栏选 COM 口
 *  3. EIDE 面板 Flash（闪电图标）→ stcgal -P stc89 等待握手
 *  4. 给板子重新上电（STC 冷启动进 ISP），自动写入
 * ═════════════════════════════════════════════════════
 *
 * 上电后现象：
 *   - P2.2 LED 每秒翻转一次（亮 0.5s / 灭 0.5s）
 *   - 串口助手（9600,8,N,1）每秒收到一行 "led blink #N"
 *   - 串口助手发任意一个字节，板子回显并多闪一下
 *
 * 换引脚 / 换 LED 极性：只改 board.h，别动本文件。
 */

#include "board.h"
#include "uart.h"

/* 简单的整数转十进制字符串（避免拖标准库 printf，省 4K Flash 空间） */
static void u16_to_str(unsigned int v, char *buf)
{
    char tmp[6];
    unsigned char i = 0, j = 0;

    do {
        tmp[i++] = '0' + (v % 10);
        v /= 10;
    } while (v);
    while (i)
        buf[j++] = tmp[--i];
    buf[j] = '\0';
}

void main(void)
{
    unsigned int count = 0;
    char line[24];

    LED_OFF();          /* 先熄灯，从已知状态开始 */
    uart_init();        /* 串口 9600,8,N,1（占定时器 T1，详见 uart.c） */

    uart_tx_string("STC89C51RC ready. LED on P2.2.\r\n");

    while (1)
    {
        /* —— 串口回显：PC 发来的每个字节都原样发回去 —— */
        if (uart_rx_ready())
        {
            unsigned char ch = uart_rx();
            uart_tx_byte(ch);           /* 回显 */
            LED_ON();
            board_delay_ms(50);
            LED_OFF();
        }

        /* —— 每秒一次：LED 翻转 + 上报计数 —— */
        LED_TOGGLE();
        count++;

        line[0] = 'l'; line[1] = 'e'; line[2] = 'd'; line[3] = ' ';
        line[4] = 'b'; line[5] = 'l'; line[6] = 'i'; line[7] = 'n';
        line[8] = 'k'; line[9] = ' '; line[10] = '#';
        u16_to_str(count, line + 11);
        uart_tx_string(line);
        uart_tx_string("\r\n");

        board_delay_ms(500);
    }
}
