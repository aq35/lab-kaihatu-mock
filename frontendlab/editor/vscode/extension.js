// sunao VSCode 拡張のエントリ。構文ハイライトは package.json の grammar が担当し、
// ここでは LSP クライアントを起動して tools/lsp.mjs（依存ゼロのサーバ）に stdio で繋ぐだけ。
const path = require('path');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

function activate(context) {
  // 拡張は frontendlab/editor/vscode/ にある想定。サーバは frontendlab/tools/lsp.mjs。
  const serverModule = context.asAbsolutePath(path.join('..', '..', 'tools', 'lsp.mjs'));
  const server = { command: process.execPath, args: [serverModule], transport: TransportKind.stdio };
  const serverOptions = { run: server, debug: server };
  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'sunao' }],
    // 保存時のみでなく編集中も診断が欲しいので Full 同期（サーバも textDocumentSync: Full）。
  };
  client = new LanguageClient('sunao', 'sunao LSP', serverOptions, clientOptions);
  client.start();
}

function deactivate() {
  return client ? client.stop() : undefined;
}

module.exports = { activate, deactivate };
