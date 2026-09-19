'use strict';
/* ---------------------------------------------------------------------------
 * Development experience — project type detection, smart build, flash, serial
 * port detection, context.md generation, git init.
 *
 * Project types detected (in priority order):
 *   eide      — .eide/ directory present (uses EIDE extension)
 *   cmake     — CMakeLists.txt present (uses CMake Tools)
 *   makefile  — Makefile present
 *   platformio — platformio.ini present
 *   unknown   — none of the above
 *
 * Smart build:
 *   - Registers a VSCode Task per project type (not hijacking F7)
 *   - Status bar item shows project type + click-to-build
 *   - When EIDE is present, we step back and let EIDE handle F7
 *
 * Flash/debug:
 *   - STM32: openocd with auto-board-config from MCU prefix
 *   - STC51: stcgal with auto-detected serial port
 *   - AT89S51/AT89S52: avrdude + USBasp（AT89 的 ISP 走 P1.5/P1.6/P1.7 的 SPI，
 *                        EIDE 内置的烧录器都不支持它）
 *   - ESP32: idf.py flash (if in PATH)
 *
 * Serial port detection (zero deps):
 *   Windows: PowerShell [System.IO.Ports.SerialPort]::GetPortNames()
 *   Linux/Mac: ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
 *
 * Context file:
 *   Auto-generates .dev-wizard/context.md with project metadata, build/flash
 *   commands, toolchain paths — so AI assistants (Copilot, Claude Code, etc.)
 *   have accurate context without guessing.
 *
 * Git init:
 *   Optional git init + initial commit on project creation (off by default).
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Lazy-load vscode: only available inside the VS Code host process.
// All functions that need it call getVs() at the top.
let _vs;
function getVs() {
    if (!_vs) _vs = require('vscode');
    return _vs;
}

function which(cmd) {
    try {
        const out = execSync(
            process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`,
            { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
        );
        return out.toString().trim().split(/\r?\n/)[0] || null;
    } catch (e) {
        return null;
    }
}

/* Detect project type from a directory (project root). */
function detectProjectType(projectDir) {
    if (!projectDir || !fs.existsSync(projectDir)) return { type: 'unknown', detail: '目录不存在' };

    const checks = [
        { type: 'eide', check: () => fs.existsSync(path.join(projectDir, '.eide')), detail: 'EIDE 工程（用 EIDE 扩展构建）' },
        { type: 'cmake', check: () => fs.existsSync(path.join(projectDir, 'CMakeLists.txt')), detail: 'CMake 工程' },
        { type: 'makefile', check: () => fs.existsSync(path.join(projectDir, 'Makefile')), detail: 'Makefile 工程' },
        { type: 'platformio', check: () => fs.existsSync(path.join(projectDir, 'platformio.ini')), detail: 'PlatformIO 工程' }
    ];

    for (const c of checks) {
        if (c.check()) return { type: c.type, detail: c.detail };
    }
    return { type: 'unknown', detail: '未识别的工程类型' };
}

