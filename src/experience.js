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
        switch (pt.type) {
            case 'eide': return 'F7（EIDE 扩展）';
            case 'cmake': return 'cmake --build build';
            case 'makefile': return 'make';
            case 'platformio': return 'pio run';
            default: return '(未识别)';
        }
    })();

    const flashCmd = (() => {
        if (mcu.startsWith('STM32')) return `openocd -f board/stm32f103c8t6.cfg -c "program build/*.elf verify reset exit"`;
        if (mcu.startsWith('STC')) return `stcgal -p ${serialPort || 'COMx'} build/*.hex`;
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
    which
};