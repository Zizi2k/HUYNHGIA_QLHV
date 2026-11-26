import katex from 'katex';
import { MathMLToLaTeX } from 'mathml-to-latex';

const MAX_CLIPBOARD = 120000;
const MAX_FORMULA = 4000;
const wrap = (latex, display) => display || latex.includes('\n') ? '\n\n$$\n' + latex + '\n$$\n\n' : '$' + latex + '$';
const formulaCommand = /\\(?:d?frac|tfrac|sqrt|sum|prod|int|lim|begin|left|right|vec|overline|alpha|beta|gamma|Delta|pi|theta|times|cdot|sin|cos|tan|log|ln)\b/;
const ignored = new Set(['script', 'style', 'iframe', 'object', 'img', 'svg', 'noscript', 'link']);
const blocks = new Set(['div', 'p', 'li', 'section', 'article', 'tr']);
const name = (node) => (node.localName || '').toLowerCase().replace(/^m:/, '');
const checked = (source, display) => {
  const latex = source.trim();
  if (!latex || latex.length > MAX_FORMULA || /(?<!\\)\$/.test(latex)) throw new Error('Invalid formula');
  katex.renderToString(latex, { displayMode: display, trust: false, throwOnError: true, maxSize: 10, maxExpand: 100, strict: 'ignore' });
  return latex;
};

export function latexClipboard(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_FORMULA) return null;
  const delimiters = [[String.raw`\[`, String.raw`\]`, true], [String.raw`\(`, String.raw`\)`, false], ['$$', '$$', true], ['$', '$', false]];
  try {
    for (const [left, right, display] of delimiters) {
      if (trimmed.startsWith(left) && trimmed.endsWith(right) && trimmed.length > left.length + right.length) {
        const latex = checked(trimmed.slice(left.length, -right.length), display);
        return { latex, text: wrap(latex, display) };
      }
    }
    if (formulaCommand.test(trimmed) && !/\n\s*\n/.test(trimmed)) {
      const latex = checked(trimmed, false);
      return { latex, text: wrap(latex, false) };
    }
  } catch { /* Leave unrecognized text to normal paste. */ }
  return null;
}

const officeText = (value) => value.replace(/[\\{}$%#&_~^]/g, (char) => {
  if (char === '\\') return '\\backslash ';
  if (char === '^') return '\\hat{}';
  if (char === '~') return '\\sim ';
  return '\\' + char;
});
function officeLatex(node) {
  const type = name(node);
  const children = [...node.children];
  const child = (key) => {
    const item = children.find((element) => name(element) === key);
    if (!item) throw new Error('Missing Word formula element');
    return officeLatex(item);
  };
  switch (type) {
    case 'omath': case 'omathpara': case 'num': case 'den': case 'e': case 'sub': case 'sup': case 'deg': case 'r':
      return children.filter((item) => !name(item).endsWith('pr')).map(officeLatex).join(' ');
    case 't': return officeText(node.textContent);
    case 'f': return `\\frac{${child('num')}}{${child('den')}}`;
    case 'rad': {
      const degree = children.some((item) => name(item) === 'deg') ? child('deg').trim() : '';
      return `\\sqrt${degree ? `[${degree}]` : ''}{${child('e')}}`;
    }
    case 'ssup': return `{${child('e')}}^{${child('sup')}}`;
    case 'ssub': return `{${child('e')}}_{${child('sub')}}`;
    case 'ssubsup': return `{${child('e')}}_{${child('sub')}}^{${child('sup')}}`;
    default: throw new Error('Unsupported Word formula element');
  }
}

export function readFormulaClipboard(clipboard, doc = document) {
  const plain = clipboard.getData('text/plain');
  const rich = clipboard.getData('application/mathml+xml') || clipboard.getData('text/html');
  if (!rich || rich.length > MAX_CLIPBOARD || !/<(?:math\b|m:omath(?:para)?\b)/i.test(rich)) {
    return latexClipboard(plain) ?? (!plain && [...(clipboard.items ?? [])].some((item) => item.type.startsWith('image/'))
      ? { unsupported: true }
      : null);
  }
  const template = doc.createElement('template');
  template.innerHTML = rich;
  let count = 0;
  let unsupported = false;
  let single = null;
  function walk(node, depth = 0) {
    if (depth > 128) { unsupported = true; return ''; }
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1 || ignored.has(name(node))) return '';
    const type = name(node);
    if (['math', 'omath', 'omathpara'].includes(type)) {
      const display = node.getAttribute('display') === 'block' || type === 'omathpara';
      try {
        if (++count > 40 || node.outerHTML.length > 16000) throw new Error('Formula too large');
        const latex = checked(type === 'math' ? MathMLToLaTeX.convert(node.outerHTML) : officeLatex(node), display);
        single = { latex, text: wrap(latex, display) };
        return single.text;
      } catch {
        unsupported = true;
        return '';
      }
    }
    if (type === 'br') return '\n';
    const value = [...node.childNodes].map((child) => walk(child, depth + 1)).join('');
    return blocks.has(type) ? value + '\n' : value;
  }
  const text = [...template.content.childNodes].map((child) => walk(child)).join('');
  if (unsupported || !count) return latexClipboard(plain) ?? { unsupported: true };
  return count === 1 && text.trim() === single.text.trim() ? single : { text };
}
