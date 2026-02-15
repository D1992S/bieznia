import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  AppError,
  CsvImportColumnMappingDTOSchema,
  CsvImportPreviewInputDTOSchema,
  CsvImportPreviewResultDTOSchema,
  CsvImportRunInputDTOSchema,
  SearchContentInputDTOSchema,
  SearchContentResultDTOSchema,
  err,
  ok,
  type CsvDetectedDelimiter,
  type CsvDelimiter,
  type CsvImportPreviewInputDTO,
  type CsvImportPreviewResultDTO,
  type CsvImportRunInputDTO,
  type CsvImportValidationIssueDTO,
  type Result,
  type SearchContentInputDTO,
  type SearchContentResultDTO,
} from '@moze/shared';

interface ParsedCsvRow {
  rowNumber: number;
  values: string[];
}

interface ParsedCsvTable {
  detectedDelimiter: CsvDetectedDelimiter;
  headers: string[];
  rows: ParsedCsvRow[];
}

interface NormalizedImportRow {
  rowNumber: number;
  date: string;
  views: number;
  subscribers: number;
  videos: number;
  likes: number;
  comments: number;
  title: string | null;
  description: string | null;
  transcript: string | null;
  videoId: string | null;
  publishedAt: string | null;
}

export interface CsvImportPersistResult {
  importId: number;
  channelId: string;
  sourceName: string;
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  importedDateFrom: string | null;
  importedDateTo: string | null;
  validationIssues: CsvImportValidationIssueDTO[];
}

export interface ImportSearchQueries {
  previewCsvImport: (input: CsvImportPreviewInputDTO) => Result<CsvImportPreviewResultDTO, AppError>;
  runCsvImport: (input: CsvImportRunInputDTO) => Result<CsvImportPersistResult, AppError>;
  searchContent: (input: SearchContentInputDTO) => Result<SearchContentResultDTO, AppError>;
}

interface SearchRow {
  documentId: string;
  videoId: string | null;
  title: string;
  publishedAt: string | null;
  score: number;
  transcriptSnippet: string;
  descriptionSnippet: string;
  titleSnippet: string;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function createDbError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

function normalizeHeaderKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replaceAll('/', '-');
  }

  const dotOrSlashMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (dotOrSlashMatch) {
    const [, day, month, year] = dotOrSlashMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function normalizeIsoDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed;
  }

  const asDate = normalizeIsoDate(trimmed);
  if (!asDate) {
    return null;
  }

  return `${asDate}T00:00:00.000Z`;
}

function parseNonNegativeInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let normalized = trimmed.replace(/\s+/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replaceAll(',', '');
  } else if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replaceAll(',', '.');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

function createValidationIssue(
  rowNumber: number,
  column: string,
  code: string,
  message: string,
  value: string | null,
): CsvImportValidationIssueDTO {
  return {
    rowNumber,
    column,
    code,
    message,
    value,
  };
}

function parseCsvRows(
  csvText: string,
  delimiterChar: string,
): Result<string[][], AppError> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index] ?? '';
    if (char === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        currentField += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiterChar) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && csvText[index + 1] === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  if (inQuotes) {
    return err(
      createDbError(
        'CSV_IMPORT_PARSE_FAILED',
        'CSV zawiera niedomkniety cudzyslow.',
        {},
      ),
    );
  }

  currentRow.push(currentField);
  rows.push(currentRow);

  const firstRow = rows[0];
  const firstField = firstRow?.[0];
  if (firstRow && firstField?.charCodeAt(0) === 0xfeff) {
    firstRow[0] = firstField.slice(1);
  }

  while (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    if (!lastRow || lastRow.every((cell) => cell.trim().length === 0)) {
      rows.pop();
      continue;
    }
    break;
  }

  return ok(rows);
}

function toDelimiterChar(delimiter: CsvDetectedDelimiter): string {
  if (delimiter === 'comma') {
    return ',';
  }
  if (delimiter === 'semicolon') {
    return ';';
  }
  return '\t';
}

