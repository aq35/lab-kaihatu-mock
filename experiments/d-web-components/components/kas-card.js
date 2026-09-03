/**
 * <kas-card> — Declarative Shadow DOM で server-render 済み。
 * この class は「振る舞いの追加」だけを行う。中身の再描画はしない。
 * （再描画すると server-rendered の意味DOM を client が上書きしてしまう）
 */
class KasCard extends HTMLElement {
  connectedCallback() {
    // DSD が既に付いているのが正常系。無ければ upgrade できない = 明示的に記録する。
    if (!this.shadowRoot) {
      this.dataset.shadowMissing = 'true';
      return;
    }
    this.dataset.upgraded = 'true';
  }
}
customElements.define('kas-card', KasCard);
export { KasCard };
