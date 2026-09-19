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
const { execSync } = require('child_process');

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

/* Locate a build artifact (.hex/.elf) for a project: EIDE writes to
 * <outDir>/<target>/<project>.hex, build.ps1 writes to build\*.hex.
 * Preference: <工程名>.hex > main/firmware.hex > 第一个命中。
 * Returns a project-relative path, or null when nothing was built. */
function findArtifact(projectDir, ext) {
    ext = (ext || '.hex').toLowerCase();
    const base = path.basename(projectDir);
    const score = (f) => {
        if (!f.toLowerCase().endsWith(ext)) return 9;
        const stem = path.parse(f).name.toLowerCase();
        if (stem === base.toLowerCase()) return 0;
        if (stem === 'main' || stem === 'firmware') return 1;
        return 2;
    };
    for (const d of [path.join('build', 'Debug'), path.join('build', 'Release'), 'build', '.']) {
        const abs = path.join(projectDir, d);
        let files = [];
        try {
            files = fs.readdirSync(abs);
        } catch (e) {
            continue;
        }
        const hits = files.filter((f) => score(f) < 9).sort((a, b) => score(a) - score(b));
        if (hits.length) return path.join(d, hits[0]).replace(/\\/g, '/');
    }
    return null;
}

function findHex(projectDir) {
    return findArtifact(projectDir, '.hex');
}

/* stcgal 协议推断：.eide/stc.flash.json（模板自带，与 EIDE 烧录按钮同一份配置）
 * 最权威；其次按芯片前缀猜。STC8/STC12 有多套协议，猜错会白烧一次，留给用户选。 */
function readEideFlashOptions(projectDir) {
    try {
        const yml = fs.readFileSync(path.join(projectDir, '.eide', 'eide.yml'), 'utf8');
        // 注意用 [ \t]* 匹配同行值——\s 会跨行吞掉下一个键
        const up = yml.match(/^[ \t]*uploader:[ \t]*(\S+)/m);
        const op = yml.match(/^[ \t]*options:[ \t]*(\S+)/m);
        if (up && up[1] === 'stcgal' && op) {
            const j = JSON.parse(fs.readFileSync(path.join(projectDir, op[1]), 'utf8'));
            if (j && j.device) return { device: j.device, baudrate: j.baudrate || '', oscFreq: j.oscFreq || '' };
        }
    } catch (e) {
        /* fall through */
    }
    return null;
}

function stcProtocolFromMcu(mcu) {
    if (/^STC89/i.test(mcu)) return 'stc89';
    if (/^STC15/i.test(mcu)) return 'stc15';
    return '';
}

