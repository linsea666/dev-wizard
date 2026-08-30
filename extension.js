const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const SKIP_KEY = 'devWizard.skipNext';
const LAST_KEY = 'devWizard.lastProject';
const MANIFEST_FILE = '.wizard.json';
const NAME_PLACEHOLDER = '<name>';

function cfg() {
    return vscode.workspace.getConfiguration('devWizard');
}

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return null;
    }
}

/* ---------------------------------------------------------------------------
 * Template discovery
 * Every subfolder of templatesRoot is a template.
 * Optional `.wizard.json` manifest:
 * {
 *   "label":       "新建 STC51 工程",          // shown in the list
 *   "description": "SDCC + EIDE ...",          // shown under the label
 *   "icon":        "chip",                     // any codicon name
 *   "open":        "workspace",                // "workspace" | "folder" (auto if omitted)
 *   "replace": [                               // text patches applied after copying
 *     { "files": ["CMakeLists.txt"], "find": "esp32-base" }
 *   ]
 * }
 * Automatic behaviour (no manifest needed):
 *  - `.eide/eide.json` gets its `.name` set to the project name (EIDE projects)
 *  - a `*.code-workspace` in the template root is renamed to <name>.code-workspace
 *    and opened instead of the folder
 * ------------------------------------------------------------------------- */
function listTemplates(root) {
    const out = [];
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
        return out;
    }
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const dir = path.join(root, ent.name);
        let files = [];
        try {
            files = fs.readdirSync(dir);
        } catch (e) {
            continue;
        }
        const mf = readJsonSafe(path.join(dir, MANIFEST_FILE)) || {};
        const hasWorkspace = files.some((f) => f.endsWith('.code-workspace'));
        out.push({
            id: ent.name,
            dir,
            label: mf.label || ent.name,
            description: mf.description || '',
            icon: mf.icon || 'new-folder',
            open: mf.open || (hasWorkspace ? 'workspace' : 'folder'),
            replace: Array.isArray(mf.replace) ? mf.replace : []
        });
    }
    return out;
}

function copyTemplate(tplDir, dest) {
    fs.cpSync(tplDir, dest, { recursive: true });
    const buildDir = path.join(dest, 'build');
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true, force: true });
    }
}

function patchEideName(file, name) {
    const obj = readJsonSafe(file);
    if (obj && typeof obj.name === 'string') {
        obj.name = name;
        fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
    }
}

function replaceInFile(file, from, to) {
    try {
        const txt = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, txt.split(from).join(to), 'utf8');
    } catch (e) {
        // tolerate missing/unreadable files listed in the manifest
    }
}

async function openTarget(ctx, target) {
    ctx.globalState.update(SKIP_KEY, true);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), false);
}

/* Create a project from a template. Returns true when "no choice was made"
 * (input cancelled, missing template...) so the wizard can re-show itself. */
