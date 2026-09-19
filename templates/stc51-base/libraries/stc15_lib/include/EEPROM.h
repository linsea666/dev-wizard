#ifndef __EEPROM_H
#define __EEPROM_H

#include "config.h"

//	选择MCU型号 —— 必须与实际芯片一致，否则 EEPROM 地址换算错误、读写跑飞！
//	在工程编译宏或 config.h 里定义，如: #define MCU_Type STC15F_L2K56S2
#ifndef MCU_Type
#define MCU_Type STC15F_L2K56S2 //STC15F_L2K08S2, STC15F_L2K16S2, STC15F_L2K24S2, STC15F_L2K32S2, STC15F_L2K40S2, STC15F_L2K48S2, STC15F_L2K56S2, STC15F_L2K60S2, IAP15F_L2K61S2
#endif

/************************** ISP/IAP *****************************
 IAP系列 可以在应用程序修改应用程序。

STC15F/L2KxxS2	扇区分配，512字节/扇区，从0x0000开始。

     型号        大小   扇区数  开始地址  结束地址   MOVC读偏移地址
STC15F/L2K08S2   53K   106扇区  0x0000  ~  0xD3FF        0x2000
STC15F/L2K16S2   45K    90扇区  0x0000  ~  0xB3FF        0x4000
STC15F/L2K24S2   37K    74扇区  0x0000  ~  0x93FF        0x6000
STC15F/L2K32S2   29K    58扇区  0x0000  ~  0x73FF        0x8000
STC15F/L2K40S2   21K    42扇区  0x0000  ~  0x53FF        0xA000
STC15F/L2K48S2   13K    26扇区  0x0000  ~  0x33FF        0xC000
STC15F/L2K56S2   5K     10扇区  0x0000  ~  0x13FF        0xE000
STC15F/L2K60S2   1K      2扇区  0x0000  ~  0x03FF        0xF000

STC15F/L2K61S2   无EPROM, 整个122扇区的FLASH都可以擦写 地址 0x0000~0xF3ff.

*/

#if (MCU_Type == STC15F_L2K08S2)
#define MOVC_ShiftAddress 0x2000
#elif (MCU_Type == STC15F_L2K16S2)
#define MOVC_ShiftAddress 0x4000
#elif (MCU_Type == STC15F_L2K24S2)
#define MOVC_ShiftAddress 0x6000
#elif (MCU_Type == STC15F_L2K32S2)
#define MOVC_ShiftAddress 0x8000
#elif (MCU_Type == STC15F_L2K40S2)
#define MOVC_ShiftAddress 0xA000
#elif (MCU_Type == STC15F_L2K48S2)
#define MOVC_ShiftAddress 0xC000
#elif (MCU_Type == STC15F_L2K56S2)
#define MOVC_ShiftAddress 0xE000
#elif (MCU_Type == STC15F_L2K60S2)
#define MOVC_ShiftAddress 0xF000
#elif (MCU_Type == IAP15F_L2K61S2)
#define MOVC_ShiftAddress 0x0000
#endif

/**
 * @brief 关闭 IAP/EEPROM 功能（一系列 EEPROM 操作做完后调用一次）
 *
 * @note 标准操作序列：EEPROM_SectorErase(擦) → EEPROM_write_n / read_n（读写）
 *       → DisableEEPROM()（收工）。EEPROM 区与程序 Flash 独立编址，读写不会碰代码。
 */
void DisableEEPROM(void);

/**
 * @brief 从 EEPROM 读出 number 个字节到 RAM
 *
 * @param EE_address  EEPROM 空间内的起始地址（从 0x0000 起，单位字节）
 * @param DataAddress 目标 RAM 缓冲区首地址
 * @param number      要读的字节数
 * @note 读不需要先擦除。
 */
void EEPROM_read_n(u16 EE_address, u8 *DataAddress, u16 number);

/**
 * @brief 向 EEPROM 写入 number 个字节
 *
 * @param EE_address  EEPROM 空间内的起始地址（从 0x0000 起）
 * @param DataAddress 源 RAM 缓冲区首地址
 * @param number      要写的字节数
 * @note 写入只能把 1 变成 0；目标扇区必须先用 EEPROM_SectorErase 擦成 0xFF，
 *       否则新旧位叠加结果不对。
 */
void EEPROM_write_n(u16 EE_address, u8 *DataAddress, u16 number);

/**
 * @brief 擦除 EE_address 所在的扇区（整扇区 512 字节全部变成 0xFF）
 *
 * @param EE_address 目标扇区内任意一个地址（自动按 512B 对齐到所在扇区）
 * @note 擦除的最小单位是 512 字节扇区——同扇区的其它数据一并丢失，
 *       数据规划时一个扇区放一类数据，或者先读出-改-擦-写回。
 */
void EEPROM_SectorErase(u16 EE_address);

#endif
