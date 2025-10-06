// utils/NotificationUtil.ts

import * as vscode from "vscode";

// -----------------------------------------------
const DELAY_MS = 3000;

// -----------------------------------------------
const fnShowNotification = (message: string, type: "info" | "warn" | "error"): void => {
	const notification = (
		type === "info" ? vscode.window.showInformationMessage(message, {modal: false}) :
		type === "warn" ? vscode.window.showWarningMessage(message, {modal: false}) :
		vscode.window.showErrorMessage(message, {modal: false})
	);

	setTimeout(() => {
		notification.then(() => {});
	}, DELAY_MS);
};

// -----------------------------------------------
export const showInfoAuto = (msg: string): void => fnShowNotification(msg, "info");

// -----------------------------------------------
export const showWarnAuto = (msg: string): void => fnShowNotification(msg, "warn");

// -----------------------------------------------
export const showErrorAuto = (msg: string): void => fnShowNotification(msg, "error");
