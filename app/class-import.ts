import JSZip from "jszip";
import { SUBJECTS } from "./subjects";

export type ClassImportPayload = {
  classes: Array<{ rowNumber: number; code: string; name: string; grade: string; homeroomUsername: string }>;
  students: Array<{ rowNumber: number; classCode: string; studentCode: string }>;
  subjectTeachers: Array<{ rowNumber: number; classCode: string; subject: string; teacherUsername: string }>;
};

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function columnIndex(reference: string) {
  let value = 0;
  for (const letter of reference.replace(/\d/g, "").toUpperCase()) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

function parseRows(xml: string, sharedStrings: string[]) {
  const rows: Array<{ number: number; cells: string[] }> = [];
  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const number = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1] || rows.length + 1);
    const cells: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const reference = cellMatch[1].match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!reference) continue;
      const type = cellMatch[1].match(/\bt="([^"]+)"/)?.[1] || "n";
      const body = cellMatch[2];
      const inline = [...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((part) => part[1]).join("");
      const raw = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? inline;
      cells[columnIndex(reference)] = (type === "s" ? sharedStrings[Number(raw)] || "" : decodeXml(raw || "")).trim();
    }
    rows.push({ number, cells });
  }
  return rows;
}

function dataRows(rows: ReturnType<typeof parseRows>, headers: string[]) {
  const normalizedHeaders = headers.map(normalize);
  const header = rows.find((row) => normalizedHeaders.every((name) => row.cells.some((cell) => normalize(cell || "") === name)));
  if (!header) throw new Error(`Không tìm thấy các cột: ${headers.join(", ")}`);
  const indexes = normalizedHeaders.map((name) => header.cells.findIndex((cell) => normalize(cell || "") === name));
  return rows.filter((row) => row.number > header.number).map((row) => ({
    rowNumber: row.number,
    values: indexes.map((index) => row.cells[index]?.trim() || ""),
  })).filter((row) => row.values.some(Boolean));
}

export async function parseClassWorkbook(buffer: ArrayBuffer): Promise<ClassImportPayload> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relationsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relationsXml) throw new Error("Tệp Excel không có cấu trúc trang tính hợp lệ");

  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sharedStrings = sharedXml ? [...sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((match) =>
    decodeXml([...match[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((part) => part[1]).join(""))) : [];
  const relationships = new Map<string, string>();
  for (const match of relationsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g)) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1];
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) relationships.set(id, target.replace(/^\//, ""));
  }
  const sheets = new Map<string, ReturnType<typeof parseRows>>();
  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/g)) {
    const name = decodeXml(match[1].match(/\bname="([^"]+)"/)?.[1] || "");
    const relationId = match[1].match(/(?:\w+:)?id="([^"]+)"/)?.[1];
    const target = relationId ? relationships.get(relationId) : undefined;
    if (!name || !target) continue;
    const path = target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await zip.file(path)?.async("string");
    if (xml) sheets.set(normalize(name), parseRows(xml, sharedStrings));
  }

  const classSheet = sheets.get(normalize("Lớp học"));
  const studentSheet = sheets.get(normalize("Học sinh vào lớp"));
  const teacherSheet = sheets.get(normalize("Phân công GVBM"));
  if (!classSheet || !studentSheet || !teacherSheet) throw new Error("Tệp phải có đủ 3 trang: Lớp học, Học sinh vào lớp và Phân công GVBM");

  const classes = dataRows(classSheet, ["Mã lớp", "Tên lớp", "Khối lớp", "Tài khoản GVCN"]).map(({ rowNumber, values }) => ({
    rowNumber, code: values[0].toUpperCase(), name: values[1], grade: values[2], homeroomUsername: values[3].toLowerCase(),
  }));
  const students = dataRows(studentSheet, ["Mã lớp", "Mã học sinh"]).map(({ rowNumber, values }) => ({
    rowNumber, classCode: values[0].toUpperCase(), studentCode: values[1],
  }));
  const subjectCatalog = new Set(SUBJECTS.map(normalize));
  const subjectTeachers = dataRows(teacherSheet, ["Mã lớp", "Môn học", "Tài khoản GVBM"])
    // The template keeps the valid-subject catalog beside the entry table. Some
    // spreadsheet writers omit empty A:C cells, so discard catalog-only rows.
    .filter(({ values }) => !(values[1] === "" && values[2] === "" && subjectCatalog.has(normalize(values[0]))))
    .map(({ rowNumber, values }) => ({
      rowNumber, classCode: values[0].toUpperCase(), subject: values[1], teacherUsername: values[2].toLowerCase(),
    }));
  if (!classes.length) throw new Error("Trang Lớp học chưa có dữ liệu");
  if (classes.length > 300 || students.length > 3000 || subjectTeachers.length > 3000) throw new Error("Tệp vượt giới hạn 300 lớp hoặc 3.000 dòng phân công");
  return { classes, students, subjectTeachers };
}
