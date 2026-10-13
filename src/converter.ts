export interface XapFile {
  name: string;
  content: string;
  quoteNumber: string;
  customer: string;
  endUserAddress: string;
  lineCount: number;
  totalSum: number;
  currency: string;
}

export interface ConverterResult {
  folderName: string;
  files: XapFile[];
  summary: {
    totalQuotes: number;
    totalLineItems: number;
    totalAmount: number;
    currency: string;
  };
}

export interface ParseOptions {
  metadataRows?: number; // default 7, meaning row 8 is header (0-indexed 7)
  mode?: 'legacy' | 'strict';
}

function sanitizeTagName(str: string): string {
  return str
    ? str
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/^[0-9]/, '_$&')
        .toLowerCase()
    : 'field';
}

function rowToXml(record: Record<string, string>, rowElement: string): string {
  let xml = `  <${rowElement}>\n`;
  for (const [key, val] of Object.entries(record)) {
    if (val != null && val !== '') {
      const tag = sanitizeTagName(key);
      const escaped = String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      xml += `    <${tag}>${escaped}</${tag}>\n`;
    }
  }
  xml += `  </${rowElement}>\n`;
  return xml;
}

/**
 * Parses CSV according to standard RFC 4180 (handling quoted fields with commas & newlines)
 */
function parseCsvStrict(text: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Converts CSV content into standard XML records
 */
export function csvToXml(csvText: string, options: ParseOptions = {}): string {
  const { metadataRows = 7, mode = 'legacy' } = options;
  const rootElement = 'data';
  const rowElement = 'record';

  if (mode === 'legacy') {
    const lines = csvText.split(/\r?\n/);
    if (metadataRows >= lines.length) {
      throw new Error(`CSV too short: has ${lines.length} lines, expected at least ${metadataRows + 1}`);
    }

    const sample = lines.slice(metadataRows, metadataRows + 5);
    const delimiter = sample[0]?.includes(';') ? ';' : ',';
    const headers = lines[metadataRows]
      .split(delimiter)
      .map((col) => col.trim().replace(/^"|"$/g, ''));
    const dataLines = lines.slice(metadataRows + 1);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootElement}>\n`;
    for (const line of dataLines) {
      if (!line.trim()) continue;
      const values = line.split(delimiter).map((col) => col.trim().replace(/^"|"$/g, ''));
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (h) record[h] = values[idx] === undefined ? '' : values[idx];
      });
      xml += rowToXml(record, rowElement);
    }
    xml += `</${rootElement}>\n`;
    return xml;
  } else {
    // Strict parsing mode
    const lines = csvText.split(/\r?\n/);
    const sample = lines.slice(metadataRows, metadataRows + 5);
    const delimiter = sample[0]?.includes(';') ? ';' : ',';
    const allParsed = parseCsvStrict(csvText, delimiter);

    if (metadataRows >= allParsed.length) {
      throw new Error(`CSV too short: has ${allParsed.length} rows, expected header at row ${metadataRows + 1}`);
    }

    const headers = allParsed[metadataRows].map((h) => h.replace(/^"|"$/g, '').trim());
    const dataRows = allParsed.slice(metadataRows + 1);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootElement}>\n`;
    for (const values of dataRows) {
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      // Skip trailing summary rows
      if (values[0]?.toLowerCase().includes('end of report') || values[1]?.toLowerCase().includes('end of report')) {
        continue;
      }
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (h) record[h] = values[idx] === undefined ? '' : values[idx];
      });
      xml += rowToXml(record, rowElement);
    }
    xml += `</${rootElement}>\n`;
    return xml;
  }
}

/**
 * Builds the content of a single .xap file
 */
