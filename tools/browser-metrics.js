/**
 * ページ内で実行される計測関数群（Playwright から evaluate される）。
 * ブラウザ自身の CSS パーサを使うので、Tailwind の生成 CSS も Shadow DOM も
 * まったく同じ方法で測れる（= 方式間で計測方法が変わらない）。
 */
export const COLLECT = `(() => {
  const specificity = (sel) => {
    let a=0,b=0,c=0;
    let s = sel.replace(/\\\\.|\\[[^\\]]*\\]/g, (m) => m.startsWith('[') ? (b++, '') : m);
    s = s.replace(/::[a-zA-Z-]+/g, () => (c++, ''));
    s = s.replace(/:(?:not|is|has|where)\\(([^)]*)\\)/g, (m, inner) => {
      if (m.startsWith(':where')) return '';
      let max=[0,0,0];
      for (const part of inner.split(',')) {
        const t = specificity(part.trim());
        if (t[0]>max[0]||(t[0]===max[0]&&t[1]>max[1])||(t[0]===max[0]&&t[1]===max[1]&&t[2]>max[2])) max=t;
      }
      a+=max[0]; b+=max[1]; c+=max[2];
      return '';
    });
    s = s.replace(/:[a-zA-Z-]+(\\([^)]*\\))?/g, () => (b++, ''));
    s = s.replace(/#[\\w-]+/g, () => (a++, ''));
    s = s.replace(/\\.[\\w-]+/g, () => (b++, ''));
    s = s.replace(/\\b[a-zA-Z][\\w-]*\\b/g, () => (c++, ''));
    return [a,b,c];
  };
  const specNum = ([a,b,c]) => a*10000 + b*100 + c;
  const depth = (sel) => sel.trim().split(/\\s*[ >+~]\\s*/).filter(Boolean).length;

  const sheets = [];
  const collectSheet = (sheet, origin) => {
    let rules; try { rules = sheet.cssRules; } catch { return; }
    sheets.push({ origin, rules: [...rules] });
  };
  for (const s of document.styleSheets) collectSheet(s, 'document');
  const shadowHosts = [...document.querySelectorAll('*')].filter((e) => e.shadowRoot);
  for (const h of shadowHosts) {
    for (const s of h.shadowRoot.styleSheets ?? []) collectSheet(s, 'shadow:' + h.tagName.toLowerCase());
    for (const s of h.shadowRoot.adoptedStyleSheets ?? []) collectSheet(s, 'shadow-adopted:' + h.tagName.toLowerCase());
  }

  const out = {
    ruleCount: 0, declarationCount: 0, importantCount: 0,
    maxSpecificity: 0, specificityBuckets: {}, maxSelectorDepth: 0,
    uniqueSelectors: new Set(), unusedRules: 0, checkedRules: 0,
    declPairs: new Map(), customPropertyDefs: new Set(), customPropertyUses: 0,
    layerNames: new Set(), containerQueries: 0, mediaQueries: 0, supportsQueries: 0,
    shadowRootCount: shadowHosts.length,
    colorLiterals: new Set(), pxLengths: 0, logicalProps: 0, physicalProps: 0,
  };

  const PHYSICAL = /^(margin|padding)-(top|right|bottom|left)$|^(width|height|top|right|bottom|left)$|^border-(top|right|bottom|left)-(width|style|color)$|^text-align$/;
  const LOGICAL = /^(margin|padding)-(block|inline)|^(inline|block)-size$|^inset-(block|inline)|^border-(block|inline)/;

  const walk = (rules, ctx) => {
    for (const rule of rules) {
      if (rule.constructor.name === 'CSSLayerBlockRule' || rule.type === 0 && rule.name) { }
      const t = rule.constructor.name;
      if (t === 'CSSLayerStatementRule') { for (const n of rule.nameList ?? []) out.layerNames.add(n); continue; }
      if (t === 'CSSLayerBlockRule') { out.layerNames.add(rule.name || '(anonymous)'); walk(rule.cssRules, ctx); continue; }
      if (t === 'CSSMediaRule') { out.mediaQueries++; walk(rule.cssRules, ctx); continue; }
      if (t === 'CSSContainerRule') { out.containerQueries++; walk(rule.cssRules, ctx); continue; }
      if (t === 'CSSSupportsRule') { out.supportsQueries++; walk(rule.cssRules, ctx); continue; }
      if (t === 'CSSImportRule') { if (rule.styleSheet) walk(rule.styleSheet.cssRules, ctx); continue; }
      if (t !== 'CSSStyleRule') continue;

      out.ruleCount++;
      const sel = rule.selectorText;
      out.uniqueSelectors.add(sel);
      for (const part of sel.split(',')) {
        const p = part.trim(); if (!p) continue;
        out.maxSpecificity = Math.max(out.maxSpecificity, specNum(specificity(p)));
        out.maxSelectorDepth = Math.max(out.maxSelectorDepth, depth(p));
        const bucket = specificity(p).join('-');
        out.specificityBuckets[bucket] = (out.specificityBuckets[bucket] ?? 0) + 1;
      }
      // 未使用判定: :hover 等の状態擬似クラスを外して照合する
      const probe = sel.replace(/::?(hover|focus|focus-visible|focus-within|active|visited|disabled|checked|target|before|after|first-line|first-letter|placeholder|backdrop|marker|selection|slotted\\([^)]*\\)|part\\([^)]*\\)|host(\\([^)]*\\))?)/g, '')
                       .replace(/,\\s*(?=,|$)/g, '').replace(/^\\s*,|,\\s*$/g, '').trim();
      if (probe) {
        out.checkedRules++;
        let matched = false;
        try {
          matched = !!document.querySelector(probe);
          if (!matched) for (const h of shadowHosts) { if (h.shadowRoot.querySelector(probe)) { matched = true; break; } }
        } catch { matched = true; }
        if (!matched) out.unusedRules++;
      }

      const style = rule.style;
      for (let i = 0; i < style.length; i++) {
        const name = style[i];
        const value = style.getPropertyValue(name);
        out.declarationCount++;
        if (style.getPropertyPriority(name) === 'important') out.importantCount++;
        const key = name + ':' + value.trim();
        out.declPairs.set(key, (out.declPairs.get(key) ?? 0) + 1);
        if (name.startsWith('--')) out.customPropertyDefs.add(name);
        if (value.includes('var(--')) out.customPropertyUses++;
        for (const m of value.matchAll(/#[0-9a-fA-F]{3,8}\\b|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|oklch\\([^)]*\\)/g)) out.colorLiterals.add(m[0]);
        out.pxLengths += (value.match(/\\d+px/g) ?? []).length;
        if (LOGICAL.test(name)) out.logicalProps++;
        if (PHYSICAL.test(name)) out.physicalProps++;
      }
    }
  };
  for (const s of sheets) walk(s.rules, s.origin);

  let duplicateDeclarations = 0;
  for (const [, n] of out.declPairs) if (n > 1) duplicateDeclarations += n - 1;

  return {
    ruleCount: out.ruleCount,
    declarationCount: out.declarationCount,
    duplicateDeclarations,
    importantCount: out.importantCount,
    maxSpecificity: out.maxSpecificity,
    maxSelectorDepth: out.maxSelectorDepth,
    uniqueSelectors: out.uniqueSelectors.size,
    unusedRules: out.unusedRules,
    checkedRules: out.checkedRules,
    customPropertyDefs: out.customPropertyDefs.size,
    customPropertyUses: out.customPropertyUses,
    layers: [...out.layerNames],
    containerQueries: out.containerQueries,
    mediaQueries: out.mediaQueries,
    shadowRootCount: out.shadowRootCount,
    distinctColorLiterals: out.colorLiterals.size,
    pxLengths: out.pxLengths,
    logicalProps: out.logicalProps,
    physicalProps: out.physicalProps,
    domNodes: document.querySelectorAll('*').length +
      [...document.querySelectorAll('*')].reduce((n, e) => n + (e.shadowRoot ? e.shadowRoot.querySelectorAll('*').length : 0), 0),
  };
})()`;
