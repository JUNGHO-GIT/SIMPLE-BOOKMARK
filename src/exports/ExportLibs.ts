// exports/ExportLibs.ts

// 1. import --------------------------------------------------------------------------------
import _vscode from "vscode";
import _fs from "fs";
import _path from "path";
import _http from "http";
import _https from "https";
import { createRequire as _createRequire } from "module";
import { Minimatch as _Minimatch } from "minimatch";

// 2. export --------------------------------------------------------------------------------
export { _vscode as vscode };
export { _fs as fs };
export { _path as path };
export { _http as http };
export { _https as https };
export { _createRequire as createRequire };
export { _Minimatch as Minimatch };