const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { template, parseWorkbook, fingerprint } = require('../services/staffClockImport');

test('Excel chấm công giữ ca qua ngày, phút nghỉ và báo lỗi theo dòng', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await template());
  assert.ok(workbook.getWorksheet('Hướng dẫn'));
  const data = workbook.getWorksheet('Chấm công');
  data.addRow(['GV1','Nguyễn Văn A',new Date('2026-10-01T00:00:00Z'),'23:30','01:00',15,'Trực','','Lịch sử']);
  data.addRow(['GV2','Nguyễn Văn B','2026-10-02',{ formula: '0.5', result: 0.5 },'16:00',0,'Trực','','Lịch sử']);
  const file = await workbook.xlsx.writeBuffer();
  const result = await parseWorkbook(file, Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(result[0].date, '2026-10-01');
  assert.equal(result[0].payableMinutes, 75);
  assert.equal(result[1].line, 3);
  assert.match(result[1].error, /công thức/);
  assert.equal(fingerprint(file).length, 64);
  await assert.rejects(parseWorkbook(Buffer.from('không phải XLSX')), { status: 400 });
});