/* 从工程文件推断 MCU 型号：context.md（建工程时生成）→ eide.yml deviceName */
function detectMcu(projectDir) {
    try {
        const ctx = fs.readFileSync(path.join(projectDir, '.dev-wizard', 'context.md'), 'utf8');
        const m = ctx.match(/\*\*MCU\*\*:\s*([^\s*]+)/);
        if (m && m[1] && !/未指定/.test(m[1])) return m[1];
    } catch (e) {
        /* no context file */
    }
    try {
        const yml = fs.readFileSync(path.join(projectDir, '.eide', 'eide.yml'), 'utf8');
        const m = yml.match(/^deviceName:[ \t]*(.+)$/m);
        if (m) {
            const v = m[1].trim().replace(/^["']|["']$/g, '');
            if (v && v !== 'null') return v;
        }
    } catch (e) {
        /* not an eide project */
    }
    return '';
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

/* Flash command builder (returns the full command string + args).
 * opts: { mcu, serialPort, protocol, baud, oscFreq, programmer, openocdCfg } */
function buildFlashCommand(projectDir, opts) {
    opts = opts || {};
    const mcu = opts.mcu || '';
    const port = opts.serialPort || '';

    // STC：协议优先级 = 显式传入（模板 stc.flash.json）> 芯片前缀推断
    const protocol = opts.protocol || stcProtocolFromMcu(mcu);
    if (protocol || /^STC/i.test(mcu)) {
        const stcgal = which('stcgal');
        if (!stcgal) return { ok: false, error: 'stcgal 不在 PATH（安装：pip install stcgal）' };
        if (!port) return { ok: false, error: '未选择串口' };
        const hex = findHex(projectDir);
        if (!hex) return { ok: false, error: '找不到 .hex 产物——先编译（F7 或构建按钮）再烧录' };
        const args = ['-p', port, '-P', protocol || 'stc89'];
        if (opts.baud) args.push('-b', String(opts.baud));
        if (opts.oscFreq) args.push('-t', String(opts.oscFreq));
        args.push(hex);
        return { ok: true, command: stcgal, args, cwd: projectDir, flasher: 'stcgal' };
    }

    if (mcu.startsWith('STM32')) {
        const openocd = which('openocd');
        if (!openocd) return { ok: false, error: 'openocd 不在 PATH' };
        const boardCfg = opts.openocdCfg || `board/stm32f103c8t6.cfg`;
        const elf = findArtifact(projectDir, '.elf') || 'build/*.elf';
        return {
            ok: true,
            command: openocd,
            args: ['-f', boardCfg, '-c', `program ${elf} verify reset exit`],
            cwd: projectDir,
            flasher: 'openocd'
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
        const hex = findHex(projectDir);
        if (!hex) return { ok: false, error: '找不到 .hex 产物——先编译（F7 或 .\\build-keil.ps1）再烧录' };
        return {
            ok: true,
            command: avrdude,
            args: ['-c', opts.programmer || 'usbasp', '-p', at89Part(mcu), '-U', `flash:w:${hex}:i`],
            cwd: projectDir,
            flasher: 'avrdude'
        };
    }

    if (mcu.startsWith('ESP32')) {
        const idfpy = which('idf.py');
        if (!idfpy) return { ok: false, error: 'idf.py 不在 PATH（需 ESP-IDF 环境）' };
        return {
            ok: true,
            command: idfpy,
            args: ['flash'],
            cwd: projectDir,
            flasher: 'idf'
        };
    }

    return { ok: false, error: `无法确定烧录方式——MCU: ${mcu || '(未识别)'}` };
}

/* Execute a flash. Everything runs in the integrated terminal so the output
 * (stcgal 的握手等待、openocd 的进度) 实时可见、失败可诊断、命令可重发。
 * STC 额外弹冷启动提示——"给板子重新上电"是新手必踩的坑。 */
async function executeFlash(projectDir, opts) {
    const vscode = getVs();
    const cmd = buildFlashCommand(projectDir, opts);
    if (!cmd.ok) {
        vscode.window.showErrorMessage(`烧录失败: ${cmd.error}`);
        return false;
    }
    const fullCmd = `${cmd.command} ${cmd.args.join(' ')}`;

    if (cmd.flasher === 'stcgal') {
        const go = await vscode.window.showInformationMessage(
            'STC 芯片需要冷启动：点「开始烧录」，然后给板子断电再上电——stcgal 会自动握手并写入。',
            { modal: false },
            '开始烧录'
        );
        if (go !== '开始烧录') return false;
    } else {
        const confirm = await vscode.window.showWarningMessage(
            `即将执行烧录:\n${fullCmd}\n\n确认继续？`,
            { modal: true },
            '允许'
        );
        if (confirm !== '允许') return false;
    }

    let term = vscode.window.terminals.find((t) => t.name === 'Dev Wizard Flash' && !t.exitStatus);
    if (!term) term = vscode.window.createTerminal('Dev Wizard Flash');
    term.show(true);
    term.sendText(`cd "${cmd.cwd}"`);
    term.sendText(fullCmd);
    if (cmd.flasher === 'stcgal') {
        vscode.window.showInformationMessage('stcgal 已在终端运行——若显示 Waiting，请给板子重新上电');
    }
    return true;
}

module.exports = {
    detectProjectType,
    detectSerialPorts,
    detectMcu,
    readEideFlashOptions,
    stcProtocolFromMcu,
    generateContextFile,
    gitInit,
    registerBuildTask,
    buildFlashCommand,
    executeFlash,
    isAt89,
    at89Part,
    findHex,
    findArtifact,
    which
};