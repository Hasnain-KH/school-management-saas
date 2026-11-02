export function exportCsv(filename, rows) {
  if (!rows.length) return;
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value) => {
    const text = cellText(value);
    const safeText = typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const content = [headers.map(quote).join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\r\n");
  download(filename, new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
}

export async function exportExcel(filename, rows, sheetName = "Report") {
  if (!rows.length) return;
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (headers.length > 16_384 || rows.length >= 1_048_576) throw new Error("The report exceeds Excel worksheet limits.");
  const name = sheetName.slice(0, 31) || "Report";
  const cells = [headers, ...rows.map((row) => headers.map((header) => cellText(row[header])))];
  const sheetRows = cells.map((values, rowIndex) => `<row r="${rowIndex + 1}">${values.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(42, Math.max(14, header.length + 3))}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${columnName(headers.length)}1"/></worksheet>`;
  const files = [
    { name: "[Content_Types].xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: "_rels/.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", text: worksheet }
  ];
  download(filename, new Blob([createZip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export function printPdf(title, rows) {
  if (!rows.length) throw new Error("There is no report data to print.");
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow pop-ups to create a printable PDF report.");
  popup.opener = null;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
  const tableHead = columns.map((column) => `<th>${escape(column)}</th>`).join("");
  const tableRows = rows.map((row) => `<tr>${columns.map((column) => `<td>${escape(row[column])}</td>`).join("")}</tr>`).join("");
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
    body{font:12px Arial,sans-serif;color:#24324b;padding:32px}h1{font-size:20px;margin:0 0 6px}
    p{color:#66758c;font-size:10px;margin:0 0 20px}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #dfe4ec;padding:7px;text-align:left;vertical-align:top}
    th{background:#edf1fa;color:#334b86;font-size:9px;text-transform:uppercase}
    td{font-size:9px;white-space:pre-wrap;word-break:break-word}
    @media print{body{padding:0}tr{break-inside:avoid}thead{display:table-header-group}}
  </style></head><body><h1>${escape(title)}</h1><p>Generated ${escape(new Date().toLocaleString())} · SchoolFlow live report data</p><table><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function columnName(number) {
  let result = "";
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode((value - 1) % 26 + 65) + result;
  }
  return result || "A";
}

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[character]));
}

function createZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const central = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.text);
    const checksum = crc32(content);
    const local = new Uint8Array(30 + name.length + content.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(14, checksum, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(content, 30 + name.length);
    locals.push(local);

    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, content.length, true);
    entryView.setUint32(24, content.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, localOffset, true);
    entry.set(name, 46);
    central.push(entry);
    localOffset += local.length;
  }
  if (localOffset > 0xffffffff) throw new Error("The report is too large to export.");
  const centralSize = central.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  return concatenate([...locals, ...central, end], localOffset + centralSize + end.length);
}

function concatenate(parts, totalLength) {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(bytes) {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) checksum = (checksum >>> 1) ^ (-(checksum & 1) & 0xedb88320);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}
