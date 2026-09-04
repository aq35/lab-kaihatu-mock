/**
 * VGUI 実 Owner blind comparison の計測器を生成する。
 *   node tools/vgui-owner-study.mjs            # gen1（生存 4 案）
 *   node tools/vgui-owner-study.mjs --winner=cand-01   # gen2（勝者の周りを再生成）
 *
 * 出力:
 *   dist/vgui/owner-study.html         Artifact として公開する自己完結の計測器（実 Owner が操作）
 *   dist/vgui/owner-study.decode.json  案ラベルと cand-id/params の対応（Owner には見せない私用の復号表）
 *
 * 規律（docs/research/_owner-blind-criteria.md）:
 *   - 案はパラメータ・生成理由・世代を伏せて提示。並び順は実行時ランダム化。
 *   - 4 案は同一の意味 DOM（同じ 5 カード・同じ data-* 契約）。違うのは表現だけ。
 *   - 計測器の外枠は意図的に無彩色（IBM Plex）。案の美観比較を汚さないため。
 *   - 案は script を一切持たない静的な srcdoc。クリック計測は親から contentDocument 経由で行う
 *     （srcdoc に inline script を入れないため CSP の影響を受けない）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generate, nextGeneration } from '../experiments/vgui/generator.mjs';
import { renderCandidatePage } from '../experiments/vgui/compiler.mjs';

const grammar = {
  intent: { primary_emotion: 'quiet anticipation', attention_path: ['identity', 'evidence', 'action'], reading_rhythm: 'slow_then_decisive' },
  constraints: { protected_meaning: true, minimum_contrast: 4.5, maximum_lcp_ms: 2500, reduced_motion_required: true, min_target_px: 24, max_css_bytes: 12000 },
};
const cards = JSON.parse(readFileSync('fixtures/cards.happy.json', 'utf8'));
const DANGEROUS_CARD_ID = 'card_a1';       // ACTION_APPROVAL: 外部送信・取り消し不可
const DANGEROUS_CARD_TYPE = 'ACTION_APPROVAL';

// --- どの案を測るか ---
const winnerArg = process.argv.find((a) => a.startsWith('--winner='));
let gen, survivorIds, genLabel;
if (winnerArg) {
  // gen2: gen1 の実選択(勝者)の周りを再生成し、その生存案を測る。
  const winnerId = winnerArg.split('=')[1];
  const decode = JSON.parse(readFileSync('dist/vgui/owner-study.decode.json', 'utf8'));
  const winner = decode.candidates.find((c) => c.candId === winnerId);
  if (!winner) throw new Error(`勝者 ${winnerId} が gen1 の decode 表に無い`);
  gen = nextGeneration(grammar, winner.params, { n: 12, seed: 22, spread: 0.14 });
  // gen2 の生存判定は pipeline と同じ観測淘汰に依存する。ここでは pipeline の結果を参照する。
  const g2 = JSON.parse(readFileSync('docs/results/raw/vgui-gen2.json', 'utf8'));
  survivorIds = g2.results.filter((r) => r.survived).map((r) => r.id);
  genLabel = 'gen2';
} else {
  // gen1: seed 7 / n 12。生存案は観測淘汰の結果（raw から読む。ハードコードしない）。
  gen = generate(grammar, { n: 12, seed: 7 });
  const g1 = JSON.parse(readFileSync('docs/results/raw/vgui-gen1.json', 'utf8'));
  survivorIds = g1.results.filter((r) => r.survived).map((r) => r.id);
  genLabel = 'gen1';
}

const idIndex = (id) => Number(id.split('-')[1]); // cand-04 -> 4
const survivors = survivorIds.map((id) => ({ candId: id, params: gen.experiments[idIndex(id)].parameters }));

// 各生存案を完全な HTML 文書にして srcdoc へ入れる（:root / body が効くよう iframe 隔離）。
const candidatesForPage = survivors.map(({ candId, params }) => {
  const { html, css } = renderCandidatePage(cards, params);
  const doc = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`;
  return { candId, srcdoc: doc };
});

// 私用の復号表（Owner には見せない）
mkdirSync('dist/vgui', { recursive: true });
writeFileSync('dist/vgui/owner-study.decode.json', JSON.stringify({
  generation: genLabel, intent: grammar.intent,
  dangerousCard: { id: DANGEROUS_CARD_ID, type: DANGEROUS_CARD_TYPE },
  candidates: survivors.map(({ candId, params }) => ({ candId, params })),
}, null, 2));

// Artifact に渡すのは candId と srcdoc のみ（params は伏せる）。
// srcdoc 内に "</script>" が万一あっても親の <script> を閉じないよう "<\/" に退避（JSON 上は等価）。
const injected = JSON.stringify(candidatesForPage).replace(/<\//g, '<\\/');

const page = String.raw`<title>VGUI Owner 判断計測</title>
<style>
:root{
 --paper:#f4f3f0; --surface:#ffffff; --ink:#1b1a17; --ink2:#3d3b36; --quiet:#6f6b63;
 --line:#e2ded7; --line-strong:#c9c4ba; --graphite:#2f2e2c; --focus:#4a5568;
 --ok:#2f6b3d; --no:#9a3324; --shadow:0 1px 2px rgba(20,18,14,.05),0 8px 24px rgba(20,18,14,.06);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --paper:#171614; --surface:#201f1c; --ink:#f0eee9; --ink2:#cdc9c1; --quiet:#8f8a80;
 --line:#33312d; --line-strong:#4a4741; --graphite:#e7e4dd; --focus:#9aa7bd;
 --ok:#7bbe8a; --no:#e39182; --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
}}
:root[data-theme="dark"]{
 --paper:#171614; --surface:#201f1c; --ink:#f0eee9; --ink2:#cdc9c1; --quiet:#8f8a80;
 --line:#33312d; --line-strong:#4a4741; --graphite:#e7e4dd; --focus:#9aa7bd;
 --ok:#7bbe8a; --no:#e39182; --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
 font-family:"IBM Plex Sans","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;line-height:1.6}
.mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
.wrap{max-inline-size:64rem;margin-inline:auto;padding:clamp(1rem,3vw,2rem)}
header.top{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:baseline;justify-content:space-between;
 border-block-end:1px solid var(--line);padding-block-end:.75rem;margin-block-end:1.25rem}
header.top h1{font-size:1.05rem;font-weight:600;margin:0;letter-spacing:.01em}
header.top .meta{font-size:.78rem;color:var(--quiet);letter-spacing:.06em;text-transform:uppercase}
.progress{display:flex;gap:.35rem;margin-block:1rem}
.progress span{inline-size:2rem;block-size:.28rem;border-radius:2px;background:var(--line-strong)}
.progress span.done{background:var(--graphite)}
.progress span.now{background:var(--focus)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);
 padding:clamp(1rem,2.5vw,1.5rem)}
.task{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem 1rem;margin-block-end:.75rem}
.task .kicker{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--quiet);font-weight:600}
.task .timer{margin-inline-start:auto;font-size:.85rem;color:var(--ink2)}
.prompt{font-size:1.05rem;font-weight:500;text-wrap:balance;margin:0 0 .25rem}
.hint{font-size:.85rem;color:var(--quiet);margin:0}
.stage{margin-block-start:1rem;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface)}
.stage iframe{inline-size:100%;block-size:min(72vh,780px);border:0;display:block;background:#fff}
.controls{display:flex;flex-wrap:wrap;gap:.6rem;margin-block-start:1.1rem}
button.btn{font:inherit;font-weight:600;padding:.6rem 1.1rem;min-block-size:2.75rem;border-radius:8px;cursor:pointer;
 background:var(--graphite);color:var(--paper);border:1px solid var(--graphite)}
button.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line-strong)}
button.btn:focus-visible,a:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
p.lead{font-size:1rem;color:var(--ink2);max-inline-size:60ch}
ul.proto{margin:.75rem 0;padding-inline-start:1.1rem;color:var(--ink2);max-inline-size:62ch}
ul.proto li{margin-block:.35rem}
.pill{display:inline-block;font-size:.78rem;padding:.1rem .55rem;border-radius:999px;border:1px solid var(--line-strong);color:var(--quiet)}
.fieldset{border:1px solid var(--line);border-radius:8px;padding:1rem;margin-block-start:1rem}
.fieldset legend{padding-inline:.4rem;font-size:.8rem;color:var(--quiet);font-weight:600}
.opt{display:grid;grid-template-columns:auto 1fr;gap:.5rem;align-items:start;margin-block:.4rem}
.opt input{inline-size:1.35rem;block-size:1.35rem;margin-block-start:.15rem}
textarea{inline-size:100%;font:inherit;padding:.6rem;border:1px solid var(--line-strong);border-radius:8px;
 background:var(--surface);color:var(--ink);min-block-size:4rem}
.result pre{white-space:pre-wrap;word-break:break-word;background:var(--surface);border:1px solid var(--line);
 border-radius:8px;padding:1rem;font-size:.8rem;max-block-size:20rem;overflow:auto}
.row{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;align-items:baseline}
.tag-ok{color:var(--ok);font-weight:600}.tag-no{color:var(--no);font-weight:600}
[hidden]{display:none!important}
.note{font-size:.82rem;color:var(--quiet);margin-block-start:.75rem;max-inline-size:62ch}
</style>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">

<div class="wrap">
  <header class="top">
    <h1>VGUI — Owner 判断計測</h1>
    <span class="meta mono" id="genlabel">GENLABEL · intent: quiet anticipation</span>
  </header>

  <!-- 導入 -->
  <section id="intro" class="card">
    <p class="lead">同じ意味・同じ情報を持つ画面が <strong id="nc">4</strong> つあります（案 A〜D、並びはランダム、
    どれがどんな設計かは伏せてあります）。測るのは<strong>美しさではなく、安全で速い判断</strong>です。</p>
    <ul class="proto">
      <li>各案で 2 つの操作をします。時間を計ります。</li>
      <li><strong>① 危険操作の識別</strong>: 「実行すると取り消せず、外部に影響する操作の承認を求めているカード」を 1 つクリック。</li>
      <li><strong>② リスクの発見</strong>: その承認カードの中で「この操作のリスク」が書かれている箇所をクリック。</li>
      <li>全案のあと、最も速く安全に判断できた案とその理由を答えます。</li>
    </ul>
    <p class="note">正誤や時間は操作中には表示しません（判断を誘導しないため）。最後にまとめて結果が出ます。
    途中のカードのボタンは押しても何も起きません（表示だけの静的な画面です）。</p>
    <div class="controls"><button class="btn" id="start">開始する</button></div>
  </section>

  <!-- 計測ステージ -->
  <section id="study" class="card" hidden>
    <div class="progress" id="progress"></div>
    <div class="task">
      <span class="kicker" id="kicker">案 A</span>
      <span class="timer mono" id="timer">0.0s</span>
    </div>
    <p class="prompt" id="prompt"></p>
    <p class="hint" id="hint"></p>
    <div class="stage"><iframe id="frame" title="評価対象の画面" referrerpolicy="no-referrer"></iframe></div>
    <p class="note" id="stagenote"></p>
  </section>

  <!-- 最終選択 -->
  <section id="final" class="card" hidden>
    <p class="prompt">最も<strong>速く・安全に</strong>判断できたのはどの案ですか。</p>
    <p class="hint">「好き（美観）」ではなく「危険操作とリスクを迷わず拾えた」で選んでください。</p>
    <fieldset class="fieldset"><legend>安全で速い判断ができた案</legend><div id="pickSafe"></div></fieldset>
    <div class="fieldset"><label for="reason" style="font-size:.85rem;color:var(--quiet);font-weight:600">理由（一言）</label>
      <textarea id="reason" placeholder="例: リスク行が最初に目に入り、外部送信だと即わかった"></textarea></div>
    <fieldset class="fieldset"><legend>参考: 見た目が最も好みだった案（副次評価・任意）</legend><div id="pickLike"></div></fieldset>
    <div class="controls"><button class="btn" id="finish">結果を出す</button></div>
  </section>

  <!-- 結果 -->
  <section id="result" class="result card" hidden>
    <p class="prompt">計測結果</p>
    <div id="summary"></div>
    <p class="note">下の JSON をコピーして、チャットに貼り戻してください。これを gen2 の再生成と判定表の更新に使います。
    案ラベルと内部 ID の対応もこの中に入っています（測定後なので目隠しは崩れません）。</p>
    <div class="controls"><button class="btn" id="copy">JSON をコピー</button>
      <button class="btn ghost" id="restart">最初からやり直す</button></div>
    <pre id="json" class="mono"></pre>
  </section>
</div>

<script>
const CANDIDATES = INJECTED;
const GEN = "GENLABEL";
const DANGER = { id: "card_a1", type: "ACTION_APPROVAL" };

const $ = (id) => document.getElementById(id);
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const LETTERS = ["A","B","C","D","E","F"];

let panes = [];       // 表示順（ラベル付き）
let idx = 0;          // 現在の案
let phase = 1;        // 1=危険識別, 2=リスク発見
let t0 = 0, raf = 0;
const records = [];   // 案ごとの計測

function init(){
  panes = shuffle(CANDIDATES).map((c,i)=>({ label: LETTERS[i], candId: c.candId, srcdoc: c.srcdoc }));
  $("nc").textContent = String(panes.length);
  $("genlabel").textContent = GEN.toUpperCase()+" · intent: quiet anticipation";
  idx = 0; records.length = 0;
  renderProgress();
}
function renderProgress(){
  $("progress").innerHTML = panes.map((_,i)=>{
    const cls = i<idx ? "done" : (i===idx ? "now" : "");
    return '<span class="'+cls+'"></span>';
  }).join("");
}
function startStudy(){
  $("intro").hidden = true; $("study").hidden = false;
  loadPane();
}
function loadPane(){
  const p = panes[idx];
  phase = 1;
  $("kicker").textContent = "案 " + p.label;
  $("prompt").textContent = "実行すると取り消せず、外部に影響する操作の承認を求めているカードを 1 つ選んでクリックしてください。";
  $("hint").textContent = "画面内のカードを直接クリックします。";
  $("stagenote").textContent = "案 " + p.label + "（" + (idx+1) + " / " + panes.length + "）";
  renderProgress();
  const f = $("frame");
  f.onload = () => attach(f);
  f.srcdoc = p.srcdoc;
  startTimer();
}
function startTimer(){
  t0 = performance.now();
  cancelAnimationFrame(raf);
  const tick = () => { $("timer").textContent = ((performance.now()-t0)/1000).toFixed(1)+"s"; raf = requestAnimationFrame(tick); };
  tick();
}
function stopTimer(){ cancelAnimationFrame(raf); return (performance.now()-t0)/1000; }

// srcdoc は same-origin。親から contentDocument にクリック listener を張る（案側に script を入れない）。
function attach(frame){
  let doc;
  try { doc = frame.contentDocument; } catch(e){ doc = null; }
  if(!doc){ $("stagenote").textContent = "この画面を読み込めませんでした。ページを開き直してください。"; return; }
  doc.addEventListener("click", (e) => {
    e.preventDefault(); // 案側のフォーム送信・遷移を止め、計測を安定させる
    const cardEl = e.target.closest("[data-card-type]");
    if(phase === 1){
      if(!cardEl) return;               // カード外(余白)は選択とみなさず待つ
      const t = stopTimer();
      const rec = { label: panes[idx].label, candId: panes[idx].candId,
        identify: { seconds: +t.toFixed(2),
          clickedType: cardEl.getAttribute("data-card-type"),
          clickedCardId: cardEl.getAttribute("data-card-id"),
          correct: cardEl.getAttribute("data-card-id") === DANGER.id } };
      records[idx] = rec;
      // フェーズ2へ
      phase = 2;
      $("prompt").textContent = "その承認カードの中で「この操作のリスク」が書かれている箇所をクリックしてください。";
      $("hint").textContent = "リスクの行・見出しのあたりをクリックします。";
      startTimer();
    } else {
      const fieldEl = e.target.closest("[data-field]");
      const riskEl = e.target.closest('.kfact--risk') || e.target.closest('.krisk') || e.target.closest('[data-field="risk"]');
      if(!fieldEl && !riskEl) return;    // 情報行の外は待つ
      const t = stopTimer();
      records[idx].risk = { seconds: +t.toFixed(2),
        clickedField: riskEl ? "risk" : (fieldEl ? fieldEl.getAttribute("data-field") : null),
        found: !!riskEl };
      next();
    }
  }, true);
}
function next(){
  idx++;
  if(idx < panes.length){ loadPane(); }
  else { $("study").hidden = true; showFinal(); }
}
function radios(container){
  $(container).innerHTML = panes.map((p)=>(
    '<label class="opt"><input type="radio" name="'+container+'" value="'+p.label+'"><span>案 '+p.label+'</span></label>'
  )).join("");
}
function showFinal(){
  $("final").hidden = false;
  radios("pickSafe"); radios("pickLike");
  $("final").scrollIntoView({behavior:"smooth"});
}
function picked(name){ const el = document.querySelector('input[name="'+name+'"]:checked'); return el ? el.value : null; }
function labelToCand(l){ const p = panes.find(x=>x.label===l); return p ? p.candId : null; }

function finish(){
  const safe = picked("pickSafe");
  if(!safe){ alert("安全で速い判断ができた案を 1 つ選んでください。"); return; }
  const like = picked("pickLike");
  const out = {
    experiment: "vgui-owner-blind", generation: GEN, ranAt: new Date().toISOString(),
    intent: "quiet anticipation",
    order: panes.map(p=>({ label:p.label, candId:p.candId })),
    perCandidate: records.map(r=>({
      label:r.label, candId:r.candId,
      identifySeconds:r.identify.seconds, identifyCorrect:r.identify.correct,
      identifyClickedType:r.identify.clickedType, identifyClickedCardId:r.identify.clickedCardId,
      riskSeconds:r.risk?r.risk.seconds:null, riskFound:r.risk?r.risk.found:null,
      riskClickedField:r.risk?r.risk.clickedField:null,
    })),
    summary: {
      dangerousMisID: records.filter(r=>!r.identify.correct).length,
      riskMissed: records.filter(r=>!(r.risk&&r.risk.found)).length,
      identifySecondsMean: +(records.reduce((s,r)=>s+r.identify.seconds,0)/records.length).toFixed(2),
    },
    chosenSafest: { label: safe, candId: labelToCand(safe) },
    reason: $("reason").value.trim(),
    chosenMostLiked: like ? { label: like, candId: labelToCand(like) } : null,
    likeEqualsSafe: like ? (like===safe) : null,
  };
  $("final").hidden = true; $("result").hidden = false;
  renderSummary(out);
  $("json").textContent = JSON.stringify(out, null, 2);
  $("result").scrollIntoView({behavior:"smooth"});
}
function renderSummary(o){
  const s = o.summary;
  const line = (label,val,good)=>'<div class="row"><span style="min-inline-size:14rem;color:var(--quiet)">'+label+'</span><span class="'+(good?'tag-ok':'tag-no')+'">'+val+'</span></div>';
  $("summary").innerHTML =
    line("危険操作の誤認", s.dangerousMisID+" 件（成功条件 0）", s.dangerousMisID===0) +
    line("リスクの見落とし", s.riskMissed+" 件（成功条件 0）", s.riskMissed===0) +
    '<div class="row"><span style="min-inline-size:14rem;color:var(--quiet)">危険カード識別 平均時間</span><span class="mono">'+s.identifySecondsMean+'s</span></div>' +
    '<div class="row"><span style="min-inline-size:14rem;color:var(--quiet)">安全に判断できた案</span><span>案 '+o.chosenSafest.label+'</span></div>' +
    (o.chosenMostLiked?('<div class="row"><span style="min-inline-size:14rem;color:var(--quiet)">見た目が好みの案</span><span>案 '+o.chosenMostLiked.label+(o.likeEqualsSafe?'（安全案と一致）':'')+'</span></div>'):'');
}

$("start").addEventListener("click", startStudy);
$("finish").addEventListener("click", finish);
$("copy").addEventListener("click", async ()=>{ try{ await navigator.clipboard.writeText($("json").textContent); $("copy").textContent="コピーしました"; setTimeout(()=>$("copy").textContent="JSON をコピー",1500);}catch(e){ const r=document.createRange(); r.selectNode($("json")); getSelection().removeAllRanges(); getSelection().addRange(r);} });
$("restart").addEventListener("click", ()=>{ $("result").hidden=true; $("final").hidden=true; $("intro").hidden=false; init(); });

init();
</script>`;

writeFileSync('dist/vgui/owner-study.html', page.replace(/INJECTED/g, () => injected).replace(/GENLABEL/g, genLabel));
console.log(`${genLabel}: 生存 ${survivors.length} 案 → dist/vgui/owner-study.html`);
console.log('  survivors:', survivors.map((s) => `${s.candId}(d=${s.params.density.toFixed(2)},c=${s.params.contrastEmphasis.toFixed(2)})`).join('  '));
console.log('  decode:', 'dist/vgui/owner-study.decode.json（Owner には見せない）');
