// utils/NotificationUtil.ts

import * as vscode from "vscode";

// 알림 표시 최적화 - 3초 대기 제거, 즉시 표시 -----------------------------------------------
const showNotification = (
	message: string,
	type: "info" | "warn" | "error"
): void => {
	type === "info"
	? vscode.window.showInformationMessage(message)
	: type === "warn"
	? vscode.window.showWarningMessage(message)
	: vscode.window.showErrorMessage(message);
};

// info --------------------------------------------------------------------------------------------------
export const showInfoAuto = (
	msg: string
): void => showNotification(msg, "info");

// warn --------------------------------------------------------------------------------------------------
export const showWarnAuto = (
	msg: string
): void => showNotification(msg, "warn");

// error -------------------------------------------------------------------------------------------------
export const showErrorAuto = (
	msg: string
): void => showNotification(msg, "error");
