/**
 * 決定エンドポイントのモック。UI が authority を持たないことを実証するために、
 * expiry / one-shot / stale page を **server 側で** 再検証する。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

export function startMockServer({ root = 'dist', cards = [], csp = true } = {}) {
  const state = {
    dispatches: [],          // 実際に effect が発生した回数（二重送信の検出用）
    decided: new Set(),      // one-shot: 一度決まったカードは二度と受け付けない
    requests: [],
  };
  const byId = new Map(cards.map((c) => [c.id, c]));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'POST' && url.pathname.startsWith('/api/cards/')) {
      const cardId = url.pathname.split('/')[3];
      const raw = await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
      const params = new URLSearchParams(raw.includes('=') && !raw.includes('\r\n') ? raw : '');
      // multipart も雑に読む（FormData 送信時）
      const decision = params.get('decision') ?? (raw.match(/name="decision"\r\n\r\n([^\r]*)/)?.[1] ?? null);
      const cardVersion = params.get('cardVersion') ?? (raw.match(/name="cardVersion"\r\n\r\n([^\r]*)/)?.[1] ?? null);
      state.requests.push({ cardId, decision, at: Date.now() });

      const card = byId.get(cardId);
      // --- server 側の再検証。client の申告は一切信用しない -------------------
      if (!card) return json(404, { error: 'unknown-card' });
      if (card.createdAt !== cardVersion) return json(409, { error: 'stale-page', ownerVisibleMessage: 'ページが古いため受け付けませんでした。再読み込みしてください。' });
      if (card.state !== 'LIVE') return json(409, { error: 'not-live', ownerVisibleMessage: 'この項目はすでに終了しています。' });
      if (card.expiresAt && new Date(card.expiresAt).getTime() < Date.now()) {
        return json(410, { error: 'expired', ownerVisibleMessage: '承認期限を過ぎています。実行していません。' });
      }
      const allowed = { OWNER_QUESTION: ['ANSWER', 'SNOOZE'], ACTION_APPROVAL: ['ALLOW_ONCE', 'REFUSE', 'SNOOZE'] }[card.type] ?? [];
      if (allowed.length && !allowed.includes(decision)) return json(422, { error: 'semantic-not-allowed' });
      if (state.decided.has(cardId)) {
        return json(409, { error: 'already-decided', ownerVisibleMessage: 'この承認はすでに使われています（1 回限り）。' });
      }
      state.decided.add(cardId);
      if (decision === 'ALLOW_ONCE') state.dispatches.push({ cardId, at: Date.now() });
      return json(200, { ok: true, decision, ownerVisibleMessage: `サーバが受け付けました: ${decision}` });
    }

    try {
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      let file = join(root, p);
      const s = await stat(file).catch(() => null);
      if (s?.isDirectory()) file = join(file, 'index.html');
      const buf = await readFile(file);
      const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (csp) headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
      res.writeHead(200, headers);
      res.end(buf);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
    }
  });

  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state })));
}
