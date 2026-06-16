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

function makePdf(lines: string[]) {
  const visibleLines = lines.slice(0, 58);
  const contentLines = ["BT"];
  let y = 760;

  visibleLines.forEach((line, index) => {
    const fontSize = index === 0 ? 18 : line === "" ? 10 : 10;
    const leading = index === 0 ? 26 : line === "" ? 12 : 15;

    contentLines.push(`/F1 ${fontSize} Tf`);
    contentLines.push(`1 0 0 1 54 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= leading;
  });

  if (lines.length > visibleLines.length) {
    contentLines.push("/F1 10 Tf");
    contentLines.push(
      `1 0 0 1 54 ${y} Tm (${escapePdfText(
        "Additional details are available inside Trimax."
      )}) Tj`
    );
  }

  contentLines.push("ET");
  const stream = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
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
  const lines = [
    title,
    subtitle ?? "",
    "",
    ...sections.flatMap((section) => [
      section.title.toUpperCase(),
      ...section.lines.flatMap((line) => wrapLine(line)),
      "",
    ]),
  ];
  const pdf = makePdf(lines);

  return {
    filename: `${safeFileName(filename)}.pdf`,
    content: Buffer.from(pdf, "utf8").toString("base64"),
  };
}