function detectDelimiter(csvText: string, requested: CsvDelimiter): CsvDetectedDelimiter {
  if (requested !== 'auto') {
    if (requested === 'comma') {
      return 'comma';
    }
    if (requested === 'semicolon') {
      return 'semicolon';
    }
    return 'tab';
  }

  const candidates: CsvDetectedDelimiter[] = ['comma', 'semicolon', 'tab'];
  let best: CsvDetectedDelimiter = 'comma';
  let bestScore = -1;

  for (const candidate of candidates) {
    const parsed = parseCsvRows(csvText, toDelimiterChar(candidate));
    if (!parsed.ok) {
      continue;
    }

    const firstRowLength = parsed.value[0]?.length ?? 0;
    const secondRowLength = parsed.value[1]?.length ?? 0;
    const score = firstRowLength + secondRowLength;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function buildParsedCsvTable(
  csvText: string,
  hasHeader: boolean,
  delimiter: CsvDelimiter,
): Result<ParsedCsvTable, AppError> {
  const detectedDelimiter = detectDelimiter(csvText, delimiter);
  const parsedRowsResult = parseCsvRows(csvText, toDelimiterChar(detectedDelimiter));
  if (!parsedRowsResult.ok) {
    return parsedRowsResult;
  }

  const rawRows = parsedRowsResult.value;
  if (rawRows.length === 0) {
    return err(
      createDbError(
        'CSV_IMPORT_EMPTY',
        'Przekazany CSV jest pusty.',
        {},
      ),
    );
  }

  const maxColumns = rawRows.reduce((acc, row) => Math.max(acc, row.length), 0);
  if (maxColumns === 0) {
    return err(
      createDbError(
        'CSV_IMPORT_EMPTY',
        'Przekazany CSV nie zawiera kolumn.',
        {},
      ),
    );
  }

  const normalizeHeaderAt = (rawHeader: string, index: number): string => {
    const trimmed = rawHeader.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
    return `kolumna_${index + 1}`;
  };

  const uniqueHeaders = new Map<string, number>();
  const ensureUniqueHeader = (header: string): string => {
    const existingCount = uniqueHeaders.get(header) ?? 0;
    uniqueHeaders.set(header, existingCount + 1);
    if (existingCount === 0) {
      return header;
    }
    return `${header}_${existingCount + 1}`;
  };

  const headers: string[] = [];
  const dataRows: ParsedCsvRow[] = [];
  if (hasHeader) {
    const headerRow = rawRows[0] ?? [];
    for (let index = 0; index < maxColumns; index += 1) {
      const nextHeader = normalizeHeaderAt(headerRow[index] ?? '', index);
      headers.push(ensureUniqueHeader(nextHeader));
    }

    for (let index = 1; index < rawRows.length; index += 1) {
      const row = rawRows[index] ?? [];
      dataRows.push({
        rowNumber: index + 1,
        values: headers.map((_header, columnIndex) => row[columnIndex] ?? ''),
      });
    }
  } else {
    for (let index = 0; index < maxColumns; index += 1) {
      headers.push(`kolumna_${index + 1}`);
    }
    for (let index = 0; index < rawRows.length; index += 1) {
      const row = rawRows[index] ?? [];
      dataRows.push({
        rowNumber: index + 1,
        values: headers.map((_header, columnIndex) => row[columnIndex] ?? ''),
      });
    }
  }

  return ok({
    detectedDelimiter,
    headers,
    rows: dataRows,
  });
}

function buildSuggestedMapping(headers: readonly string[]) {
  const suggestions: Record<string, string> = {};

  const synonymMap: Record<string, string[]> = {
    date: ['date', 'data', 'dzien', 'dzie', 'dzień'],
    views: ['views', 'wyswietlenia', 'wyświetlenia', 'odslony'],
    subscribers: ['subscribers', 'subskrypcje', 'suby', 'subs'],
    videos: ['videos', 'filmy', 'video', 'wideo'],
    likes: ['likes', 'polubienia', 'lajki'],
    comments: ['comments', 'komentarze'],
    title: ['title', 'tytul', 'tytuł', 'nazwa'],
    description: ['description', 'opis'],
    transcript: ['transcript', 'transkrypcja', 'napisy'],
    videoId: ['videoid', 'idfilmu', 'idvideo'],
    publishedAt: ['publishedat', 'datapublikacji', 'published'],
  };

  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    key: normalizeHeaderKey(header),
  }));

  for (const [field, synonyms] of Object.entries(synonymMap)) {
    const exact = normalizedHeaders.find((header) => synonyms.includes(header.key));
    if (exact) {
      suggestions[field] = exact.raw;
      continue;
    }

    const partial = normalizedHeaders.find((header) => synonyms.some((synonym) => header.key.includes(synonym)));
    if (partial) {
      suggestions[field] = partial.raw;
    }
  }

  return CsvImportColumnMappingDTOSchema.partial().parse(suggestions);
}

