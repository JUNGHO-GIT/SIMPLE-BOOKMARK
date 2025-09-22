// utils/NotificationUtil.ts

import * as vscode from "vscode";

// VSCode 기본 showInformationMessage 는 프로그래매틱 dismiss 불가.
// 요구: 3초 후 자동 사라짐 → withProgress(Notification) 사용 후 3초 타이머 resolve.
// 버튼이 없는 단순 알림만 이 유틸을 통해 호출(확인/취소 선택이 필요한 confirm 은 기존 API 유지)

const AUTO_CLOSE_MS = 3000;

const runTimedNotification = async (message: string, type: "info" | "warn" | "error"): Promise<void> => {
	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: false,
			title: message
		}, async () => {
			await new Promise(res => setTimeout(res, AUTO_CLOSE_MS));
		});
	} catch { /* noop */ }
};

export const showInfoAuto = (msg: string): void => { runTimedNotification(msg, "info").then(() => {}); };
export const showWarnAuto = (msg: string): void => { runTimedNotification(msg, "warn").then(() => {}); };
export const showErrorAuto = (msg: string): void => { runTimedNotification(msg, "error").then(() => {}); };
