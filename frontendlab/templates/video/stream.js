/**
 * attachStream — HLS/progressive を <video> に貼る依存ゼロヘルパ。
 *
 * 優先順位:
 *   1) ネイティブ HLS（Safari/iOS = canPlayType('application/vnd.apple.mpegurl')）→ src 直挿し
 *   2) それ以外で HLS を再生したい & window.Hls（index.html で hls.js を CDN 読込時）→ MSE 再生
 *   3) 上記いずれも該当しなければ src 直挿し（progressive mp4 など）
 *
 * hls.js は **アプリ側の任意依存**（CDN で読むだけ）。sunao 本体には一切依存を足さない。
 * 返り値は後片付け関数（video の差し替え／unmount で呼ぶ）。
 */
export function attachStream(video, src) {
  if (!video || !src) return () => {};
  const isHls = /\.m3u8($|\?)/.test(src);
  const nativeHls = typeof video.canPlayType === 'function' && !!video.canPlayType('application/vnd.apple.mpegurl');
  const Hls = typeof window !== 'undefined' ? window.Hls : null;

  if (isHls && !nativeHls && Hls && Hls.isSupported && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => { try { hls.destroy(); } catch { /* noop */ } };
  }

  // ネイティブ HLS or progressive
  video.src = src;
  return () => { try { video.removeAttribute('src'); video.load && video.load(); } catch { /* noop */ } };
}
