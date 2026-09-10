// 梯子「足さない」: debounce を自分で書く。依存ゼロ。
export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
export const onResize = debounce(() => {}, 100);
