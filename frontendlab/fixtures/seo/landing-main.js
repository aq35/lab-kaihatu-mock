import { hydrate } from 'sunao';
import Landing from './Landing.sunao';
// サーバ prerender した #app の中身を作り直さず、対話（カウンタ）だけ乗せる。
hydrate(Landing, document.getElementById('app'));
