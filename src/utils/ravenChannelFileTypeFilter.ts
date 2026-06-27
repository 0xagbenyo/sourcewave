/**
 * Raven web file-type filters for “Files shared in this channel”
 * (`raven.api.raven_message.get_all_files_shared_in_channel`, `file_extensions` in raven_message.py).
 */
export type RavenChannelFileTypeFilter = 'any' | 'pdf' | 'doc' | 'ppt' | 'xls' | 'image';

/** Same extension groups as Raven server `file_extensions`. */
export const RAVEN_CHANNEL_FILE_EXTENSION_GROUPS: Record<'doc' | 'ppt' | 'xls', readonly string[]> = {
  doc: [
    'doc',
    'docx',
    'odt',
    'ott',
    'rtf',
    'txt',
    'dot',
    'dotx',
    'docm',
    'dotm',
    'pages',
  ],
  ppt: [
    'ppt',
    'pptx',
    'odp',
    'otp',
    'pps',
    'ppsx',
    'pot',
    'potx',
    'pptm',
    'ppsm',
    'potm',
    'ppam',
    'ppa',
    'key',
  ],
  xls: [
    'xls',
    'xlsx',
    'csv',
    'ods',
    'ots',
    'xlsb',
    'xlsm',
    'xlt',
    'xltx',
    'xltm',
    'xlam',
    'xla',
    'numbers',
  ],
};

export const RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS: Record<RavenChannelFileTypeFilter, string> = {
  any: 'Any',
  pdf: 'PDF',
  doc: 'Documents (.doc)',
  ppt: 'Presentations (.ppt)',
  xls: 'Spreadsheets (.xls)',
  image: 'Images',
};

export function ravenChannelFileMatchesTypeFilter(
  fileTypeOrExt: string | null | undefined,
  messageType: string | null | undefined,
  filter: RavenChannelFileTypeFilter
): boolean {
  if (filter === 'any') return true;
  const ext = String(fileTypeOrExt || '')
    .trim()
    .toLowerCase();
  const mt = String(messageType || '').toLowerCase();
  if (filter === 'image') return mt === 'image';
  if (filter === 'pdf') return ext === 'pdf';
  const group = RAVEN_CHANNEL_FILE_EXTENSION_GROUPS[filter as 'doc' | 'ppt' | 'xls'];
  return group ? group.includes(ext) : false;
}
