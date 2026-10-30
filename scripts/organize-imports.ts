import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const configPath = ts.findConfigFile(".", ts.sys.fileExists)!;
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(configPath),
);
const files = config.fileNames.filter(
  (file) => !file.includes(".well-known") && !file.includes(".next"),
);
const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => files,
  getScriptVersion: () => "0",
  getScriptSnapshot: (file) =>
    ts.sys.fileExists(file)
      ? ts.ScriptSnapshot.fromString(ts.sys.readFile(file)!)
      : undefined,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getCompilationSettings: () => config.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};
const service = ts.createLanguageService(host);
for (const file of files) {
  for (const change of service.organizeImports(
    { type: "file", fileName: file },
    {},
    {},
  )) {
    let content = fs.readFileSync(change.fileName, "utf8");
    for (const edit of [...change.textChanges].sort(
      (a, b) => b.span.start - a.span.start,
    ))
      content =
        content.slice(0, edit.span.start) +
        edit.newText +
        content.slice(edit.span.start + edit.span.length);
    fs.writeFileSync(change.fileName, content);
  }
}
service.dispose();
