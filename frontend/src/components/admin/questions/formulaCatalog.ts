// Domain: Admin (content studio)
// Description: The snippet library behind the authoring toolbar — markdown marks
//   and LaTeX symbols an author can drop into any question field.
// Data only: `insert` is spliced at the cursor and `cursor` says where the caret
//   lands afterwards (usually inside the first pair of braces).

export interface Snippet {
  id: string
  /** LaTeX rendered on the button (KaTeX). Ignored when `label` is set. */
  display?: string
  /** Plain label shown instead of rendered math (markdown marks, delimiters). */
  label?: string
  /** Text spliced in at the caret. */
  insert: string
  /** Caret offset from the start of `insert` once inserted. */
  cursor: number
  /** i18n key for the tooltip. */
  titleKey: string
}

export interface SnippetGroup {
  id: string
  labelKey: string
  items: Snippet[]
}

/**
 * Always-visible row — the marks and symbols authors reach for constantly, so
 * they never have to hunt through a tab.
 */
export const QUICK_SNIPPETS: Snippet[] = [
  { id: 'bold', label: 'B', insert: '****', cursor: 2, titleKey: 'admin.questions.tools.bold' },
  { id: 'italic', label: 'I', insert: '**', cursor: 1, titleKey: 'admin.questions.tools.italic' },
  { id: 'math', label: '$…$', insert: '$$', cursor: 1, titleKey: 'admin.questions.tools.inlineMath' },
  { id: 'mathBlock', label: '$$', insert: '$$\n\n$$', cursor: 3, titleKey: 'admin.questions.tools.blockMath' },
  { id: 'frac', label: 'a/b', insert: '\\frac{}{}', cursor: 6, titleKey: 'admin.questions.tools.fraction' },
  { id: 'sqrt', label: '√x', insert: '\\sqrt{}', cursor: 6, titleKey: 'admin.questions.tools.sqrt' },
  { id: 'sup2', label: 'x²', insert: '^{2}', cursor: 4, titleKey: 'admin.questions.tools.squared' },
  { id: 'sub', label: 'xₙ', insert: '_{}', cursor: 2, titleKey: 'admin.questions.tools.subscript' },
  { id: 'pi', label: 'π', insert: '\\pi ', cursor: 4, titleKey: 'admin.questions.tools.pi' },
  { id: 'times', label: '×', insert: '\\times ', cursor: 7, titleKey: 'admin.questions.tools.times' },
  { id: 'div', label: '÷', insert: '\\div ', cursor: 5, titleKey: 'admin.questions.tools.divide' },
  { id: 'pm', label: '±', insert: '\\pm ', cursor: 4, titleKey: 'admin.questions.tools.plusMinus' },
  { id: 'leq', label: '≤', insert: '\\leq ', cursor: 5, titleKey: 'admin.questions.tools.leq' },
  { id: 'geq', label: '≥', insert: '\\geq ', cursor: 5, titleKey: 'admin.questions.tools.geq' },
  { id: 'neq', label: '≠', insert: '\\neq ', cursor: 5, titleKey: 'admin.questions.tools.neq' },
  { id: 'degree', label: '°', insert: '^{\\circ}', cursor: 9, titleKey: 'admin.questions.tools.degree' },
]

