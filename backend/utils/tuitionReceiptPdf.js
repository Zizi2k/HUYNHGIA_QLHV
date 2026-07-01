const pdfmake = require('pdfmake');
const vfs = require('pdfmake/build/vfs_fonts.js');

for (const [file, data] of Object.entries(vfs)) {
  pdfmake.virtualfs.writeFileSync(file, Buffer.from(data, 'base64'));
}

pdfmake.setFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

function dottedLine(width = '*') {
  return { text: '........................................................................................', width, fontSize: 9, color: '#333333' };
}

function labelLine(label, value, width = '*') {
  return {
    columns: [
      { text: label, width: 'auto', fontSize: 10 },
      { text: value || '', width, fontSize: 10, margin: [4, 0, 0, 0] },
    ],
    margin: [0, 0, 0, 6],
  };
}

function buildTuitionReceiptPdf(receipt) {
  const { org, paymentDate, receiptNo, bookNo } = receipt;

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [50, 40, 50, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Đơn vị:', bold: true, fontSize: 10 },
              { text: org.unitName, margin: [0, 2, 0, 6] },
              { text: 'Địa chỉ:', bold: true, fontSize: 10 },
              { text: org.unitAddress, margin: [0, 2, 0, 0] },
            ],
          },
          {
            width: 200,
            stack: [
              { text: 'Mẫu số 01 – TT', alignment: 'center', bold: true, fontSize: 10 },
              {
                text: '(Ban hành theo Thông tư số 132/2018/TT-BTC\nngày 28/12/2018 của Bộ Tài chính)',
                alignment: 'center',
                fontSize: 8,
                italics: true,
                margin: [0, 2, 0, 0],
              },
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'PHIẾU THU', alignment: 'center', bold: true, fontSize: 18, margin: [0, 0, 0, 8] },
              {
                text: `Ngày ${paymentDate.day} tháng ${paymentDate.month} năm ${paymentDate.year}`,
                alignment: 'center',
                fontSize: 10,
              },
            ],
          },
          {
            width: 120,
            stack: [
              labelLine('Quyển số:', bookNo, '*'),
              labelLine('Số:', receiptNo, '*'),
            ],
          },
        ],
        margin: [0, 0, 0, 18],
      },
      labelLine('Họ và tên người nộp tiền:', receipt.payerName),
      labelLine('Địa chỉ:', receipt.payerAddress || '........................................................'),
      labelLine('Lý do nộp:', receipt.reason),
      {
        columns: [
          { text: 'Số tiền:', width: 'auto', fontSize: 10 },
          {
            text: `${receipt.amountFormatted} đ`,
            bold: true,
            width: 120,
            margin: [4, 0, 0, 0],
          },
          { text: '(Viết bằng chữ):', width: 'auto', margin: [12, 0, 0, 0] },
          { text: receipt.amountInWords, width: '*', italics: true, margin: [4, 0, 0, 0] },
        ],
        margin: [0, 0, 0, 6],
      },
      dottedLine(),
      {
        columns: [
          { text: 'Kèm theo:', width: 'auto' },
          { text: '................................................', width: '*' },
          { text: 'Chứng từ gốc:', width: 'auto', margin: [8, 0, 0, 0] },
        ],
        margin: [0, 10, 0, 24],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Giám đốc', bold: true, alignment: 'center' },
              { text: '(Ký, họ tên, đóng dấu)', alignment: 'center', fontSize: 8, italics: true, margin: [0, 2, 0, 40] },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Kế toán trưởng', bold: true, alignment: 'center' },
              { text: '(Ký, họ tên)', alignment: 'center', fontSize: 8, italics: true, margin: [0, 2, 0, 40] },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Người nộp tiền', bold: true, alignment: 'center' },
              { text: '(Ký, họ tên)', alignment: 'center', fontSize: 8, italics: true, margin: [0, 2, 0, 8] },
              { text: receipt.payerSignatureName, alignment: 'center', bold: true },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Thủ quỹ', bold: true, alignment: 'center' },
              { text: '(Ký, họ tên)', alignment: 'center', fontSize: 8, italics: true, margin: [0, 2, 0, 8] },
              { text: receipt.treasurerName, alignment: 'center', bold: true },
            ],
          },
        ],
      },
      {
        text: `Đã nhận đủ số tiền (viết bằng chữ): ${receipt.amountInWords}`,
        margin: [0, 20, 0, 0],
        fontSize: 9,
        italics: true,
      },
    ],
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

module.exports = { buildTuitionReceiptPdf };