async function createProject(tpl, ctx) {
    const name = await vscode.window.showInputBox({
        prompt: 'Project name? (letters / digits / _ / -)   请输入工程名称',
        placeHolder: 'e.g. led-demo',
        validateInput: (v) => {
            if (!v) return 'Name cannot be empty  名称不能为空';
            if (!/^[A-Za-z0-9_-]+$/.test(v)) return 'Only letters, digits, _ and -  只能使用字母数字下划线中划线';
            return null;
        }
    });
    if (!name) return true;

    let projectsRoot = cfg().get('projectsRoot');
    if (!projectsRoot) projectsRoot = cfg().get('templatesRoot');
    const dest = path.join(projectsRoot, name);

    if (!fs.existsSync(tpl.dir)) {
        vscode.window.showErrorMessage('Template not found: ' + tpl.dir);
        return true;
    }
    if (fs.existsSync(dest)) {
        vscode.window.showErrorMessage('Project already exists: ' + dest);
        return true;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Creating project ${name} ...` },
        async () => {
            copyTemplate(tpl.dir, dest);

            // EIDE project: keep eide.json name in sync
            const eideJson = path.join(dest, '.eide', 'eide.json');
            if (fs.existsSync(eideJson)) {
                patchEideName(eideJson, name);
            }

            // rename shipped .code-workspace to <name>.code-workspace
            const files = fs.readdirSync(dest);
            const oldWs = files.find((f) => f.endsWith('.code-workspace'));
            if (oldWs) {
                fs.renameSync(path.join(dest, oldWs), path.join(dest, name + '.code-workspace'));
            }

            // manifest-driven text replacements
            for (const r of tpl.replace) {
                if (!r || !r.find) continue;
                for (const f of r.files || []) {
                    replaceInFile(path.join(dest, f), r.find, name);
                }
            }

            const target =
                tpl.open === 'workspace' && fs.existsSync(path.join(dest, name + '.code-workspace'))
                    ? path.join(dest, name + '.code-workspace')
                    : dest;
            await openTarget(ctx, target);
        }
    );

    vscode.window.showInformationMessage(`✔ Project created: ${name}`);
    return false;
}

/* Show the wizard once. Returns true when dismissed without a real choice,
 * so the caller can re-show it (the wizard "stays" until a choice is made). */
async function showWizardOnce(ctx, templates) {
    const last = ctx.globalState.get(LAST_KEY);

    const items = [
        {
            kind: 'continue',
            label: '$(history) 继续上次的工作 / Continue last work',
            description: last || '（暂无记录 / no history yet）'
        }
    ];

    if (templates.length) {
        items.push({ kind: 'sep', label: '─'.repeat(24) + ' 开始新工程 / New project ' + '─'.repeat(24) });
        for (const t of templates) {
            items.push({
                kind: 'new',
                tpl: t,
                label: `$(${t.icon}) ${t.label}`,
                description: t.description
            });
        }
    } else {
        items.push({
            kind: 'notpl',
            label: '$(warning) 未找到模板 / No templates found',
            description: `在设置 devWizard.templatesRoot 指向的目录下放模板文件夹 / put template folders into devWizard.templatesRoot`
        });
    }

    items.push({ kind: 'skip', label: '$(circle-slash) 今天先这样 / Not today' });

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '今天要做什么？ What are we doing today? （不选择会一直停留 / stays until you choose）',
        ignoreFocusOut: true,
        matchOnDescription: true
    });

    if (!pick || !pick.kind || pick.kind === 'sep') return true;
    if (pick.kind === 'skip') return false;
    if (pick.kind === 'notpl') return true;

    if (pick.kind === 'continue') {
        if (!last) {
            vscode.window.showInformationMessage('还没有历史工程记录 / No project history yet');
            return false;
        }
        const cur = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
        if (cur && cur.uri.fsPath.toLowerCase() === String(last).toLowerCase()) {
            vscode.window.showInformationMessage('当前已经在上次的工程里 / Already in the last project');
            return false;
        }
        await openTarget(ctx, last);
        return false;
    }

    return await createProject(pick.tpl, ctx);
}

/* Wizard loop: re-show until the user makes a real choice. */
async function showWizard(ctx) {
    let templates = listTemplates(cfg().get('templatesRoot'));
    for (;;) {
        const dismissed = await showWizardOnce(ctx, templates);
        if (!dismissed) return;
        console.log('[dev-wizard] dismissed without choice, re-showing');
        await new Promise((r) => setTimeout(r, 800));
    }
}

function activate(ctx) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.show', () => showWizard(ctx))
    );

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) {
        ctx.globalState.update(LAST_KEY, folders[0].uri.fsPath);
    }

    if (cfg().get('showOnStartup', true) === false) {
        console.log('[dev-wizard] startup popup disabled by setting');
        return;
    }

    // don't re-pop right after the wizard itself opened a new project
    if (ctx.globalState.get(SKIP_KEY)) {
        console.log('[dev-wizard] skip-once flag set, skip this startup');
        ctx.globalState.update(SKIP_KEY, false);
        return;
    }

    setTimeout(() => showWizard(ctx), 2500);
}

function deactivate() {}

module.exports = { activate, deactivate };
