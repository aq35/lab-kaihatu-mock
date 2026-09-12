/**
 * 動画カタログ（静的）。実運用では resource(fetcher) で API から取ってくる形にする。
 * ここでは公開テストストリームを使う（再生には実行時のネット接続が要る）。
 *   - progressive mp4: Google の公開サンプル
 *   - HLS(adaptive):   Mux / Apple の公開テストストリーム（画質自動切替＝YouTube 的）
 * hue はサムネのグラデ生成用（外部画像に依存しないためのプレースホルダ）。
 */
export const VIDEOS = [
  {
    id: '1',
    title: 'Big Buck Bunny（progressive MP4）',
    channel: 'Blender Foundation',
    views: '12M 回視聴',
    duration: '9:56',
    hue: 210,
    mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    id: '2',
    title: 'Apple BipBop（HLS・画質自動切替）',
    channel: 'Apple Sample Streams',
    views: 'テスト配信',
    duration: 'HLS',
    hue: 20,
    hls: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
  },
  {
    id: '3',
    title: 'Mux Test Stream（HLS・adaptive）',
    channel: 'Mux',
    views: 'テスト配信',
    duration: 'HLS',
    hue: 300,
    hls: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    id: '4',
    title: 'Sintel Trailer（progressive MP4）',
    channel: 'Blender Foundation',
    views: '3.4M 回視聴',
    duration: '0:52',
    hue: 150,
    mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
];
