import { mount } from 'sunao';
import App from './App.sunao';
const { ctx } = mount(App, document.getElementById('app'));
// ベンチ用フック: op を同期実行（sunao は同期更新）→ commit 済みで resolve。
window.runOp = (name) => { ctx[name](); return Promise.resolve(); };
window.rowCount = () => document.querySelectorAll('tbody tr').length;
window.__ready = true;
