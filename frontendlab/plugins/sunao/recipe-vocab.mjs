// 自動生成: node tools/gen-recipe-vocab.mjs（手で編集しない）。
// 出典: contracts/presentation-recipe.schema.json / contracts/cards.schema.json
export const RECIPE_PROPS = {
  "readingMode": {
    "enum": [
      "decision-first",
      "chronological",
      "reference"
    ]
  },
  "density": {
    "enum": [
      "comfortable",
      "compact",
      "dense"
    ]
  },
  "effectEmphasis": {
    "enum": [
      "normal",
      "strong"
    ]
  },
  "scopePresentation": {
    "enum": [
      "inline",
      "bounded-list",
      "grid"
    ]
  },
  "evidencePresentation": {
    "enum": [
      "level-badge",
      "claim-vs-verified"
    ]
  },
  "uncertaintyPresentation": {
    "enum": [
      "inline",
      "interruptive"
    ]
  },
  "actionLayout": {
    "enum": [
      "single-primary",
      "equal-weight",
      "stacked"
    ]
  },
  "palette": {
    "enum": [
      "calm",
      "editorial",
      "command-center",
      "conversational",
      "high-contrast"
    ]
  },
  "cardShape": {
    "enum": [
      "rounded",
      "square",
      "left-rule",
      "top-rule"
    ]
  },
  "typography": {
    "enum": [
      "system",
      "serif",
      "mono"
    ]
  }
};

export const RECIPE_KINDS = ["OWNER_QUESTION","ACTION_APPROVAL","OUTCOME_UNKNOWN_REVIEW","RESULT_REVIEW","INFORMATION"];
