import { mount } from 'sunao';
import App from './App.sunao';
const { ctx } = mount(App, document.getElementById('app'));
window.runOp = (name) => { ctx[name](); return Promise.resolve(); };
window.domRows = () => document.querySelectorAll('.row').length; // 実 DOM 行数（可視ぶんだけのはず）
window.scrollVp = (px) => { const el = document.querySelector('.vp'); el.scrollTop = px; el.dispatchEvent(new Event('scroll')); };
window.__ready = true;
