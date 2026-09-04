/** dist/ を配信する最小の静的サーバ。外部ネットワークへ出ない。 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = process.env.SERVE_ROOT ?? 'dist';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json' };

export function startServer(port = 0, root = ROOT) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      let file = join(root, p);
      const s = await stat(file).catch(() => null);
      if (s?.isDirectory()) file = join(file, 'index.html');
      const buf = await readFile(file);
      // VGUI の Owner gallery だけは、生存案を same-origin の iframe に隔離して blind 比較する。
      // そのため /vgui/ 配下に限り frame-ancestors を 'self' にする（他 origin からの framing は依然禁止＝
      // clickjacking 防御は維持、script-src 'self' も不変）。それ以外は 'none' のまま。
      const frameAncestors = p.startsWith('/vgui/') ? "'self'" : "'none'";
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors ${frameAncestors}; base-uri 'none'`,
        'x-content-type-options': 'nosniff',
      });
      res.end(buf);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startServer(Number(process.env.PORT ?? 8080));
  console.log(`http://127.0.0.1:${port}/`);
}
