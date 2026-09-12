/**
 * 作品カタログ（静的）。本番は resource(fetcher) で API から取得する形にする。
 * hue はサムネのグラデ生成用（外部画像・著作物に依存しないプレースホルダ）。
 * 実画像を使うなら thumb を <img :src> にして resource で URL を読む。
 */
export const ARTWORKS = [
  { id: '1', title: '夕暮れの街', artist: 'aoi', hue: 30, likes: 1240, posted: 20260910, tags: ['風景', 'オリジナル', '夕焼け'] },
  { id: '2', title: '猫と少女', artist: 'mimi', hue: 200, likes: 3810, posted: 20260911, tags: ['オリジナル', '猫', '女の子'] },
  { id: '3', title: '深海の記憶', artist: 'kai', hue: 250, likes: 902, posted: 20260908, tags: ['ファンタジー', '風景'] },
  { id: '4', title: '春一番', artist: 'haru', hue: 340, likes: 5600, posted: 20260912, tags: ['オリジナル', '女の子', '春'] },
  { id: '5', title: 'ネオン夜景', artist: 'ren', hue: 300, likes: 2100, posted: 20260907, tags: ['風景', 'SF', '夜'] },
  { id: '6', title: '森の守り手', artist: 'moko', hue: 140, likes: 780, posted: 20260906, tags: ['ファンタジー', 'オリジナル'] },
  { id: '7', title: '制服の午後', artist: 'sora', hue: 20, likes: 4300, posted: 20260912, tags: ['女の子', '日常'] },
  { id: '8', title: '機械仕掛けの心', artist: 'giga', hue: 220, likes: 1580, posted: 20260905, tags: ['SF', 'メカ'] },
  { id: '9', title: '花畑', artist: 'nana', hue: 100, likes: 6700, posted: 20260912, tags: ['風景', '花', 'オリジナル'] },
  { id: '10', title: '嵐の予感', artist: 'kai', hue: 260, likes: 640, posted: 20260904, tags: ['風景', '空'] },
  { id: '11', title: '猫カフェ', artist: 'mimi', hue: 40, likes: 2950, posted: 20260910, tags: ['猫', '日常'] },
  { id: '12', title: '星降る夜に', artist: 'ren', hue: 280, likes: 3320, posted: 20260911, tags: ['風景', '夜', 'オリジナル'] },
];
