export type ClassifiedPdf = {
  file: File
  kind: 'application' | 'bank_statement' | 'unknown'
}

const APPLICATION_RE =
  /\b(app(?:lication)?|mca[\s_-]?app|credit[\s_-]?app|merchant[\s_-]?app|signed[\s_-]?app)\b/i

const STATEMENT_RE =
  /\b(bank[\s_-]?statement|stmt|statement|checking|savings|account[\s_-]?summary|mtd|month[\s_-]?to[\s_-]?date)\b/i

const MONTH_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s_-]?\d{2,4}\b/i

function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] ?? path
}

export function classifyPdfFileName(name: string): ClassifiedPdf['kind'] {
  const base = basename(name)
  if (APPLICATION_RE.test(base)) return 'application'
  if (STATEMENT_RE.test(base) || MONTH_RE.test(base)) return 'bank_statement'
  return 'unknown'
}

export function classifyPdfFiles(files: File[]): {
  application: File | null
  bankStatements: File[]
  review: ClassifiedPdf[]
} {
  const review: ClassifiedPdf[] = files.map((file) => ({
    file,
    kind: classifyPdfFileName(file.name),
  }))

  let application = review.find((r) => r.kind === 'application')?.file ?? null
  const bankStatements = review.filter((r) => r.kind === 'bank_statement').map((r) => r.file)
  const unknowns = review.filter((r) => r.kind === 'unknown')

  if (!application && unknowns.length === 1) {
    application = unknowns[0].file
    unknowns.length = 0
  }

  for (const item of unknowns) {
    bankStatements.push(item.file)
  }

  return { application, bankStatements, review }
}