/* Auto-detect serial ports (COM on Windows, /dev/tty* on Linux/Mac). */
function detectSerialPorts() {
    try {
        if (process.platform === 'win32') {
            const ps = `try { [System.IO.Ports.SerialPort]::GetPortNames() } catch { @() }`;
            const out = execSync(`powershell.exe -NoProfile -Command ${ps}`, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
            const ports = out.toString().trim().split(/\r?\n/).filter(Boolean);
            return ports.map((p) => ({ port: p, description: p }));
        } else {
            const out = execSync('ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true', { stdio: ['ignore', 'pipe', 'ignore'] });
            const ports = out.toString().trim().split(/\n/).filter(Boolean);
            return ports.map((p) => ({ port: path.basename(p), description: p }));
        }
    } catch (e) {
        return [];
    }
}

/* Locate the built hex for a project: EIDE writes to <outDir>/<target>/,
 * the standalone build.ps1 writes to build/. Returns a project-relative path
 * (or a glob) to hand to the flasher. */
function findHex(projectDir) {
    const cands = [
        path.join('build', 'Debug', 'main.hex'),
        path.join('build', 'main.hex'),
        path.join('build', 'Debug', 'firmware.hex'),
        path.join('build', 'firmware.hex')
    ];
    for (const c of cands) {
        if (fs.existsSync(path.join(projectDir, c))) return c.replace(/\\/g, '/');
    }
    return 'build/*.hex';
}

/* AT89 系列（AT89S51 / AT89S52 / AT89C51 …）：8 位 8051 内核，
 * avrdude 的器件名按 Flash 容量区分。 */
function at89Part(mcu) {
    return /S52|C52|S8252|S8253/i.test(mcu) ? 'at89s52' : 'at89s51';
}

const isAt89 = (mcu) => /^AT89/i.test(String(mcu || ''));

/* Generate .dev-wizard/context.md with project metadata. */
function generateContextFile(projectDir, opts) {
    opts = opts || {};
    const vscode = getVs();
    const ctxDir = path.join(projectDir, '.dev-wizard');
    fs.mkdirSync(ctxDir, { recursive: true });
    const ctxFile = path.join(ctxDir, 'context.md');

    const pt = detectProjectType(projectDir);
    const mcu = opts.mcu || '';
    const board = opts.board || '';
    const serialPort = opts.serialPort || '';

    const buildCmd = (() => {
        // EIDE 工程如果还带了独立构建脚本（模板 at89s51-base 就有），一并写出来
        const hasScript = fs.existsSync(path.join(projectDir, 'build.ps1'));
        switch (pt.type) {
            case 'eide': return 'F7（EIDE 扩展）' + (hasScript ? '；或 .\\build.ps1（SDCC 命令行）' : '');
            case 'cmake': return 'cmake --build build';
            case 'makefile': return 'make';
            case 'platformio': return 'pio run';
            default: return '(未识别)';
        }
    })();

    const flashCmd = (() => {
        if (mcu.startsWith('STM32')) return `openocd -f board/stm32f103c8t6.cfg -c "program build/*.elf verify reset exit"`;
        if (mcu.startsWith('STC')) return `stcgal -p ${serialPort || 'COMx'} build/*.hex`;
        if (isAt89(mcu)) return `avrdude -c usbasp -p ${at89Part(mcu)} -U flash:w:${findHex(projectDir)}:i`;
        if (mcu.startsWith('ESP32')) return 'idf.py flash';
        return '(未配置)';
    })();

    const toolchain = (() => {
        if (pt.type === 'eide') {
            const cfg = vscode.workspace.getConfiguration('EIDE');
            const arm = cfg.get('ARM.GCC.InstallDirectory') || '(未设置)';
            const sdcc = cfg.get('SDCC.InstallDirectory') || '(未设置)';
            return `ARM GCC: ${arm}\nSDCC: ${sdcc}`;
        }
        return '(使用系统 PATH)';
    })();

    const lines = [
        `# 工程上下文 / Project Context`,
        ``,
        `**工程名**: ${path.basename(projectDir)}`,
        `**类型**: ${pt.type.toUpperCase()} · ${pt.detail}`,
        `**MCU**: ${mcu || '(未指定)'}`,
        `**开发板**: ${board || '(未指定)'}`,
        ``,
        `## 构建 / Build`,
        `命令: \`${buildCmd}\``,
        ``,
        `## 烧录 / Flash`,
        `命令: \`${flashCmd}\``,
        `串口: ${serialPort || '(未探测)'}`,
        ``,
        `## 工具链 / Toolchain`,
        toolchain,
        ``,
        `## 备注 / Notes`,
        opts.contextHint || '(无)',
        ``
    ];

    fs.writeFileSync(ctxFile, lines.join('\n'), 'utf8');
    return ctxFile;
}

/* Git init + initial commit (non-blocking, best-effort). */
function gitInit(projectDir) {
    try {
        const git = which('git');
        if (!git) return { ok: false, error: 'git 不在 PATH' };
        execSync(`git init`, { cwd: projectDir, stdio: 'pipe', windowsHide: true });
        execSync(`git add -A`, { cwd: projectDir, stdio: 'pipe', windowsHide: true });
        execSync(`git -c user.email=dev-wizard@local -c user.name="Dev Wizard" commit -m "Initial scaffold"`, { cwd: projectDir, stdio: 'pipe', windowsHide: true });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e && e.stderr ? String(e.stderr) : String(e && e.message || e)).slice(0, 300) };
    }
}

/* Register a VSCode Task for the detected project type (so the user can use
 * the Tasks panel / keybindings). Does NOT hijack F7 (EIDE owns that). */
function registerBuildTask(projectDir) {
    const vscode = getVs();
    const pt = detectProjectType(projectDir);
    const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    if (!workspaceFolder) return;

    const taskDefs = {
        cmake: {
            type: 'shell',
            command: 'cmake',
            args: ['--build', 'build'],
            label: 'CMake Build'
        },
        makefile: {
            type: 'shell',
            command: 'make',
            args: [],
            label: 'Make'
        },
        platformio: {
            type: 'shell',
            command: 'pio',
            args: ['run'],
            label: 'PlatformIO Build'
        }
    };

    if (pt.type === 'eide') return; // EIDE extension handles its own tasks
    if (!taskDefs[pt.type]) return;

    const def = taskDefs[pt.type];
    const task = new vscode.Task(
        { type: 'dev-wizard' },
        workspaceFolder,
        def.label,
        'Dev Wizard',
        new vscode.ShellExecution(def.command, def.args, { cwd: projectDir })
    );
    vscode.tasks.taskExecutions; // just to ensure tasks namespace is loaded
    return task;
}

