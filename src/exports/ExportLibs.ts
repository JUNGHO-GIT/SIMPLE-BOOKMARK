// exports/ExportLibs.ts

import _fs from "node:fs";
import _http from "node:http";
import _https from "node:https";
import { createRequire as _crtRqr } from "node:module";
import _os from "node:os";
import _path from "node:path";
import { TextEncoder as _TextEncoder } from "node:util";
import { Minimatch as _Minimatch } from "minimatch";
// 1. import ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
import _vscode from "vscode";

// 2. export ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export { _crtRqr as createRequire, _fs as fs, _http as http, _https as https, _Minimatch as Minimatch, _os as os, _path as path, _TextEncoder as TextEncoder, _vscode as vscode };
