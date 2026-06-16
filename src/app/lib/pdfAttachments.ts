export type EmailAttachment = {
  filename: string;
  content: string;
};

type PdfSection = {
  title: string;
  lines: string[];
};

function cleanPdfText(value: string) {
  return value
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return cleanPdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(value: string, maxLength = 86) {
  const words = cleanPdfText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = nextLine;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function safeFileName(value: string) {
  const safeValue = cleanPdfText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeValue || "trimax-document";
}

function moneyFromLine(value: string) {
  const match = cleanPdfText(value).match(/(\$[\d,]+(?:\.\d{2})?)\s*$/);

  return match?.[1] ?? "";
}

function lineWithoutTrailingMoney(value: string) {
  return cleanPdfText(value).replace(/\s*-\s*\$[\d,]+(?:\.\d{2})?\s*$/, "");
}

function addText({
  commands,
  x,
  y,
  text,
  size = 10,
  font = "F1",
  color = "0.08 0.14 0.22",
}: {
  commands: string[];
  x: number;
  y: number;
  text: string;
  size?: number;
  font?: "F1" | "F2";
  color?: string;
}) {
  commands.push("BT");
  commands.push(`${color} rg`);
  commands.push(`/${font} ${size} Tf`);
  commands.push(`1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj`);
  commands.push("ET");
}

function addWrappedText({
  commands,
  x,
  y,
  text,
  maxLength,
  size = 10,
  font = "F1",
  color,
  leading = 14,
}: {
  commands: string[];
  x: number;
  y: number;
  text: string;
  maxLength: number;
  size?: number;
  font?: "F1" | "F2";
  color?: string;
  leading?: number;
}) {
  let nextY = y;

  wrapLine(text, maxLength).forEach((line) => {
    addText({ commands, x, y: nextY, text: line, size, font, color });
    nextY -= leading;
  });

  return nextY;
}

function drawBox(commands: string[], x: number, y: number, w: number, h: number) {
  commands.push("q");
  commands.push("0.94 0.97 1 rg");
  commands.push("0.80 0.86 0.93 RG");
  commands.push(`${x} ${y} ${w} ${h} re B`);
  commands.push("Q");
}

function makePdf({
  title,
  subtitle,
  sections,
}: {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
}) {
  const commands: string[] = [];
  const customer = sections.find((section) => section.title === "Customer");
  const dates = sections.find((section) => section.title === "Dates");
  const lineItems = sections.find((section) => section.title === "Line Items");
  const totals =
    sections.find((section) => section.title === "Totals") ??
    sections.find((section) => section.title === "Total") ??
    sections.find((section) => section.title === "Payment Reminder");
  const otherSections = sections.filter(
    (section) =>
      !["Customer", "Dates", "Line Items", "Totals", "Total"].includes(
        section.title
      )
  );

  addText({
    commands,
    x: 54,
    y: 742,
    text: subtitle ?? "Trimax",
    size: 16,
    font: "F2",
  });
  addText({
    commands,
    x: 54,
    y: 722,
    text: "1011 90th St SW #B",
    size: 9,
    color: "0.35 0.43 0.52",
  });
  addText({
    commands,
    x: 54,
    y: 708,
    text: "Everett, WA 98204",
    size: 9,
    color: "0.35 0.43 0.52",
  });
  addText({
    commands,
    x: 54,
    y: 694,
    text: "(425) 350-4898",
    size: 9,
    color: "0.35 0.43 0.52",
  });

  addText({
    commands,
    x: 410,
    y: 735,
    text: title,
    size: 22,
    font: "F2",
  });
  commands.push("q");
  commands.push("0.88 0.65 0.16 RG");
  commands.push("54 670 504 0 re S");
  commands.push("Q");

  drawBox(commands, 54, 560, 260, 82);
  addText({
    commands,
    x: 72,
    y: 620,
    text: "BILLED TO",
    size: 8,
    font: "F2",
    color: "0.52 0.38 0.10",
  });
  let customerY = 600;
  (customer?.lines ?? ["Customer"]).slice(0, 5).forEach((line, index) => {
    customerY = addWrappedText({
      commands,
      x: 72,
      y: customerY,
      text: line,
      maxLength: 38,
      size: index === 0 ? 11 : 9,
      font: index === 0 ? "F2" : "F1",
      leading: 13,
    });
  });

  drawBox(commands, 334, 560, 224, 82);
  addText({
    commands,
    x: 352,
    y: 620,
    text: "DOCUMENT DETAILS",
    size: 8,
    font: "F2",
    color: "0.52 0.38 0.10",
  });
  let dateY = 600;
  (dates?.lines ?? []).slice(0, 4).forEach((line) => {
    dateY = addWrappedText({
      commands,
      x: 352,
      y: dateY,
      text: line,
      maxLength: 31,
      size: 9,
      leading: 13,
    });
  });

  let tableY = 520;
  addText({
    commands,
    x: 54,
    y: tableY,
    text: "Description",
    size: 9,
    font: "F2",
    color: "0.52 0.38 0.10",
  });
  addText({
    commands,
    x: 488,
    y: tableY,
    text: "Line Total",
    size: 9,
    font: "F2",
    color: "0.52 0.38 0.10",
  });
  commands.push("q");
  commands.push("0.88 0.65 0.16 RG");
  commands.push("54 505 504 0 re S");
  commands.push("Q");
  tableY = 482;

  (lineItems?.lines ?? ["Line items are available in Trimax."])
    .slice(0, 12)
    .forEach((line) => {
      const amount = moneyFromLine(line);
      const description = lineWithoutTrailingMoney(line);

      tableY = addWrappedText({
        commands,
        x: 54,
        y: tableY,
        text: description,
        maxLength: 68,
        size: 9,
        leading: 12,
      });
      if (amount) {
        addText({
          commands,
          x: 495,
          y: tableY + 12,
          text: amount,
          size: 9,
          font: "F2",
        });
      }
      commands.push("q");
      commands.push("0.89 0.92 0.96 RG");
      commands.push(`54 ${tableY + 2} 504 0 re S`);
      commands.push("Q");
      tableY -= 10;
    });

  const totalsY = Math.min(tableY - 18, 260);
  drawBox(commands, 342, totalsY - 12, 216, 90);
  addText({
    commands,
    x: 360,
    y: totalsY + 55,
    text: totals?.title.toUpperCase() ?? "TOTALS",
    size: 8,
    font: "F2",
    color: "0.52 0.38 0.10",
  });
  let totalLineY = totalsY + 34;
  (totals?.lines ?? []).slice(0, 5).forEach((line, index) => {
    totalLineY = addWrappedText({
      commands,
      x: 360,
      y: totalLineY,
      text: line,
      maxLength: 28,
      size: index === (totals?.lines.length ?? 1) - 1 ? 11 : 9,
      font: index === (totals?.lines.length ?? 1) - 1 ? "F2" : "F1",
      leading: 14,
    });
  });

  let notesY = totalsY - 45;
  otherSections.slice(0, 2).forEach((section) => {
    addText({
      commands,
      x: 54,
      y: notesY,
      text: section.title.toUpperCase(),
      size: 8,
      font: "F2",
      color: "0.52 0.38 0.10",
    });
    notesY -= 16;
    section.lines.slice(0, 6).forEach((line) => {
      notesY = addWrappedText({
        commands,
        x: 54,
        y: notesY,
        text: line,
        maxLength: 64,
        size: 9,
        color: "0.30 0.37 0.45",
        leading: 12,
      });
    });
    notesY -= 12;
  });

  commands.push("q");
  commands.push("0.95 0.97 0.99 rg");
  commands.push("54 48 504 32 re f");
  commands.push("Q");
  addText({
    commands,
    x: 254,
    y: 60,
    text: "Powered by Trimax",
    size: 9,
    color: "0.55 0.62 0.70",
  });

  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

export function createPdfAttachment({
  filename,
  title,
  subtitle,
  sections,
}: {
  filename: string;
  title: string;
  subtitle?: string;
  sections: PdfSection[];
}): EmailAttachment {
  const pdf = makePdf({ title, subtitle, sections });

  return {
    filename: `${safeFileName(filename)}.pdf`,
    content: Buffer.from(pdf, "utf8").toString("base64"),
  };
}