function readMappedValue(
  row: ParsedCsvRow,
  headers: readonly string[],
  mappingColumn: string | undefined,
): string {
  if (!mappingColumn) {
    return '';
  }

  const columnIndex = headers.indexOf(mappingColumn);
  if (columnIndex < 0) {
    return '';
  }

  return row.values[columnIndex] ?? '';
}

function normalizeImportRows(
  table: ParsedCsvTable,
  mapping: CsvImportRunInputDTO['mapping'],
): Result<{
  normalizedRows: NormalizedImportRow[];
  validationIssues: CsvImportValidationIssueDTO[];
}, AppError> {
  const validationIssues: CsvImportValidationIssueDTO[] = [];
  const normalizedRows: NormalizedImportRow[] = [];

  const requiredMappings: Array<keyof CsvImportRunInputDTO['mapping']> = ['date', 'views', 'subscribers', 'videos'];
  for (const requiredField of requiredMappings) {
    const mappedHeader = mapping[requiredField];
    if (!mappedHeader || !table.headers.includes(mappedHeader)) {
      return err(
        createDbError(
          'CSV_IMPORT_MAPPING_INVALID',
          'Mapowanie CSV jest niepoprawne.',
          { field: requiredField, mappedHeader: mappedHeader ?? null, availableHeaders: table.headers },
        ),
      );
    }
  }

  for (const row of table.rows) {
    const dateRaw = readMappedValue(row, table.headers, mapping.date);
    const viewsRaw = readMappedValue(row, table.headers, mapping.views);
    const subscribersRaw = readMappedValue(row, table.headers, mapping.subscribers);
    const videosRaw = readMappedValue(row, table.headers, mapping.videos);
    const likesRaw = readMappedValue(row, table.headers, mapping.likes);
    const commentsRaw = readMappedValue(row, table.headers, mapping.comments);

    const parsedDate = normalizeIsoDate(dateRaw);
    const parsedViews = parseNonNegativeInteger(viewsRaw);
    const parsedSubscribers = parseNonNegativeInteger(subscribersRaw);
    const parsedVideos = parseNonNegativeInteger(videosRaw);

    let rowHasHardError = false;
    if (!parsedDate) {
      validationIssues.push(
        createValidationIssue(
          row.rowNumber,
          mapping.date,
          'CSV_IMPORT_INVALID_DATE',
          'Data musi miec format YYYY-MM-DD lub DD.MM.YYYY.',
          dateRaw || null,
        ),
      );
      rowHasHardError = true;
    }

    if (parsedViews === null) {
      validationIssues.push(
        createValidationIssue(
          row.rowNumber,
          mapping.views,
          'CSV_IMPORT_INVALID_NUMBER',
          'Wartosc metryki nie jest liczba nieujemna.',
          viewsRaw || null,
        ),
      );
      rowHasHardError = true;
    }

    if (parsedSubscribers === null) {
      validationIssues.push(
        createValidationIssue(
          row.rowNumber,
          mapping.subscribers,
          'CSV_IMPORT_INVALID_NUMBER',
          'Wartosc metryki nie jest liczba nieujemna.',
          subscribersRaw || null,
        ),
      );
      rowHasHardError = true;
    }

    if (parsedVideos === null) {
      validationIssues.push(
        createValidationIssue(
          row.rowNumber,
          mapping.videos,
          'CSV_IMPORT_INVALID_NUMBER',
          'Wartosc metryki nie jest liczba nieujemna.',
          videosRaw || null,
        ),
      );
      rowHasHardError = true;
    }

    if (rowHasHardError || !parsedDate || parsedViews === null || parsedSubscribers === null || parsedVideos === null) {
      continue;
    }

    const parsedLikes = mapping.likes
      ? parseNonNegativeInteger(likesRaw)
      : 0;
    const parsedComments = mapping.comments
      ? parseNonNegativeInteger(commentsRaw)
      : 0;

    if (mapping.likes && parsedLikes === null) {
      validationIssues.push(
        createValidationIssue(
          row.rowNumber,
          mapping.likes,
          'CSV_IMPORT_INVALID_NUMBER',
          'Wartosc metryki nie jest liczba nieujemna.',
          likesRaw || null,
        ),
      );
    }

    if (mapping.comments && parsedComments === null) {
      validationIssues.push(
        createValidationIssue(
          row.rowNumber,
          mapping.comments,
          'CSV_IMPORT_INVALID_NUMBER',
          'Wartosc metryki nie jest liczba nieujemna.',
          commentsRaw || null,
        ),
      );
    }

    const title = readMappedValue(row, table.headers, mapping.title).trim() || null;
    const description = readMappedValue(row, table.headers, mapping.description).trim() || null;
    const transcript = readMappedValue(row, table.headers, mapping.transcript).trim() || null;
    const videoId = readMappedValue(row, table.headers, mapping.videoId).trim() || null;
    const publishedAtRaw = readMappedValue(row, table.headers, mapping.publishedAt);
    const publishedAt = normalizeIsoDateTime(publishedAtRaw);

    if (mapping.publishedAt && publishedAtRaw.trim().length > 0 && !publishedAt) {
      validationIssues.push(
        createValidationIssue(
          row.rowNumber,
          mapping.publishedAt,
          'CSV_IMPORT_INVALID_DATETIME',
          'Data publikacji musi miec format YYYY-MM-DD lub ISO datetime.',
          publishedAtRaw || null,
        ),
      );
    }

    normalizedRows.push({
      rowNumber: row.rowNumber,
      date: parsedDate,
      views: parsedViews,
      subscribers: parsedSubscribers,
      videos: parsedVideos,
      likes: parsedLikes ?? 0,
      comments: parsedComments ?? 0,
      title,
      description,
      transcript,
      videoId,
      publishedAt,
    });
  }

  if (normalizedRows.length === 0) {
    return err(
      createDbError(
        'CSV_IMPORT_NO_VALID_ROWS',
        'Nie znaleziono poprawnych wierszy CSV do importu.',
        {
          rowsTotal: table.rows.length,
          validationIssues: validationIssues.slice(0, 50),
        },
      ),
    );
  }

  return ok({
    normalizedRows,
    validationIssues,
  });
}