export function buildXapContent(
  templateHeader: string,
  items: Record<string, string>[],
  quoteNumber: string
): string {
  const lines: string[] = [];
  lines.push(templateHeader);
  lines.push('[Header]');

  const first = items[0] || {};
  const siteStr = String(first.site || '');
  const siteCode = siteStr.split('-')[0]?.trim() || '';
  const siteRemainder = siteStr.split('-').slice(1).join('-').trim() || '';
  const resellerStr = String(first.reseller || '');
  const resellerCode = resellerStr.split(' ')[0] || '';
  const resellerName = resellerStr.split(' ').slice(1).join(' ') || 'N/A';
  const endUserName = siteRemainder.split(',')[0]?.trim() || 'N/A';

  lines.push(`Customer="${resellerName}";"";"${resellerCode}";"";""`);
  lines.push(`Program="${first.ibm_subscription_and_service_renew || 'No'}";"";"";"""`);
  lines.push(`EndUser="${endUserName}";"";"${siteRemainder}";"${first.ibm_customer_number || ''}"`);

  const coverageEnd = first.coverage_dates?.split(' To ')[1] || '2025-12-31';
  lines.push(
    `Contract="";"${siteCode}";"";"${first.customer_set_designation || 'BP-Led'}";"VAR";"${coverageEnd}";"Yes"`
  );
  lines.push(
    `SourceDocument="ProActive Renewal Quote";"${quoteNumber}";"${coverageEnd}";"${first.ibm_renewal_contact || 'N/A'}"`
  );

  lines.push('[Lines]');
  lines.push(`Count="${items.length}"`);

  let totalSum = 0;
  items.forEach((item) => {
    const rawPrice = String(item.extended_price || '0').replace(/,/g, '.');
    totalSum += parseFloat(rawPrice) || 0;
  });

  lines.push(`Sums="";"${totalSum.toFixed(2)}";"";""`);
  lines.push(`Currency="${first.currency || 'EUR'}"`);

  items.forEach((item, index) => {
    const lineItemCoverageEnd = item.coverage_dates?.split(' To ')[1] || '';
    const lineFields = [
      item.part_number || '',
      item.part_description || '',
      '',
      '',
      'S&S|',
      item.renewal_line_item_start_date || '',
      lineItemCoverageEnd,
      '12',
      item.quantity || '1',
      '',
      '0.00',
      item.unit_price || '0.00',
      '',
      `${item.extended_price || '0.00'}|`,
      item.extended_price || '0.00',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ];
    lines.push(`L${index + 1}=${lineFields.map((f) => `"${f}"`).join(';')}`);
  });

  return lines.join('\n');
}

/**
 * Converts XML back into structured records, then builds the XAP files
 */
export function xmlToXap(xmlString: string): XapFile[] {
  const records: Record<string, string>[] = [];
  const recordRegex = /<record>([\s\S]*?)<\/record>/g;
  let match: RegExpExecArray | null;

  while ((match = recordRegex.exec(xmlString)) !== null) {
    const recordXml = match[1];
    const recordObj: Record<string, string> = {};
    const tagRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagRegex.exec(recordXml)) !== null) {
      const val = tagMatch[2]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      recordObj[tagMatch[1]] = val;
    }
    records.push(recordObj);
  }

  // Group by Quote Number
  const quotesMap: Record<string, Record<string, string>[]> = {};
  for (const record of records) {
    const quoteKey = record.quote_number || record.id || 'unknown';
    quotesMap[quoteKey] = quotesMap[quoteKey] || [];
    quotesMap[quoteKey].push(record);
  }

  const resultFiles: XapFile[] = [];

  for (const [quoteId, items] of Object.entries(quotesMap)) {
    const content = buildXapContent('Exchange Arrow Proposal - DB - 2.4 - Quote', items, quoteId);
    let fileNameBase = quoteId;

    if (items.length > 0) {
      const first = items[0];
      const sitePart = String(first.site || '').split('-')[1]?.split(',')[0]?.trim() || 'Quote';
      const resellerPart = String(first.reseller || '').split(' ').slice(1).join('') || 'Reseller';
      fileNameBase = `${quoteId}_${sitePart.replace(/[^a-z0-9]/gi, '')}_${resellerPart.replace(/[^a-z0-9]/gi, '')}`;
    }

    let sum = 0;
    items.forEach((item) => {
      const rawPrice = String(item.extended_price || '0').replace(/,/g, '.');
      sum += parseFloat(rawPrice) || 0;
    });

    const first = items[0] || {};
    const siteRemainder = String(first.site || '').split('-').slice(1).join('-').trim() || '';
    const endUserName = siteRemainder.split(',')[0]?.trim() || 'N/A';

    resultFiles.push({
      name: `${fileNameBase}.xap`,
      content,
      quoteNumber: quoteId,
      customer: endUserName,
      endUserAddress: siteRemainder,
      lineCount: items.length,
      totalSum: sum,
      currency: first.currency || 'EUR',
    });
  }

  // Sort files by quote number
  resultFiles.sort((a, b) => a.name.localeCompare(b.name));
  return resultFiles;
}

/**
 * High-level converter function: takes CSV content and original file name,
 * generates all XAP files, folder name, and statistical summary.
 */
export function convertCsvToXap(
  csvContent: string,
  fileName: string,
  options: ParseOptions = {}
): ConverterResult {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const folderName = `${baseName}_xap_package`;

  const xml = csvToXml(csvContent, options);
  const files = xmlToXap(xml);

  let totalLines = 0;
  let totalAmount = 0;
  let primaryCurrency = 'EUR';

  files.forEach((f) => {
    totalLines += f.lineCount;
    totalAmount += f.totalSum;
    if (f.currency) primaryCurrency = f.currency;
  });

  return {
    folderName,
    files,
    summary: {
      totalQuotes: files.length,
      totalLineItems: totalLines,
      totalAmount,
      currency: primaryCurrency,
    },
  };
}
