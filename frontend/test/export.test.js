import assert from "node:assert/strict";
import test from "node:test";
import { exportCsv, exportExcel, printPdf } from "../src/utils/export.js";

function installBrowserStubs(t) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const originalSetTimeout = Object.getOwnPropertyDescriptor(globalThis, "setTimeout");
  const downloads = [];
  const anchor = {
    click() {
      this.clicked = true;
    }
  };
  const popup = {
    document: {
      write(content) { this.content = content; },
      close() { this.closed = true; }
    }
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => anchor }
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: (blob) => {
      downloads.push({ blob, anchor });
      return "blob:report-test";
    }
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => {}
  });
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: (callback) => {
      callback();
      return 1;
    }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { open: () => popup }
  });

  t.after(() => {
    restoreGlobal("document", originalDocument);
    restoreGlobal("window", originalWindow);
    restoreProperty(URL, "createObjectURL", originalCreateObjectUrl);
    restoreProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    restoreProperty(globalThis, "setTimeout", originalSetTimeout);
  });
  return { downloads, anchor, popup };
}

function restoreGlobal(name, descriptor) {
  restoreProperty(globalThis, name, descriptor);
}

function restoreProperty(target, name, descriptor) {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else delete target[name];
}

function worksheetXml(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (name === "xl/worksheets/sheet1.xml") {
      return decoder.decode(bytes.subarray(dataStart, dataStart + size));
    }
    offset = dataStart + size;
  }
  throw new Error("Worksheet XML was not found in the exported workbook.");
}

test("CSV export downloads escaped cells and protects spreadsheet formulas", async (t) => {
  const { downloads, anchor } = installBrowserStubs(t);
  exportCsv("students.csv", [{
    Student: '=HYPERLINK("https://example.test")',
    Note: 'a,b "quoted"'
  }]);

  assert.equal(anchor.download, "students.csv");
  assert.equal(anchor.href, "blob:report-test");
  assert.equal(anchor.clicked, true);
  const bytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const content = new TextDecoder().decode(bytes.slice(3));
  assert.ok(content.includes('"Student","Note"'));
  assert.ok(content.includes(`"'=HYPERLINK(""https://example.test"")","a,b ""quoted"""`));
});

test("Excel export creates an XLSX workbook with escaped worksheet values", async (t) => {
  const { downloads, anchor } = installBrowserStubs(t);
  await exportExcel("students.xlsx", [{ Student: "<Ada & Bob>", Status: "enrolled" }], "Student report");

  assert.equal(anchor.download, "students.xlsx");
  assert.equal(anchor.clicked, true);
  assert.equal(downloads[0].blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const bytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const sheet = worksheetXml(bytes);
  assert.ok(sheet.includes("&lt;Ada &amp; Bob&gt;"));
  assert.ok(sheet.includes("enrolled"));
});

test("print-to-PDF escapes report values and handles blocked popups", (t) => {
  const { popup } = installBrowserStubs(t);
  printPdf("Report <School>", [{ Student: "<script>alert(1)</script>" }]);
  assert.equal(popup.opener, null);
  assert.equal(popup.document.closed, true);
  assert.ok(popup.document.content.includes("<title>Report &lt;School&gt;</title>"));
  assert.ok(popup.document.content.includes("<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>"));

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { open: () => null }
  });
  assert.throws(() => printPdf("Report", [{ Student: "Ada" }]), /Allow pop-ups/);
});
