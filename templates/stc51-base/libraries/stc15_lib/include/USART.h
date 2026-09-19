
#ifndef __USART_H
#define __USART_H	 

#include	"config.h"

#define	COM_TX1_Lenth	128
#define	COM_RX1_Lenth	128
#define	COM_TX2_Lenth	128
#define	COM_RX2_Lenth	128

#define	USART1	1
#define	USART2	2

#define	UART_ShiftRight	0		//同步移位输出
#define	UART_8bit_BRTx	(1<<6)	//8位数据,可变波特率
#define	UART_9bit		(2<<6)	//9位数据,固定波特率
#define	UART_9bit_BRTx	(3<<6)	//9位数据,可变波特率

#define	UART1_SW_P30_P31	0
#define	UART1_SW_P36_P37	(1<<6)
#define	UART1_SW_P16_P17	(2<<6)	//必须使用内部时钟
#define	UART2_SW_P10_P11	0
#define	UART2_SW_P46_P47	1


#define	TimeOutSet1		5
#define	TimeOutSet2		5

#define	BRT_Timer1	1
#define	BRT_Timer2	2

typedef struct
{ 
	u8	id;				/**< 串口号: USART1 / USART2 */

	u8	TX_read;		/**< 发送缓冲读指针（中断内部推进，勿手动改） */
	u8	TX_write;		/**< 发送缓冲写指针（write2buff 内部推进） */
	u8	B_TX_busy;		/**< 发送忙标志: 1=还有数据在发 */

	u8 	RX_Cnt;			/**< 已接收未处理的字节数（在串口中断里读它取数据） */
	u8	RX_TimeOut;		/**< 接收超时计数（超时视为一帧结束） */
	u8	B_RX_OK;		/**< 一块数据接收完成标志 */
} COMx_Define; 

typedef struct
{ 
	u8	UART_Mode;			/**< 工作模式: UART_8bit_BRTx(8位,最常用) / UART_9bit / UART_9bit_BRTx / UART_ShiftRight */
	u8	UART_BRT_Use;		/**< 波特率发生器: BRT_Timer1(T1被占用) / BRT_Timer2(推荐,不占T1) */
	u32	UART_BaudRate;		/**< 波特率数值: 9600 / 115200 等（不是 ENABLE/DISABLE） */
	u8	Morecommunicate;	/**< 多机通讯(9位地址帧)允许: ENABLE / DISABLE */
	u8	UART_RxEnable;		/**< 允许接收: ENABLE / DISABLE */
	u8	BaudRateDouble;		/**< 波特率加倍(SMOD): ENABLE / DISABLE */
	u8	UART_Interrupt;		/**< 串口中断: ENABLE / DISABLE（收发缓冲全靠中断推进,一般开） */
	u8	UART_Polity;		/**< 中断优先级: PolityLow / PolityHigh */
	u8	UART_P_SW;			/**< 引脚映射: UART1_SW_P30_P31(默认) / UART1_SW_P36_P37 / UART1_SW_P16_P17(须内部时钟) */
	u8	UART_RXD_TXD_Short;	/**< RXD 与 TXD 内部短路做中继: ENABLE / DISABLE */

} COMx_InitDefine; 

extern	COMx_Define	COM1,COM2;
extern	u8	__xdata TX1_Buffer[COM_TX1_Lenth];	//发送缓冲
extern	u8 	__xdata RX1_Buffer[COM_RX1_Lenth];	//接收缓冲
extern	u8	__xdata TX2_Buffer[COM_TX2_Lenth];	//发送缓冲
extern	u8 	__xdata RX2_Buffer[COM_RX2_Lenth];	//接收缓冲

/**
 * @brief 初始化硬件串口并启动收发（中断驱动，收发各带 128 字节环形缓冲）
 *
 * @param UARTx 串口号：USART1 / USART2（STC89C51RC 只有 USART1）
 * @param COMx  配置结构体，字段含义见 COMx_InitDefine
 * @return 0=成功；2=模式或波特率参数错误（如重装值超 16 位）
 * @note 典型 9600,8N1（串口1 默认引脚 P3.0/P3.1，交叉接 USB 转串口）：
 *       COMx_InitDefine c;
 *       c.UART_Mode = UART_8bit_BRTx;
 *       c.UART_BRT_Use = BRT_Timer2;
 *       c.UART_BaudRate = 9600;
 *       c.UART_RxEnable = ENABLE;
 *       c.UART_Interrupt = ENABLE;   // 其余按需填 DISABLE/PolityLow
 *       USART_Configuration(USART1, &c);
 *       之后 PrintString1("hello\r\n") 即可发送。
 */
u8	USART_Configuration(u8 UARTx, COMx_InitDefine *COMx);

/**
 * @brief 把一个字节写入串口1发送缓冲（中断驱动，非阻塞）
 * @param dat 要发送的字节
 * @note 缓冲 128 字节（COM_TX1_Lenth），满则该字节被丢弃；
 *       实际移位发送由串口1中断完成，主循环不必等。
 */
void TX1_write2buff(u8 dat);

/**
 * @brief 把一个字节写入串口2发送缓冲（中断驱动，非阻塞）
 * @param dat 要发送的字节
 * @note 仅 STC15 带 USART2 的型号有效；缓冲 128 字节。
 */
void TX2_write2buff(u8 dat);

/**
 * @brief 串口1 发送一个 0 结尾的字符串（写入发送缓冲，非阻塞）
 * @param puts 字符串首地址；缓冲满会截断
 * @note 缓冲尚未发完时别销毁/覆盖字符串内容。
 */
void PrintString1(u8 *puts);

/**
 * @brief 串口2 发送一个 0 结尾的字符串（写入发送缓冲，非阻塞）
 * @param puts 字符串首地址
 */
void PrintString2(u8 *puts);

//void COMx_write2buff(COMx_Define *COMx, u8 dat);	//写入发送缓冲，指针+1
//void PrintString(COMx_Define *COMx, u8 *puts);

#endif