/* Flash command builder (returns the full command string + args). */
function buildFlashCommand(projectDir, opts) {
    opts = opts || {};
    const pt = detectProjectType(projectDir);
    const mcu = opts.mcu || '';
    const port = opts.serialPort || '';

    if (mcu.startsWith('STM32')) {
        const openocd = which('openocd');
        if (!openocd) return { ok: false, error: 'openocd 不在 PATH' };
        const boardCfg = opts.openocdCfg || `board/stm32f103c8t6.cfg`;
        const elf = fs.existsSync(path.join(projectDir, 'build', 'firmware.elf'))
            ? 'build/firmware.elf'
            : 'build/*.elf';
        return {
            ok: true,
            command: openocd,
            args: ['-f', boardCfg, '-c', `program ${elf} verify reset exit`],
            cwd: projectDir
        };
    }

    if (mcu.startsWith('STC')) {
        const stcgal = which('stcgal');
        if (!stcgal) return { ok: false, error: 'stcgal 不在 PATH' };
        const hex = fs.existsSync(path.join(projectDir, 'build', 'firmware.hex'))
            ? 'build/firmware.hex'
            : 'build/*.hex';
        return {
            ok: true,
            command: stcgal,
            args: ['-p', port, hex],
            cwd: projectDir
        };
    }

    if (isAt89(mcu)) {
        // AT89S51/AT89S52 用 SPI-ISP 下载，市面主流做法是 USBasp + avrdude。
        // EIDE 的内置烧录器（stcgal/openocd/pyocd/jlink/stlink）都不认这系列芯片。
        const avrdude = which('avrdude');
        if (!avrdude) {
            return {
                ok: false,
                error: 'avrdude 不在 PATH。AT89S51 需要 USBasp + avrdude 下载（也可用 ProgISP 等图形工具）'
            };
        }
        return {
            ok: true,
            command: avrdude,
            args: ['-c', opts.programmer || 'usbasp', '-p', at89Part(mcu), '-U', `flash:w:${findHex(projectDir)}:i`],
            cwd: projectDir
        };
    }

    if (mcu.startsWith('ESP32')) {
        const idfpy = which('idf.py');
        if (!idfpy) return { ok: false, error: 'idf.py 不在 PATH（需 ESP-IDF 环境）' };
        return {
            ok: true,
            command: idfpy,
            args: ['flash'],
            cwd: projectDir
        };
    }

    return { ok: false, error: `未识别的 MCU 类型: ${mcu || '(空)'}` };
}

/* Execute a flash command (with confirmation dialog). */
async function executeFlash(projectDir, opts) {
    const vscode = getVs();
    const cmd = buildFlashCommand(projectDir, opts);
    if (!cmd.ok) {
        vscode.window.showErrorMessage(`烧录失败: ${cmd.error}`);
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `即将执行烧录:\n${cmd.command} ${cmd.args.join(' ')}\n\n确认继续？`,
        { modal: true },
        '允许'
    );
    if (confirm !== '允许') return;

    return new Promise((resolve) => {
        const proc = spawn(cmd.command, cmd.args, { cwd: cmd.cwd, stdio: 'pipe' });
        const out = vscode.window.createOutputChannel('Dev Wizard Flash');
        out.clear();
        out.show();

        proc.stdout.on('data', (d) => out.appendLine(d.toString()));
        proc.stderr.on('data', (d) => out.appendLine(d.toString()));
        proc.on('close', (code) => {
            if (code === 0) {
                vscode.window.showInformationMessage('✔ 烧录完成');
                resolve(true);
            } else {
                vscode.window.showErrorMessage(`烧录失败（exit code ${code}）`);
                resolve(false);
            }
        });
        proc.on('error', (e) => {
            vscode.window.showErrorMessage(`烧录进程错误: ${e.message}`);
            resolve(false);
        });
    });
}

module.exports = {
    detectProjectType,
    detectSerialPorts,
    generateContextFile,
    gitInit,
    registerBuildTask,
    buildFlashCommand,
    executeFlash,
    isAt89,
    at89Part,
    findHex,
    which
};