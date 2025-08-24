// extension.ts

import * as vscode from "vscode";
import { BookmarkProvider } from "./providers/BookmarkProvider";
import { BookmarkCommand } from "./commands/BookmarkCommand";

// -------------------------------------------------------------------------------------------------------------
function setupAdditionalListeners(provider: BookmarkProvider): vscode.Disposable[] {
    const listeners: vscode.Disposable[] = [];

    // 워크스페이스 폴더 변경 감지 → 북마크 갱신
    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.window.showInformationMessage('Workspace changed. JEXPLORER bookmarks may need to be refreshed.');
        provider.refresh();
    });

    // 확장 설정 변경 감지 → 북마크 갱신
    const configListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('JEXPLORER')) {
            provider.refresh();
        }
    });

    // 파일 저장 이벤트 감지 (현재는 로그만 출력)
    const saveListener = vscode.workspace.onDidSaveTextDocument(() => {
        console.debug('Document saved - bookmark sync triggered by SyncService');
    });

    listeners.push(workspaceListener, configListener, saveListener);
    return listeners;
}

// -------------------------------------------------------------------------------------------------------------
export function activate(context: vscode.ExtensionContext) {

    // 현재 열린 워크스페이스의 루트 경로 확인
    const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	);

    // 워크스페이스가 없으면 경고 메시지 출력 후 종료
    if (!workspaceRoot) {
        vscode.window.showWarningMessage('JEXPLORER requires an open workspace to function properly.');
        return;
    }

	// 북마크 제공자 인스턴스 생성 (TreeDataProvider 역할)
    const provider = new BookmarkProvider(workspaceRoot);

	// 명령어 등록 관리 클래스 생성 및 커맨드 등록
    const commandManager = new BookmarkCommand(provider, context);
    const commands = commandManager.registerCommands();

	// VSCode TreeView 생성 및 provider 연결
    const treeView = vscode.window.createTreeView('JEXPLORER', {
        treeDataProvider: provider,
        canSelectMany: true,
        showCollapseAll: true
    });

	// 추가 리스너 등록 (워크스페이스 변경, 설정 변경, 파일 저장 이벤트)
    const additionalListeners = setupAdditionalListeners(provider);

    // 확장이 종료될 때 자동으로 해제될 리소스 등록
    context.subscriptions.push(
        treeView,
        ...commands,
        ...additionalListeners,
        { dispose: () => provider.dispose() }
    );
}

// -------------------------------------------------------------------------------------------------------------
export function deactivate() {}