/** Categorised library for everything the quick row leaves out. */
export const SNIPPET_GROUPS: SnippetGroup[] = [
  {
    id: 'structure',
    labelKey: 'admin.questions.tools.groupStructure',
    items: [
      { id: 's-frac', display: '\\frac{a}{b}', insert: '\\frac{}{}', cursor: 6, titleKey: 'admin.questions.tools.fraction' },
      { id: 's-sqrt', display: '\\sqrt{x}', insert: '\\sqrt{}', cursor: 6, titleKey: 'admin.questions.tools.sqrt' },
      { id: 's-nthroot', display: '\\sqrt[n]{x}', insert: '\\sqrt[n]{}', cursor: 9, titleKey: 'admin.questions.tools.nthRoot' },
      { id: 's-sup', display: 'x^{2}', insert: '^{}', cursor: 2, titleKey: 'admin.questions.tools.superscript' },
      { id: 's-sub', display: 'x_{n}', insert: '_{}', cursor: 2, titleKey: 'admin.questions.tools.subscript' },
      { id: 's-paren', display: '\\left(x\\right)', insert: '\\left(\\right)', cursor: 6, titleKey: 'admin.questions.tools.parens' },
      { id: 's-abs', display: '\\left|x\\right|', insert: '\\left|\\right|', cursor: 6, titleKey: 'admin.questions.tools.abs' },
      { id: 's-matrix', display: '\\begin{matrix}a&b\\\\c&d\\end{matrix}', insert: '\\begin{matrix} & \\\\ & \\end{matrix}', cursor: 15, titleKey: 'admin.questions.tools.matrix' },
    ],
  },
  {
    id: 'algebra',
    labelKey: 'admin.questions.tools.groupAlgebra',
    items: [
      { id: 'a-leq', display: '\\leq', insert: '\\leq ', cursor: 5, titleKey: 'admin.questions.tools.leq' },
      { id: 'a-geq', display: '\\geq', insert: '\\geq ', cursor: 5, titleKey: 'admin.questions.tools.geq' },
      { id: 'a-neq', display: '\\neq', insert: '\\neq ', cursor: 5, titleKey: 'admin.questions.tools.neq' },
      { id: 'a-approx', display: '\\approx', insert: '\\approx ', cursor: 8, titleKey: 'admin.questions.tools.approx' },
      { id: 'a-pm', display: '\\pm', insert: '\\pm ', cursor: 4, titleKey: 'admin.questions.tools.plusMinus' },
      { id: 'a-times', display: '\\times', insert: '\\times ', cursor: 7, titleKey: 'admin.questions.tools.times' },
      { id: 'a-div', display: '\\div', insert: '\\div ', cursor: 5, titleKey: 'admin.questions.tools.divide' },
      { id: 'a-cdot', display: '\\cdot', insert: '\\cdot ', cursor: 6, titleKey: 'admin.questions.tools.cdot' },
      { id: 'a-infty', display: '\\infty', insert: '\\infty ', cursor: 7, titleKey: 'admin.questions.tools.infinity' },
    ],
  },
  {
    id: 'greek',
    labelKey: 'admin.questions.tools.groupGreek',
    items: [
      { id: 'g-pi', display: '\\pi', insert: '\\pi ', cursor: 4, titleKey: 'admin.questions.tools.pi' },
      { id: 'g-theta', display: '\\theta', insert: '\\theta ', cursor: 7, titleKey: 'admin.questions.tools.theta' },
      { id: 'g-alpha', display: '\\alpha', insert: '\\alpha ', cursor: 7, titleKey: 'admin.questions.tools.alpha' },
      { id: 'g-beta', display: '\\beta', insert: '\\beta ', cursor: 6, titleKey: 'admin.questions.tools.beta' },
      { id: 'g-gamma', display: '\\gamma', insert: '\\gamma ', cursor: 7, titleKey: 'admin.questions.tools.gamma' },
      { id: 'g-delta', display: '\\Delta', insert: '\\Delta ', cursor: 7, titleKey: 'admin.questions.tools.delta' },
      { id: 'g-sigma', display: '\\sigma', insert: '\\sigma ', cursor: 7, titleKey: 'admin.questions.tools.sigma' },
      { id: 'g-mu', display: '\\mu', insert: '\\mu ', cursor: 4, titleKey: 'admin.questions.tools.mu' },
      { id: 'g-omega', display: '\\omega', insert: '\\omega ', cursor: 7, titleKey: 'admin.questions.tools.omega' },
    ],
  },
  {
    id: 'geometry',
    labelKey: 'admin.questions.tools.groupGeometry',
    items: [
      { id: 'ge-deg', display: '90^{\\circ}', insert: '^{\\circ}', cursor: 9, titleKey: 'admin.questions.tools.degree' },
      { id: 'ge-tri', display: '\\triangle ABC', insert: '\\triangle ', cursor: 10, titleKey: 'admin.questions.tools.triangle' },
      { id: 'ge-angle', display: '\\angle A', insert: '\\angle ', cursor: 7, titleKey: 'admin.questions.tools.angle' },
      { id: 'ge-sim', display: '\\sim', insert: '\\sim ', cursor: 5, titleKey: 'admin.questions.tools.similar' },
      { id: 'ge-cong', display: '\\cong', insert: '\\cong ', cursor: 6, titleKey: 'admin.questions.tools.congruent' },
      { id: 'ge-par', display: '\\parallel', insert: '\\parallel ', cursor: 10, titleKey: 'admin.questions.tools.parallel' },
      { id: 'ge-perp', display: '\\perp', insert: '\\perp ', cursor: 6, titleKey: 'admin.questions.tools.perpendicular' },
      { id: 'ge-line', display: '\\overline{AB}', insert: '\\overline{}', cursor: 10, titleKey: 'admin.questions.tools.overline' },
    ],
  },
  {
    id: 'functions',
    labelKey: 'admin.questions.tools.groupFunctions',
    items: [
      { id: 'f-sin', display: '\\sin', insert: '\\sin ', cursor: 5, titleKey: 'admin.questions.tools.sin' },
      { id: 'f-cos', display: '\\cos', insert: '\\cos ', cursor: 5, titleKey: 'admin.questions.tools.cos' },
      { id: 'f-tan', display: '\\tan', insert: '\\tan ', cursor: 5, titleKey: 'admin.questions.tools.tan' },
      { id: 'f-log', display: '\\log', insert: '\\log ', cursor: 5, titleKey: 'admin.questions.tools.log' },
      { id: 'f-ln', display: '\\ln', insert: '\\ln ', cursor: 4, titleKey: 'admin.questions.tools.ln' },
      { id: 'f-sum', display: '\\sum_{i=1}^{n}', insert: '\\sum_{}^{}', cursor: 6, titleKey: 'admin.questions.tools.sum' },
      { id: 'f-int', display: '\\int_{a}^{b}', insert: '\\int_{}^{}', cursor: 6, titleKey: 'admin.questions.tools.integral' },
      { id: 'f-lim', display: '\\lim_{x \\to 0}', insert: '\\lim_{}', cursor: 6, titleKey: 'admin.questions.tools.limit' },
    ],
  },
  {
    id: 'sets',
    labelKey: 'admin.questions.tools.groupSets',
    items: [
      { id: 'st-in', display: '\\in', insert: '\\in ', cursor: 4, titleKey: 'admin.questions.tools.elementOf' },
      { id: 'st-notin', display: '\\notin', insert: '\\notin ', cursor: 7, titleKey: 'admin.questions.tools.notElementOf' },
      { id: 'st-cup', display: '\\cup', insert: '\\cup ', cursor: 5, titleKey: 'admin.questions.tools.union' },
      { id: 'st-cap', display: '\\cap', insert: '\\cap ', cursor: 5, titleKey: 'admin.questions.tools.intersection' },
      { id: 'st-subset', display: '\\subseteq', insert: '\\subseteq ', cursor: 10, titleKey: 'admin.questions.tools.subset' },
      { id: 'st-empty', display: '\\emptyset', insert: '\\emptyset ', cursor: 10, titleKey: 'admin.questions.tools.emptySet' },
      { id: 'st-R', display: '\\mathbb{R}', insert: '\\mathbb{R}', cursor: 10, titleKey: 'admin.questions.tools.reals' },
      { id: 'st-Z', display: '\\mathbb{Z}', insert: '\\mathbb{Z}', cursor: 10, titleKey: 'admin.questions.tools.integers' },
    ],
  },
]
