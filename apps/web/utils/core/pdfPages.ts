export function pageSelection(value: string, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error("Choose a PDF with 1 to 200 pages.");
  if (!value.trim()) return Array.from({ length: count }, (_, index) => index);
  const result: number[] = [];
  for (const token of value.split(",")) {
    const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error("Use page numbers and ranges, such as 1-3, 5, 8.");
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > count)
      throw new Error(
        `Page numbers must be between 1 and ${count}, with ranges in ascending order.`,
      );
    if (result.length + end - start + 1 > 200)
      throw new Error("Select no more than 200 pages.");
    for (let page = start; page <= end; page++) result.push(page - 1);
  }
  return result;
}
