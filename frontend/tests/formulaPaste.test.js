import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { latexClipboard, readFormulaClipboard } from '../src/components/class/formulaPaste.js';

const { document } = parseHTML('<html></html>');
const paste = (formats) => readFormulaClipboard({ getData: (type) => formats[type] ?? '' }, document);

test('LaTeX giữ phân số, căn, số mũ và chế độ riêng dòng', () => {
  assert.equal(latexClipboard(String.raw`\frac{1}{\sqrt{x^2}}`).text, String.raw`$\frac{1}{\sqrt{x^2}}$`);
  assert.match(latexClipboard(String.raw`\[x^2\]`).text, /\$\$\nx\^2\n\$\$/);
  assert.equal(latexClipboard('Tổng cộng 30.000 đồng'), null);
});

test('MathML trong đoạn văn giữ phân số và không nhập HTML thực thi', () => {
  const pasted = paste({ 'text/html': '<p>Cho <math><mfrac><mn>1</mn><msup><mi>x</mi><mn>2</mn></msup></mfrac></math> với x khác 0.</p><script>alert(1)</script>' });
  assert.match(pasted.text, /Cho \$\\frac\{1\}\{x\^\{2\}\}\$ với x khác 0\./);
  assert.doesNotMatch(pasted.text, /script|alert/);
});

test('phân số và lũy thừa từ Word được chuyển thành công thức sửa được', () => {
  const pasted = paste({ 'text/html': '<m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:den></m:f></m:oMath>' });
  assert.equal(pasted.latex, String.raw`\frac{1}{{x}^{2}}`);
});

test('không lặng lẽ bỏ cấu trúc Word chưa hỗ trợ', () => {
  assert.deepEqual(paste({ 'text/html': '<m:oMath><m:m /></m:oMath>', 'text/plain': 'ma trận' }), { unsupported: true });
});
