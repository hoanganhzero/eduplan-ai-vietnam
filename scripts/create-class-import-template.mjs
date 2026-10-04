import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputPath = new URL("../public/Mau-tao-lop-hoc-EduPlan.xlsx", import.meta.url);
const previewPath = new URL("../.tmp/class-import-template.png", import.meta.url);
const font = "Arial";
const subjects = [
  "Toán", "Ngữ văn", "Tiếng Anh", "Ngoại ngữ khác", "Vật lí", "Hóa học", "Sinh học", "Lịch sử", "Địa lí",
  "Giáo dục kinh tế và pháp luật", "Tin học", "Công nghệ", "Giáo dục thể chất", "Giáo dục quốc phòng và an ninh",
  "Âm nhạc", "Mĩ thuật", "Hoạt động trải nghiệm, hướng nghiệp", "Nội dung giáo dục của địa phương",
];

const workbook = Workbook.create();

function createSheet(name, title, instruction, headers, widths) {
  const sheet = workbook.worksheets.add(name);
  const lastColumn = String.fromCharCode(64 + headers.length);
  sheet.showGridLines = false;
  sheet.tabColor = "#155EEF";
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: "#155EEF",
    font: { name: font, size: 16, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${lastColumn}1`).format.rowHeight = 34;
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange("A2").values = [[instruction]];
  sheet.getRange(`A2:${lastColumn}2`).format = {
    fill: "#E8F0FF",
    font: { name: font, size: 10, color: "#24418B" },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${lastColumn}2`).format.rowHeight = 34;
  sheet.getRange(`A4:${lastColumn}4`).values = [headers];
  sheet.getRange(`A4:${lastColumn}4`).format = {
    fill: "#163A6B",
    font: { name: font, size: 11, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#AFC4E6" },
  };
  sheet.getRange(`A4:${lastColumn}4`).format.rowHeight = 34;
  sheet.getRange(`A5:${lastColumn}5`).values = [headers.map(() => null)];
  sheet.getRange(`A5:${lastColumn}5`).format = {
    font: { name: font, size: 11, color: "#17233D" },
    borders: { preset: "all", style: "thin", color: "#D8E1EF" },
    verticalAlignment: "center",
  };
  sheet.getRange(`A5:${lastColumn}5`).format.rowHeight = 24;
  headers.forEach((_, index) => {
    const column = String.fromCharCode(65 + index);
    sheet.getRange(`${column}1:${column}5`).format.columnWidth = widths[index];
  });
  const table = sheet.tables.add(`A4:${lastColumn}5`, true, `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^a-zA-Z0-9]/g, "")}Table`);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  table.showBandedRows = true;
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

const classes = createSheet(
  "Lớp học",
  "DANH SÁCH LỚP HỌC · EDUPLAN AI",
  "Mỗi mã lớp chỉ xuất hiện một lần. Tài khoản GVCN phải là tên đăng nhập giáo viên đang hoạt động trên EduPlan AI.",
  ["Mã lớp", "Tên lớp", "Khối lớp", "Tài khoản GVCN"],
  [18, 24, 14, 25],
);
classes.getRange("A5:A504").format.numberFormat = "@";
classes.getRange("D5:D504").format.numberFormat = "@";
classes.getRange("C5:C504").dataValidation = { rule: { type: "list", values: ["10", "11", "12"] } };

const students = createSheet(
  "Học sinh vào lớp",
  "GÁN HỌC SINH VÀO LỚP",
  "Mỗi dòng là một học sinh. Mã lớp phải có trong trang Lớp học; mã học sinh phải tồn tại trong danh sách tài khoản.",
  ["Mã lớp", "Mã học sinh"],
  [20, 24],
);
students.getRange("A5:B1004").format.numberFormat = "@";

const teachers = createSheet(
  "Phân công GVBM",
  "PHÂN CÔNG GIÁO VIÊN BỘ MÔN",
  "Mỗi dòng là một phân công môn–lớp. Tài khoản GVBM phải là tên đăng nhập giáo viên đang hoạt động.",
  ["Mã lớp", "Môn học", "Tài khoản GVBM"],
  [20, 38, 25],
);
teachers.getRange("A5:A1004").format.numberFormat = "@";
teachers.getRange("C5:C1004").format.numberFormat = "@";
teachers.getRange("E1:F1").values = [["DANH MỤC", "MÔN HỌC HỢP LỆ"]];
teachers.getRange("E1:F1").format = { fill: "#E8F0FF", font: { name: font, bold: true, color: "#24418B" } };
teachers.getRange(`F2:F${subjects.length + 1}`).values = subjects.map((subject) => [subject]);
teachers.getRange(`F2:F${subjects.length + 1}`).format.font = { name: font, size: 9, color: "#536B85" };
teachers.getRange("E1:E20").format.columnWidth = 13;
teachers.getRange("F1:F20").format.columnWidth = 42;
teachers.getRange("B5:B1004").dataValidation = { rule: { type: "list", formula1: `'Phân công GVBM'!$F$2:$F$${subjects.length + 1}` } };

workbook.recalculate();
await fs.mkdir(new URL("../public/", import.meta.url), { recursive: true });
await fs.mkdir(new URL("../.tmp/", import.meta.url), { recursive: true });
const preview = await workbook.render({ sheetName: "Lớp học", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath.pathname);
const inspection = await workbook.inspect({ kind: "workbook,sheet,table,region", maxChars: 9000, tableMaxRows: 8, tableMaxCols: 8 });
console.log(inspection.ndjson);
