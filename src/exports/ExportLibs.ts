// exports/ExportLibs.ts

import _fs from "fs";
import _http from "http";
import _https from "https";
import { Minimatch as _Minimatch } from "minimatch";
import { createRequire as _createRequire } from "module";
import _os from "os";
import _path from "path";
import { TextEncoder as _TextEncoder } from "util";
// 1. import ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
import _vscode from "vscode";

// 2. export ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export {
	_createRequire as createRequire,
	_fs as fs,
	_http as http,
	_https as https,
	_Minimatch as Minimatch,
	_os as os,
	_path as path,
	_TextEncoder as TextEncoder,
	_vscode as vscode,
};
