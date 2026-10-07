export interface SalarySheetRow {
  name: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  monthDays: number;
  daysWorked: number;
  salaryRate: number;
  earnedSalary: number;
  basicDa: number;
  hra: number;
  conveyance: number;
  grossPay: number;
  epf: number;
  esic: number;
  professionalTax: number;
  advanceDeduction: number;
  otherDeduction: number;
  totalDeductions: number;
  netPay: number;
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export function ageOn(dateOfBirth: string | null | undefined, onDate: Date): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = onDate.getFullYear() - dob.getFullYear();
  const m = onDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && onDate.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Builds the salary sheet in the same layout as the company Excel template
 * (header on rows 6–7, data from row 8, columns C–V, live formulas).
 */
export async function exportSalarySheet(
  rows: SalarySheetRow[],
  month: number,
  year: number,
  companyName = "PRINTADEL PRINTING & PACKAGING"
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  const monthEnd = new Date(year, month, 0);

  ws.getColumn("D").width = 35.3;
  ws.getColumn("G").width = 22.4;
  ["C", "E", "F", "H", "I"].forEach((c) => (ws.getColumn(c).width = 10));
  ["J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V"].forEach((c) => (ws.getColumn(c).width = 13));

  const thin = { style: "thin" as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const amountFmt = "#,##0";

  ws.mergeCells("C2:V2");
  ws.getCell("C2").value = companyName;
  ws.getCell("C2").font = { bold: true, size: 16 };
  ws.getCell("C2").alignment = { horizontal: "center" };

  ws.mergeCells("C3:V3");
  ws.getCell("C3").value = `SALARY SHEET FOR THE MONTH OF ${MONTHS[month - 1]} ${year}`;
  ws.getCell("C3").font = { bold: true, size: 13 };
  ws.getCell("C3").alignment = { horizontal: "center" };

  const header6: Record<string, string> = {
    C6: "SR. NO",
    D6: "NAME OF THE EMPLOYEE ",
    E6: "SEX",
    F6: "AGE",
    G6: "DATE OF ENTRY INTO SERVICE",
    H6: "MONTH DAYS",
    I6: "Total days Worked",
    J6: "SALARY RATE",
    M6: "H. R. A.",
    N6: "CONVEYANCE ALLOWANCE",
    O6: "Gross Wages Payable",
    P6: "DEDUCTIONS",
    V6: "Net Wages to be Paid",
  };
  const header7: Record<string, string> = {
    K7: "Monthly Salary",
    L7: "Basic + D. A.",
    P7: "EPF",
    Q7: "ESIC",
    R7: "PT",
    S7: "ADV ",
    T7: "OTHER",
    U7: "Total Deduction",
  };
  Object.entries({ ...header6, ...header7 }).forEach(([addr, text]) => (ws.getCell(addr).value = text));
  ["C", "D", "E", "F", "G", "H", "I", "J", "M", "N", "O", "V"].forEach((c) => ws.mergeCells(`${c}6:${c}7`));
  ws.mergeCells("P6:U6");

  ws.getRow(7).height = 67.5;
  for (const r of [6, 7]) {
    for (let col = 3; col <= 22; col++) {
      const cell = ws.getRow(r).getCell(col);
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = border;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    }
  }

  const firstRow = 8;
  rows.forEach((row, idx) => {
    const r = firstRow + idx;
    const excelRow = ws.getRow(r);
    excelRow.height = 18.75;
    const set = (col: string, value: any, numFmt?: string) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = value;
      if (numFmt) cell.numFmt = numFmt;
    };

    set("C", idx + 1);
    set("D", row.name.toUpperCase());
    set("E", row.gender === "M" || row.gender === "F" ? row.gender : "");
    set("F", ageOn(row.dateOfBirth, monthEnd) ?? "");
    set("G", row.joinDate ? new Date(row.joinDate) : "", "dd-mm-yyyy");
    set("H", row.monthDays);
    set("I", row.daysWorked);
    set("J", row.salaryRate, amountFmt);
    set("K", { formula: `ROUND(J${r}/H${r}*I${r},0)`, result: row.earnedSalary }, amountFmt);
    set("L", { formula: `K${r}*50%`, result: row.basicDa }, amountFmt);
    set("M", { formula: `K${r}*40%`, result: row.hra }, amountFmt);
    set("N", { formula: `K${r}*10%`, result: row.conveyance }, amountFmt);
    set("O", { formula: `N${r}+M${r}+L${r}`, result: row.grossPay }, amountFmt);
    set("P", { formula: `ROUND(L${r}*0.12,0)`, result: row.epf }, amountFmt);
    set("Q", { formula: `CEILING(O${r}*0.75/100,1)`, result: row.esic }, amountFmt);
    set("R", { formula: `IF(O${r}<7500,0,IF(O${r}<10000,175,IF(O${r}>9999,200)))`, result: row.professionalTax }, amountFmt);
    set("S", row.advanceDeduction, amountFmt);
    set("T", row.otherDeduction, amountFmt);
    set("U", { formula: `T${r}+S${r}+R${r}+Q${r}+P${r}`, result: row.totalDeductions }, amountFmt);
    set("V", { formula: `O${r}-U${r}`, result: row.netPay }, amountFmt);

    for (let col = 3; col <= 22; col++) {
      const cell = excelRow.getCell(col);
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: col === 4 ? "left" : "center", wrapText: col === 4 };
    }
    excelRow.getCell(22).font = { bold: true };
  });

  if (rows.length > 0) {
    const lastRow = firstRow + rows.length - 1;
    const totalRow = lastRow + 1;
    const sum = (key: keyof SalarySheetRow) => rows.reduce((s, row) => s + (Number(row[key]) || 0), 0);
    const totals: Array<[string, keyof SalarySheetRow]> = [
      ["J", "salaryRate"], ["K", "earnedSalary"], ["L", "basicDa"], ["M", "hra"], ["N", "conveyance"],
      ["O", "grossPay"], ["P", "epf"], ["Q", "esic"], ["R", "professionalTax"], ["S", "advanceDeduction"],
      ["T", "otherDeduction"], ["U", "totalDeductions"], ["V", "netPay"],
    ];
    ws.getCell(`D${totalRow}`).value = "TOTAL";
    totals.forEach(([col, key]) => {
      const cell = ws.getCell(`${col}${totalRow}`);
      cell.value = { formula: `SUM(${col}${firstRow}:${col}${lastRow})`, result: sum(key) };
      cell.numFmt = amountFmt;
    });
    for (let col = 3; col <= 22; col++) {
      const cell = ws.getRow(totalRow).getCell(col);
      cell.font = { bold: true };
      cell.border = border;
      cell.alignment = { horizontal: col === 4 ? "left" : "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Salary_Sheet_${MONTHS[month - 1]}_${year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
