const CENTER_SUBJECT_PREFIX = {
  lhg: {
    english: 'HGTA',
    chinese: 'HGTT',
    computer: 'HGTIN',
    vietnamese: 'HGTV',
  },
  egc: {
    english: 'EGTA',
    chinese: 'EGTT',
    computer: 'EGTIN',
    vietnamese: 'EGTV',
  },
};

function getSubjectPrefix(centerCode, subject) {
  const code = (centerCode || 'lhg').toLowerCase();
  return CENTER_SUBJECT_PREFIX[code]?.[subject] || CENTER_SUBJECT_PREFIX.lhg[subject];
}

function findSubjectByPrefix(prefix) {
  const upper = String(prefix || '').toUpperCase();
  for (const [centerCode, subjects] of Object.entries(CENTER_SUBJECT_PREFIX)) {
    for (const [subject, value] of Object.entries(subjects)) {
      if (value === upper) return { centerCode, subject };
    }
  }
  return null;
}

module.exports = {
  CENTER_SUBJECT_PREFIX,
  getSubjectPrefix,
  findSubjectByPrefix,
};
