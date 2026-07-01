export function emptyAttachmentDraft() {
  return {
    existing: [],
    removedIds: [],
    newFiles: [],
    newLinks: [],
  };
}

export function getItemAttachments(item) {
  if (item?.attachments?.length) return item.attachments;
  if (item?.file_url) {
    return [{
      id: null,
      file_url: item.file_url,
      file_type: item.file_type,
      original_name: null,
    }];
  }
  return [];
}

export function attachmentDraftFromItem(item) {
  return {
    ...emptyAttachmentDraft(),
    existing: getItemAttachments(item).filter((a) => a.id != null),
  };
}

export function getVisibleAttachments(draft) {
  const keptExisting = draft.existing.filter((a) => !draft.removedIds.includes(a.id));
  const fileItems = draft.newFiles.map((file, idx) => ({
    key: `file-${idx}-${file.name}`,
    kind: 'file',
    file,
    label: file.name,
  }));
  const linkItems = draft.newLinks.map((link) => ({
    key: link.key,
    kind: 'link',
    url: link.url,
    linkType: link.linkType,
    label: link.url,
  }));
  const existingItems = keptExisting.map((a) => ({
    key: `existing-${a.id}`,
    kind: 'existing',
    attachment: a,
    label: a.original_name || a.file_url,
  }));
  return [...existingItems, ...fileItems, ...linkItems];
}

export function hasAttachmentDraftContent(draft) {
  return getVisibleAttachments(draft).length > 0;
}

export function appendAttachmentsToFormData(formData, draft) {
  draft.newFiles.forEach((file) => {
    formData.append('files', file);
  });
  if (draft.newLinks.length) {
    formData.append('links', JSON.stringify(
      draft.newLinks.map((link) => ({
        url: link.url,
        link_type: link.linkType,
      })),
    ));
  }
  if (draft.removedIds.length) {
    formData.append('remove_attachment_ids', JSON.stringify(draft.removedIds));
  }
}

export function shouldUseMultipartForAttachments(draft) {
  return draft.newFiles.length > 0
    || draft.newLinks.length > 0
    || draft.removedIds.length > 0;
}

export function buildAttachmentJsonPayload(draft) {
  const payload = {};
  if (draft.newLinks.length) {
    payload.links = draft.newLinks.map((link) => ({
      url: link.url,
      link_type: link.linkType,
    }));
  }
  if (draft.removedIds.length) {
    payload.remove_attachment_ids = draft.removedIds;
  }
  if (draft.existing.length && draft.removedIds.length === draft.existing.length && !draft.newLinks.length) {
    payload.remove_attachment = true;
  }
  return payload;
}

export function linkTypeToFileType(linkType) {
  const map = {
    website: 'link/website',
    document: 'link/document',
    image: 'link/image',
  };
  return map[linkType] || 'link/document';
}
