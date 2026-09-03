/**
 * server との通信。ここが authority の唯一の入口。
 * UI 側の状態は決定の根拠にしない。server の応答だけが真。
 */

/** network 失敗 と server 拒否 を必ず区別する。呼び出し側で同じ扱いにさせない。 */
export class NetworkFailure extends Error {
  constructor(cause) { super('network-failure'); this.name = 'NetworkFailure'; this.cause = cause; }
}
export class ServerRefusal extends Error {
  constructor(status, body) { super('server-refusal'); this.name = 'ServerRefusal'; this.status = status; this.body = body; }
}
/** timeout は「成功」でも「effect なし」でもない。結果不明として扱う。 */
export class OutcomeUnknown extends Error {
  constructor(reason) { super('outcome-unknown'); this.name = 'OutcomeUnknown'; this.reason = reason; }
}

const TIMEOUT_MS = 10_000;

export async function submitDecision({ url, body, signal }) {
  const timer = new AbortController();
  const onAbort = () => timer.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const t = setTimeout(() => timer.abort(new OutcomeUnknown('timeout')), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      body,
      signal: timer.signal,
      credentials: 'same-origin',
      headers: { 'accept': 'application/json' },
    });
    if (!res.ok) {
      // server が拒否した。UI 側で「たぶん通った」と解釈しない。
      throw new ServerRefusal(res.status, await res.text().catch(() => ''));
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ServerRefusal) throw err;
    if (timer.signal.reason instanceof OutcomeUnknown) throw timer.signal.reason;
    if (err?.name === 'AbortError') throw err;
    // 送信途中で切れた場合、server に届いたかどうかは分からない。
    throw new OutcomeUnknown('transport-interrupted');
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}
