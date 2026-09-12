/**
 * P1: 依存予算ゲート（fail-closed）
 *
 *   node plugins/budget-gate.mjs [--budget budget.json] [--json] [--update]
 *
 * 何をするか:
 *   予算 JSON に載った各 entry を esbuild で bundle+minify し、初期 bytes（entry chunk）と
 *   gzip bytes を計り、予算と比べる。超過（OVER_BUDGET）または解決不能な import 等の
 *   build 失敗（BUILD_ERROR）があれば **build を止める（exit 1）**。
 *   EXP-3 の 753x 事故（1 関数のために lodash 全体）を機械で捕まえる。
 *   契約: 出荷する entry は必ず budget.json に載せる（未登録は測られない＝運用で entry リストと突き合わせる）。
 *
 * なぜ「プラグイン」なのか:
 *   EXP-1/4 で「出力サイズは transpiler で変わらない、決定論は既製にある」と分かった。
 *   EXP-3 で「サイズを 2〜3 桁動かすのは依存の判断だけ」と分かった。
 *   だから個人で書く価値があるのは速い変換器でなく、この「依存の判断を bytes で縛る build ステップ」。
 *   runtime 依存は足さない（出力に何も残さない、build 時だけの検査）。
 *
 * north-star（AIが好きそうなコンパイラ）の性質:
 *   - fail-closed: 予算超過も「予算未登録の entry」もエラーで止める（未知 → 通さない）
 *   - 決定論: 同じ入力なら同じ bytes（EXP で確認済み）。差分は桁で説明できる
 *   - 低 context: AI は budget.json の数値だけ見れば「足していいか」を判断できる
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import esbuild from 'esbuild';

const NM = resolve('node_modules');

/**
 * 1 つの entry を bundle して初期 bytes / gzip / 上位寄与 input を返す。
 * 決定論のため EXP-3 と同条件（bundle+minify+esm）。
 */
export async function weighEntry(entry, { nodePaths = [NM] } = {}) {
  const r = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    metafile: true,
    nodePaths,
    logLevel: 'silent',
  });
  // entry chunk（splitting 時、遅延分は別 chunk。初期ロードは entryPoint 出力）
  const outputs = r.metafile.outputs;
  const entryOutKey =
    Object.keys(outputs).find((k) => outputs[k].entryPoint) ?? Object.keys(outputs)[0];
  const file = r.outputFiles.find((f) => f.path.endsWith(entryOutKey.split('/').pop()));
  const code = Buffer.from(file?.contents ?? r.outputFiles[0].contents);
  const initial_bytes = code.length;
  const initial_gzip = gzipSync(code, { level: 9 }).length;

  // 何がバイトを食っているか（違反時の説明用）。metafile の bytesInOutput を集計。
  const contrib = {};
  for (const inp of Object.keys(outputs[entryOutKey].inputs)) {
    const b = outputs[entryOutKey].inputs[inp].bytesInOutput;
    // node_modules/<pkg> 単位でまとめる
    const m = inp.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
    const key = m ? m[1] : inp;
    contrib[key] = (contrib[key] ?? 0) + b;
  }
  const top = Object.entries(contrib)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => ({ from: k, bytes: v }));

  return { initial_bytes, initial_gzip, top_contributors: top };
}

/** 予算全体を検査。違反配列と計測結果を返す（exit はしない）。 */
export async function runGate(budgetPath) {
  const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const base = dirname(resolve(budgetPath));
  const entries = budget.entries ?? {};
  const results = [];
  const violations = [];

  for (const [rel, limit] of Object.entries(entries)) {
    const abs = resolve(base, rel);
    let m;
    try {
      m = await weighEntry(abs);
    } catch (e) {
      violations.push({ entry: rel, kind: 'BUILD_ERROR', detail: String(e.message ?? e) });
      continue;
    }
    const row = { entry: rel, ...m, limit };
    results.push(row);
    if (limit.initial_bytes != null && m.initial_bytes > limit.initial_bytes) {
      violations.push({
        entry: rel,
        kind: 'OVER_BUDGET',
        metric: 'initial_bytes',
        actual: m.initial_bytes,
        limit: limit.initial_bytes,
        over_x: Number((m.initial_bytes / limit.initial_bytes).toFixed(1)),
        top_contributors: m.top_contributors,
      });
    }
    if (limit.initial_gzip != null && m.initial_gzip > limit.initial_gzip) {
      violations.push({
        entry: rel,
        kind: 'OVER_BUDGET',
        metric: 'initial_gzip',
        actual: m.initial_gzip,
        limit: limit.initial_gzip,
        over_x: Number((m.initial_gzip / limit.initial_gzip).toFixed(1)),
      });
    }
  }
  return { budget, results, violations };
}

// ---- CLI ----
const isMain = resolve(process.argv[1] ?? '') === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const budgetPath = opt('--budget', 'budget.json');
  const asJson = args.includes('--json');
  const update = args.includes('--update'); // 実測値で予算を書き直す（初期設定用）

  const { budget, results, violations } = await runGate(budgetPath);

  if (update) {
    for (const r of results) {
      budget.entries[r.entry] = { initial_bytes: r.initial_bytes, initial_gzip: r.initial_gzip };
    }
    writeFileSync(budgetPath, JSON.stringify(budget, null, 2) + '\n');
    console.log(`updated budgets from measured values -> ${budgetPath}`);
    process.exit(0);
  }

  if (asJson) {
    console.log(JSON.stringify({ results, violations }, null, 2));
  } else {
    const pad = (s, n) => String(s).padEnd(n);
    const padL = (s, n) => String(s).padStart(n);
    console.log(`\n依存予算ゲート  budget=${budgetPath}`);
    console.log('─'.repeat(72));
    console.log(`${pad('entry', 26)}${padL('初期 B', 10)}${padL('予算 B', 10)}${padL('gzip', 8)}${padL('判定', 8)}`);
    console.log('─'.repeat(72));
    for (const r of results) {
      const over = r.limit.initial_bytes != null && r.initial_bytes > r.limit.initial_bytes;
      console.log(`${pad(r.entry, 26)}${padL(r.initial_bytes, 10)}${padL(r.limit.initial_bytes ?? '-', 10)}${padL(r.initial_gzip, 8)}${padL(over ? 'OVER' : 'ok', 8)}`);
    }
    console.log('─'.repeat(72));
    if (violations.length === 0) {
      console.log('✓ すべて予算内。\n');
    } else {
      console.log(`✗ ${violations.length} 件の違反:`);
      for (const v of violations) {
        if (v.kind === 'OVER_BUDGET') {
          console.log(`  [${v.entry}] ${v.metric} ${v.actual} B > 予算 ${v.limit} B（${v.over_x}x 超過）`);
          if (v.top_contributors) for (const t of v.top_contributors) console.log(`     ← ${t.from}: ${t.bytes} B`);
        } else {
          console.log(`  [${v.entry}] ${v.kind}: ${v.detail}`);
        }
      }
      console.log('');
    }
  }
  process.exit(violations.length > 0 ? 1 : 0);
}
