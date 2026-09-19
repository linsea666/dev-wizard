/*  src/reg51.h —— 双模式 reg51 声明文件（本工程专用）
 *
 *  为什么要有它：Keil 的 sfr/sbit 不是标准 C。真实编译时 Keil C51 原生认识，
 *  但编辑器的 IntelliSense（cpptools）不认识，需要翻译成普通 C。
 *  翻译后有个副作用：sfr 变成了"变量"，于是你自己写的
 *      sbit key1 = P1^0;      ← P1^0 不再是常量表达式，编辑器报红
 *  本文件在编辑器模式下把 P1/P2/P3 定义成常量来绕开这一点。
 *
 *  两个模式的分工：
 *    真实编译（Keil C51 / build-keil.ps1）→ 走 #else 分支，等价于 Keil 原版
 *    编辑器解析（VS Code C/C++）          → 走 VS_CODE_INTELLISENSE 分支
 *  VS_CODE_INTELLISENSE 只在 .vscode/c_cpp_properties.json 里定义，
 *  真实编译器看不到它，两条路互不干扰。
 *
 *  ⚠ 编辑器模式下的已知限制（只影响显示，不影响真编译）：
 *    1. P1/P2/P3 是常量，直接写 P1 = 0xFF; 会报红 —— 要写整端口就用 P0，
 *       或把对应 #define 删掉（代价是 P1^0 这种 sbit 声明开始报红）；
 *    2. void isr(void) interrupt 1 的 interrupt/using 无法用宏消化，
 *       ISR 那一行会报红 —— Keil 中断扩展语法绕不开，忍这一行。
 */

#ifndef __REG51_H__
#define __REG51_H__

#ifdef VS_CODE_INTELLISENSE
/* ==================== 编辑器模式：纯 C 模拟 ==================== */

/* 由 c_cpp_properties.json 的 defines 兜底，这里再保证一次 */
#ifndef sfr
#define sfr  volatile unsigned char
#endif
#ifndef sbit
#define sbit volatile unsigned char
#endif

/* 用作 sbit 基址的端口：常量（见文件头说明的限制 1） */
#define P1 0x90
#define P2 0xA0
#define P3 0xB0

/* 其余 SFR：普通变量，可读可写 */
sfr P0   = 0x80;
sfr PSW  = 0xD0;
sfr ACC  = 0xE0;
sfr B    = 0xF0;
sfr SP   = 0x81;
sfr DPL  = 0x82;
sfr DPH  = 0x83;
sfr PCON = 0x87;
sfr TCON = 0x88;
sfr TMOD = 0x89;
sfr TL0  = 0x8A;
sfr TL1  = 0x8B;
sfr TH0  = 0x8C;
sfr TH1  = 0x8D;
sfr IE   = 0xA8;
sfr IP   = 0xB8;
sfr SCON = 0x98;
sfr SBUF = 0x99;

/* 位声明：直接用位地址（与 Keil 原版一致，常量初始化，解析干净） */
sbit CY   = 0xD7;
sbit AC   = 0xD6;
sbit F0   = 0xD5;
sbit RS1  = 0xD4;
sbit RS0  = 0xD3;
sbit OV   = 0xD2;
sbit P    = 0xD0;

sbit TF1  = 0x8F;
sbit TR1  = 0x8E;
sbit TF0  = 0x8D;
sbit TR0  = 0x8C;
sbit IE1  = 0x8B;
sbit IT1  = 0x8A;
sbit IE0  = 0x89;
sbit IT0  = 0x88;

sbit EA   = 0xAF;
sbit ES   = 0xAC;
sbit ET1  = 0xAB;
sbit EX1  = 0xAA;
sbit ET0  = 0xA9;
sbit EX0  = 0xA8;

sbit PS   = 0xBC;
sbit PT1  = 0xBB;
sbit PX1  = 0xBA;
sbit PT0  = 0xB9;
sbit PX0  = 0xB8;

sbit RD   = 0xB7;
sbit WR   = 0xB6;
sbit T1   = 0xB5;
sbit T0   = 0xB4;
sbit INT1 = 0xB3;
sbit INT0 = 0xB2;
sbit TXD  = 0xB1;
sbit RXD  = 0xB0;

sbit SM0  = 0x9F;
sbit SM1  = 0x9E;
sbit SM2  = 0x9D;
sbit REN  = 0x9C;
sbit TB8  = 0x9B;
sbit RB8  = 0x9A;
sbit TI   = 0x99;
sbit RI   = 0x98;

#else
/* ==================== 真实编译：Keil C51 语法 ==================== */
/* 内容与 Keil 原版 C51\INC\reg51.h 一致；编译器原生支持 sfr/sbit */
#ifdef __SDCC
#error "SDCC 编译请包含 <at89x51.h>，不要包含 reg51.h（那是 Keil 的声明文件）"
#endif

/*  BYTE Register  */
sfr P0   = 0x80;
sfr P1   = 0x90;
sfr P2   = 0xA0;
sfr P3   = 0xB0;
sfr PSW  = 0xD0;
sfr ACC  = 0xE0;
sfr B    = 0xF0;
sfr SP   = 0x81;
sfr DPL  = 0x82;
sfr DPH  = 0x83;
sfr PCON = 0x87;
sfr TCON = 0x88;
sfr TMOD = 0x89;
sfr TL0  = 0x8A;
sfr TL1  = 0x8B;
sfr TH0  = 0x8C;
sfr TH1  = 0x8D;
sfr IE   = 0xA8;
sfr IP   = 0xB8;
sfr SCON = 0x98;
sfr SBUF = 0x99;

/*  BIT Register  */
sbit CY   = 0xD7;
sbit AC   = 0xD6;
sbit F0   = 0xD5;
sbit RS1  = 0xD4;
sbit RS0  = 0xD3;
sbit OV   = 0xD2;
sbit P    = 0xD0;

sbit TF1  = 0x8F;
sbit TR1  = 0x8E;
sbit TF0  = 0x8D;
sbit TR0  = 0x8C;
sbit IE1  = 0x8B;
sbit IT1  = 0x8A;
sbit IE0  = 0x89;
sbit IT0  = 0x88;

sbit EA   = 0xAF;
sbit ES   = 0xAC;
sbit ET1  = 0xAB;
sbit EX1  = 0xAA;
sbit ET0  = 0xA9;
sbit EX0  = 0xA8;

sbit PS   = 0xBC;
sbit PT1  = 0xBB;
sbit PX1  = 0xBA;
sbit PT0  = 0xB9;
sbit PX0  = 0xB8;

sbit RD   = 0xB7;
sbit WR   = 0xB6;
sbit T1   = 0xB5;
sbit T0   = 0xB4;
sbit INT1 = 0xB3;
sbit INT0 = 0xB2;
sbit TXD  = 0xB1;
sbit RXD  = 0xB0;

sbit SM0  = 0x9F;
sbit SM1  = 0x9E;
sbit SM2  = 0x9D;
sbit REN  = 0x9C;
sbit TB8  = 0x9B;
sbit RB8  = 0x9A;
sbit TI   = 0x99;
sbit RI   = 0x98;

#endif /* VS_CODE_INTELLISENSE */

#endif /* __REG51_H__ */
