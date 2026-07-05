// exports/ExportLibs.ts

import _os from "node:os";
import _path from "node:path";
import { TextEncoder as _TextEncoder } from "node:util";
import { Minimatch as _Minimatch } from "minimatch";
// 1. import ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
import _vscode from "vscode";

// 2. export ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export { _Minimatch as Minimatch, _os as os, _path as path, _TextEncoder as TextEncoder, _vscode as vscode };
