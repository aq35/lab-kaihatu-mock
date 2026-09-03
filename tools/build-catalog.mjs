/**
 * 創造性比較 (UI-11) 用のカタログを生成する。
 *
 * 同一の意味 DOM から、theme を切り替えただけの版を並べる。
 * 「意味 DOM の差分が 0 であること」を各ページに明記し、
 * Owner が blind comparison できるように順序をランダムにしない（決定論）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderInbox } from '../experiments/c-semantic-css/render.mjs';

const THEMES = [
  { id: 'calm-console', label: 'calm operations console', intent: '静かで余白が広い。判断に集中させる' },
  { id: 'editorial', label: 'editorial notebook', intent: '紙面。セリフ体と罫線。読み物として読ませる' },
  { id: 'command-center', label: 'high-density command center', intent: '暗く等幅。1 画面に多く入れる' },
  { id: 'conversational', label: 'humane conversational workspace', intent: '会話に近い。角が丸く行間が広い' },
  { id: 'timeline', label: 'visual timeline', intent: '時系列。左に軸を引きカードを節点として並べる' },
];

const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));
const shell = readFileSync('experiments/c-semantic-css/shell.html', 'utf8');
const body = renderInbox(cards);

mkdirSync('dist/catalog', { recursive: true });

for (const t of THEMES) {
  const html = shell
    .replaceAll('{{TITLE}}', t.label)
    .replaceAll('{{BASE}}', '../c-semantic-css/')
    .replace('{{CARDS}}', body)
    .replace('<html lang="ja">', `<html lang="ja" data-theme="${t.id}">`)
    .replace(`<option value="${t.id}"`, `<option value="${t.id}" selected`)
    .replace('<option value="calm-console" selected>', '<option value="calm-console">');
  writeFileSync(`dist/catalog/${t.id}.html`, html);
}

// 意味 DOM が全 theme で同一であることを機械的に示す
const semanticFingerprint = body
  .replace(/\sclass="[^"]*"/g, '')          // class は表現なので除外
  .replace(/\s+/g, ' ');
writeFileSync('dist/catalog/semantic-dom.txt', semanticFingerprint);

writeFileSync('dist/catalog/index.html', `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>創造性カタログ — 同一の意味DOMから作った 5 つの表現</title>
<style>
 body{font-family:system-ui,"Hiragino Sans",sans-serif;margin:0;padding:2rem;max-width:70rem;margin-inline:auto;line-height:1.7}
 h1{font-size:1.5rem} table{border-collapse:collapse;width:100%;margin-block:1.5rem}
 th,td{border:1px solid #ccc;padding:.6rem .8rem;text-align:start;vertical-align:top}
 code{background:#f3f4f6;padding:.1em .3em;border-radius:3px}
 .note{background:#f8fafc;border-inline-start:4px solid #475569;padding:1rem;margin-block:1rem}
</style></head><body>
<h1>創造性カタログ — 同一の意味DOMから作った 5 つの表現</h1>
<div class="note">
 <p>以下の 5 案は、<strong>まったく同じ HTML（意味DOM）</strong> から作られている。
 差分は <code>&lt;html data-theme&gt;</code> の値だけで、<code>data-card-type</code> /
 <code>data-field</code> / <code>data-action-semantic</code> と要素構造は 1 文字も変わっていない。</p>
 <p>同一性の根拠: <a href="./semantic-dom.txt">semantic-dom.txt</a>（class 属性を除いた DOM 文字列）。
 5 案すべてがこの文字列から生成されている。</p>
</div>
<table><thead><tr><th>案</th><th>狙い</th><th>変えたもの</th></tr></thead><tbody>
${THEMES.map((t) => `<tr><td><a href="./${t.id}.html">${t.label}</a></td><td>${t.intent}</td>
<td><code>styles/themes/${t.id}.css</code> のみ</td></tr>`).join('\n')}
</tbody></table>
<h2>評価してほしいこと</h2>
<ul>
 <li>どの案でも「質問」「承認」「結果不明」「結果」「お知らせ」を取り違えないか</li>
 <li>承認カードの effect / 影響範囲 / リスク / 期限 が、どの案でも最初の画面で読めるか</li>
 <li>5 案は「色違い」ではなく、明確に異なる表現になっているか</li>
 <li>キーボードだけで全 action に到達できるか</li>
</ul>
<p><small>AI の自己評価だけでは確定しない。Owner による評価が入るまで、この比較は <code>SELF_TESTED</code> である。</small></p>
</body></html>`);

console.log(`dist/catalog/ に ${THEMES.length} 案 + 索引を生成`);
console.log(`意味DOM 指紋: ${semanticFingerprint.length} bytes（全案共通）`);