function buildSearchQuery(rawQuery: string): string | null {
  const tokens = rawQuery
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 10);

  if (tokens.length === 0) {
    return null;
  }

  const escapedTokens = tokens.map((token) => `"${token.replaceAll('"', '""')}"*`);
  return escapedTokens.join(' AND ');
}

export function createImportSearchQueries(db: Database.Database): ImportSearchQueries {
  const insertCsvImportStmt = db.prepare<{
    profileId: string | null;
    channelId: string;
    sourceName: string;
    csvSha256: string;
    columnMappingJson: string;
    rowsTotal: number;
    rowsValid: number;
    rowsInvalid: number;
    status: 'completed' | 'failed';
    errorJson: string | null;
    importedAt: string;
  }>(
    `
      INSERT INTO raw_csv_imports (
        profile_id,
        channel_id,
        source_name,
        csv_sha256,
        column_mapping_json,
        rows_total,
        rows_valid,
        rows_invalid,
        status,
        error_json,
        imported_at
      )
      VALUES (
        @profileId,
        @channelId,
        @sourceName,
        @csvSha256,
        @columnMappingJson,
        @rowsTotal,
        @rowsValid,
        @rowsInvalid,
        @status,
        @errorJson,
        @importedAt
      )
    `,
  );

  const getChannelSnapshotStmt = db.prepare<{ channelId: string }, {
    name: string;
    description: string;
    thumbnailUrl: string | null;
    publishedAt: string;
  }>(
    `
      SELECT
        name,
        description,
        thumbnail_url AS thumbnailUrl,
        published_at AS publishedAt
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `,
  );

  const upsertChannelStmt = db.prepare<{
    channelId: string;
    name: string;
    description: string;
    thumbnailUrl: string | null;
    publishedAt: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    lastSyncAt: string;
    updatedAt: string;
  }>(
    `
      INSERT INTO dim_channel (
        channel_id,
        name,
        description,
        thumbnail_url,
        published_at,
        subscriber_count,
        video_count,
        view_count,
        last_sync_at,
        updated_at
      )
      VALUES (
        @channelId,
        @name,
        @description,
        @thumbnailUrl,
        @publishedAt,
        @subscriberCount,
        @videoCount,
        @viewCount,
        @lastSyncAt,
        @updatedAt
      )
      ON CONFLICT(channel_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        thumbnail_url = excluded.thumbnail_url,
        published_at = excluded.published_at,
        subscriber_count = excluded.subscriber_count,
        video_count = excluded.video_count,
        view_count = excluded.view_count,
        last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at
    `,
  );

  const upsertChannelDayReplaceStmt = db.prepare<{
    channelId: string;
    date: string;
    subscribers: number;
    views: number;
    videos: number;
    likes: number;
    comments: number;
    updatedAt: string;
  }>(
    `
      INSERT INTO fact_channel_day (
        channel_id,
        date,
        subscribers,
        views,
        videos,
        likes,
        comments,
        watch_time_minutes,
        updated_at
      )
      VALUES (
        @channelId,
        @date,
        @subscribers,
        @views,
        @videos,
        @likes,
        @comments,
        NULL,
        @updatedAt
      )
      ON CONFLICT(channel_id, date) DO UPDATE SET
        subscribers = excluded.subscribers,
        views = excluded.views,
        videos = excluded.videos,
        likes = excluded.likes,
        comments = excluded.comments,
        updated_at = excluded.updated_at
    `,
  );

  const insertVideoIfMissingStmt = db.prepare<{
    videoId: string;
    channelId: string;
    title: string;
    description: string;
    publishedAt: string;
    thumbnailUrl: string | null;
    updatedAt: string;
  }>(
    `
      INSERT OR IGNORE INTO dim_video (
        video_id,
        channel_id,
        title,
        description,
        published_at,
        duration_seconds,
        view_count,
        like_count,
        comment_count,
        thumbnail_url,
        updated_at
      )
      VALUES (
        @videoId,
        @channelId,
        @title,
        @description,
        @publishedAt,
        NULL,
        0,
        0,
        0,
        @thumbnailUrl,
        @updatedAt
      )
    `,
  );

  const upsertContentDocumentStmt = db.prepare<{
    documentId: string;
    channelId: string;
    videoId: string | null;
    title: string;
    description: string;
    transcript: string;
    publishedAt: string | null;
    sourceImportId: number | null;
    updatedAt: string;
  }>(
    `
      INSERT INTO dim_content_documents (
        document_id,
        channel_id,
        video_id,
        title,
        description,
        transcript,
        published_at,
        source_import_id,
        updated_at
      )
      VALUES (
        @documentId,
        @channelId,
        @videoId,
        @title,
        @description,
        @transcript,
        @publishedAt,
        @sourceImportId,
        @updatedAt
      )
      ON CONFLICT(document_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        video_id = excluded.video_id,
        title = excluded.title,
        description = excluded.description,
        transcript = excluded.transcript,
        published_at = excluded.published_at,
        source_import_id = excluded.source_import_id,
        updated_at = excluded.updated_at
    `,
  );

  const syncVideoCatalogDocumentsStmt = db.prepare<{ channelId: string; updatedAt: string }>(
    `
      INSERT OR IGNORE INTO dim_content_documents (
        document_id,
        channel_id,
        video_id,
        title,
        description,
        transcript,
        published_at,
        source_import_id,
        updated_at
      )
      SELECT
        'video:' || video_id,
        channel_id,
        video_id,
        title,
        description,
        '',
        published_at,
        NULL,
        @updatedAt
      FROM dim_video
      WHERE channel_id = @channelId
      ORDER BY published_at ASC, video_id ASC
    `,
  );

  const countSearchResultsStmt = db.prepare<{ channelId: string; matchQuery: string }, { total: number }>(
    `
      SELECT
        COUNT(*) AS total
      FROM fts_content_documents
      INNER JOIN dim_content_documents
        ON dim_content_documents.rowid = fts_content_documents.rowid
      WHERE dim_content_documents.channel_id = @channelId
        AND fts_content_documents MATCH @matchQuery
    `,
  );

  const searchResultsStmt = db.prepare<{
    channelId: string;
    matchQuery: string;
    limit: number;
    offset: number;
  }, SearchRow>(
    `
      SELECT
        dim_content_documents.document_id AS documentId,
        dim_content_documents.video_id AS videoId,
        dim_content_documents.title AS title,
        dim_content_documents.published_at AS publishedAt,
        bm25(fts_content_documents, 1.0, 0.8, 0.6) AS score,
        snippet(fts_content_documents, 0, '<mark>', '</mark>', '…', 18) AS titleSnippet,
        snippet(fts_content_documents, 1, '<mark>', '</mark>', '…', 22) AS descriptionSnippet,
        snippet(fts_content_documents, 2, '<mark>', '</mark>', '…', 26) AS transcriptSnippet
      FROM fts_content_documents
      INNER JOIN dim_content_documents
        ON dim_content_documents.rowid = fts_content_documents.rowid
      WHERE dim_content_documents.channel_id = @channelId
        AND fts_content_documents MATCH @matchQuery
      ORDER BY score ASC, dim_content_documents.published_at DESC, dim_content_documents.document_id ASC
      LIMIT @limit
      OFFSET @offset
    `,
  );

  return {
    previewCsvImport: (input) => {
      const parsedInput = CsvImportPreviewInputDTOSchema.safeParse(input);
      if (!parsedInput.success) {
        return err(
          createDbError(
            'CSV_IMPORT_PREVIEW_INPUT_INVALID',
            'Przekazano niepoprawne dane podgladu CSV.',
            { issues: parsedInput.error.issues },
          ),
        );
      }

      const tableResult = buildParsedCsvTable(
        parsedInput.data.csvText,
        parsedInput.data.hasHeader,
        parsedInput.data.delimiter,
      );
      if (!tableResult.ok) {
        return tableResult;
      }

      const sampleRows = tableResult.value.rows
        .slice(0, parsedInput.data.previewRowsLimit)
        .map((row) => {
          const mappedRow: Record<string, string> = {};
          for (const [index, header] of tableResult.value.headers.entries()) {
            mappedRow[header] = row.values[index] ?? '';
          }
          return mappedRow;
        });

      const previewResult = CsvImportPreviewResultDTOSchema.safeParse({
        channelId: parsedInput.data.channelId,
        sourceName: parsedInput.data.sourceName,
        detectedDelimiter: tableResult.value.detectedDelimiter,
        headers: tableResult.value.headers,
        rowsTotal: tableResult.value.rows.length,
        sampleRows,
        suggestedMapping: buildSuggestedMapping(tableResult.value.headers),
      });
      if (!previewResult.success) {
        return err(
          createDbError(
            'CSV_IMPORT_PREVIEW_OUTPUT_INVALID',
            'Podglad CSV ma niepoprawny format.',
            { issues: previewResult.error.issues },
          ),
        );
      }

      return ok(previewResult.data);
    },

    runCsvImport: (input) => {
      const parsedInput = CsvImportRunInputDTOSchema.safeParse(input);
      if (!parsedInput.success) {
        return err(
          createDbError(
            'CSV_IMPORT_INPUT_INVALID',
            'Przekazano niepoprawne dane importu CSV.',
            { issues: parsedInput.error.issues },
          ),
        );
      }

      const mappingValidation = CsvImportColumnMappingDTOSchema.safeParse(parsedInput.data.mapping);
      if (!mappingValidation.success) {
        return err(
          createDbError(
            'CSV_IMPORT_MAPPING_INVALID',
            'Mapowanie CSV jest niepoprawne.',
            { issues: mappingValidation.error.issues },
          ),
        );
      }

      const tableResult = buildParsedCsvTable(
        parsedInput.data.csvText,
        parsedInput.data.hasHeader,
        parsedInput.data.delimiter,
      );
      if (!tableResult.ok) {
        return tableResult;
      }

      const normalizedRowsResult = normalizeImportRows(tableResult.value, parsedInput.data.mapping);
      if (!normalizedRowsResult.ok) {
        return normalizedRowsResult;
      }

      const normalizedRows = normalizedRowsResult.value.normalizedRows;
      const validationIssues = normalizedRowsResult.value.validationIssues;
      const dedupByDate = new Map<string, NormalizedImportRow>();
      for (const row of normalizedRows) {
        dedupByDate.set(row.date, row);
      }
      const channelRows = Array.from(dedupByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

      const importedDateFrom = channelRows[0]?.date ?? null;
      const importedDateTo = channelRows[channelRows.length - 1]?.date ?? null;
      const latestRow = channelRows[channelRows.length - 1];
      const rowsValid = normalizedRows.length;
      const rowsInvalid = Math.max(tableResult.value.rows.length - rowsValid, 0);
      const importedAt = new Date().toISOString();
      const csvSha256 = createHash('sha256').update(parsedInput.data.csvText).digest('hex');

      if (!latestRow) {
        return err(
          createDbError(
            'CSV_IMPORT_NO_VALID_ROWS',
            'Nie znaleziono poprawnych wierszy CSV do importu.',
            { rowsTotal: tableResult.value.rows.length },
          ),
        );
      }

      try {
        const writeTx = db.transaction(() => {
          const existingChannel = getChannelSnapshotStmt.get({ channelId: parsedInput.data.channelId });
          const channelName = existingChannel?.name ?? 'Kanał importowany';
          const channelDescription = existingChannel?.description ?? '';
          const channelThumbnailUrl = existingChannel?.thumbnailUrl ?? null;
          const channelPublishedAt = existingChannel?.publishedAt ?? `${latestRow.date}T00:00:00.000Z`;
          const channelViewCount = channelRows.reduce((acc, row) => acc + row.views, 0);

          upsertChannelStmt.run({
            channelId: parsedInput.data.channelId,
            name: channelName,
            description: channelDescription,
            thumbnailUrl: channelThumbnailUrl,
            publishedAt: channelPublishedAt,
            subscriberCount: latestRow.subscribers,
            videoCount: latestRow.videos,
            viewCount: channelViewCount,
            lastSyncAt: importedAt,
            updatedAt: importedAt,
          });

          for (const row of channelRows) {
            upsertChannelDayReplaceStmt.run({
              channelId: parsedInput.data.channelId,
              date: row.date,
              subscribers: row.subscribers,
              views: row.views,
              videos: row.videos,
              likes: row.likes,
              comments: row.comments,
              updatedAt: importedAt,
            });
          }

          const importInsertResult = insertCsvImportStmt.run({
            profileId: null,
            channelId: parsedInput.data.channelId,
            sourceName: parsedInput.data.sourceName,
            csvSha256,
            columnMappingJson: JSON.stringify(parsedInput.data.mapping),
            rowsTotal: tableResult.value.rows.length,
            rowsValid,
            rowsInvalid,
            status: 'completed',
            errorJson: validationIssues.length > 0 ? JSON.stringify(validationIssues.slice(0, 200)) : null,
            importedAt,
          });
          const importId = Number(importInsertResult.lastInsertRowid);

          for (const row of normalizedRows) {
            const shouldPersistDocument =
              (row.title && row.title.length > 0)
              || (row.description && row.description.length > 0)
              || (row.transcript && row.transcript.length > 0)
              || Boolean(row.videoId);
            if (!shouldPersistDocument) {
              continue;
            }

            if (row.videoId) {
              const fallbackPublishedAt = row.publishedAt ?? `${row.date}T00:00:00.000Z`;
              insertVideoIfMissingStmt.run({
                videoId: row.videoId,
                channelId: parsedInput.data.channelId,
                title: row.title ?? `Film ${row.videoId}`,
                description: row.description ?? '',
                publishedAt: fallbackPublishedAt,
                thumbnailUrl: null,
                updatedAt: importedAt,
              });
            }

            const documentId = row.videoId
              ? `video:${row.videoId}`
              : `import:${importId}:row:${row.rowNumber}`;
            upsertContentDocumentStmt.run({
              documentId,
              channelId: parsedInput.data.channelId,
              videoId: row.videoId,
              title: row.title ?? (row.videoId ? `Film ${row.videoId}` : `Wiersz ${row.rowNumber}`),
              description: row.description ?? '',
              transcript: row.transcript ?? '',
              publishedAt: row.publishedAt ?? `${row.date}T00:00:00.000Z`,
              sourceImportId: importId,
              updatedAt: importedAt,
            });
          }

          return importId;
        });

        const importId = writeTx();
        return ok({
          importId,
          channelId: parsedInput.data.channelId,
          sourceName: parsedInput.data.sourceName,
          rowsTotal: tableResult.value.rows.length,
          rowsValid,
          rowsInvalid,
          importedDateFrom,
          importedDateTo,
          validationIssues,
        });
      } catch (cause) {
        return err(
          createDbError(
            'CSV_IMPORT_PERSIST_FAILED',
            'Nie udalo sie zapisac danych z CSV do bazy.',
            {
              channelId: parsedInput.data.channelId,
              sourceName: parsedInput.data.sourceName,
            },
            cause,
          ),
        );
      }
    },

    searchContent: (input) => {
      const parsedInput = SearchContentInputDTOSchema.safeParse(input);
      if (!parsedInput.success) {
        return err(
          createDbError(
            'SEARCH_INPUT_INVALID',
            'Przekazano niepoprawne parametry wyszukiwania.',
            { issues: parsedInput.error.issues },
          ),
        );
      }

      const matchQuery = buildSearchQuery(parsedInput.data.query);
      if (!matchQuery) {
        return err(
          createDbError(
            'SEARCH_QUERY_INVALID',
            'Zapytanie wyszukiwania jest puste.',
            { query: parsedInput.data.query },
          ),
        );
      }

      try {
        syncVideoCatalogDocumentsStmt.run({
          channelId: parsedInput.data.channelId,
          updatedAt: new Date().toISOString(),
        });
      } catch (cause) {
        return err(
          createDbError(
            'SEARCH_INDEX_SYNC_FAILED',
            'Nie udalo sie zsynchronizowac indeksu wyszukiwania.',
            { channelId: parsedInput.data.channelId },
            cause,
          ),
        );
      }

      try {
        const totalRow = countSearchResultsStmt.get({
          channelId: parsedInput.data.channelId,
          matchQuery,
        });

        const rows = searchResultsStmt.all({
          channelId: parsedInput.data.channelId,
          matchQuery,
          limit: parsedInput.data.limit,
          offset: parsedInput.data.offset,
        });

        const resultPayload = SearchContentResultDTOSchema.safeParse({
          channelId: parsedInput.data.channelId,
          query: parsedInput.data.query,
          total: totalRow?.total ?? 0,
          items: rows.map((row) => {
            const hasTranscriptSnippet = row.transcriptSnippet.trim().length > 0;
            const hasDescriptionSnippet = row.descriptionSnippet.trim().length > 0;
            const source = hasTranscriptSnippet
              ? 'transcript'
              : (hasDescriptionSnippet ? 'description' : 'title');
            const snippet = hasTranscriptSnippet
              ? row.transcriptSnippet
              : (hasDescriptionSnippet ? row.descriptionSnippet : row.titleSnippet);

            return {
              documentId: row.documentId,
              videoId: row.videoId,
              title: row.title,
              publishedAt: row.publishedAt,
              snippet: snippet.trim().length > 0 ? snippet : row.title,
              source,
              score: row.score,
            };
          }),
        });
        if (!resultPayload.success) {
          return err(
            createDbError(
              'SEARCH_OUTPUT_INVALID',
              'Wynik wyszukiwania ma niepoprawny format.',
              { issues: resultPayload.error.issues },
            ),
          );
        }

        return ok(resultPayload.data);
      } catch (cause) {
        return err(
          createDbError(
            'SEARCH_QUERY_FAILED',
            'Nie udalo sie wykonac zapytania wyszukiwania.',
            {
              channelId: parsedInput.data.channelId,
              query: parsedInput.data.query,
            },
            cause,
          ),
        );
      }
    },
  };
}
