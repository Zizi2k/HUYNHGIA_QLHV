function canViewMemberPII(viewer) {
  return viewer && (viewer.role === 'admin' || viewer.role === 'teacher');
}

function toPublicMember(member, viewer) {
  if (canViewMemberPII(viewer)) return member;
  return {
    id: member.id,
    fullname: member.fullname,
    role: member.role,
  };
}

function mapPublicMembers(members, viewer) {
  return members.map((m) => toPublicMember(m, viewer));
}

function toPublicStudentRecord(record, viewer) {
  if (canViewMemberPII(viewer)) return record;
  const { username, code, phone, zalo, ...rest } = record;
  return rest;
}

function mapPublicStudentRecords(records, viewer) {
  return records.map((r) => toPublicStudentRecord(r, viewer));
}

function toPublicHonorEntry(entry, viewer) {
  if (canViewMemberPII(viewer)) return entry;
  const { username, ...rest } = entry;
  return rest;
}

function mapPublicHonorEntries(entries, viewer) {
  return entries.map((e) => toPublicHonorEntry(e, viewer));
}

module.exports = {
  canViewMemberPII,
  toPublicMember,
  mapPublicMembers,
  toPublicStudentRecord,
  mapPublicStudentRecords,
  toPublicHonorEntry,
  mapPublicHonorEntries,
};
