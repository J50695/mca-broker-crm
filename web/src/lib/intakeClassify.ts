import type { ExtractedPdf } from '@/lib/zipIntake'

export type ClassifiedPdf = {
  file: File
  sourcePath: string
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

export function fileIdentityKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function classifyExtractedPdfs(extracted: ExtractedPdf[]): ClassifiedPdf[] {
  return extracted.map(({ file, sourcePath }) => ({
    file,
    sourcePath,
    kind: classifyPdfFileName(file.name),
  }))
}

/** Append newly extracted PDFs to an existing review list (deduped, preserves prior rows). */
export function mergeClassifiedWithNewPdfs(existing: ClassifiedPdf[], newPdfs: ExtractedPdf[]): ClassifiedPdf[] {
  const existingKeys = new Set(existing.map((r) => fileIdentityKey(r.file)))
  const uniqueNew = newPdfs.filter((f) => !existingKeys.has(fileIdentityKey(f.file)))
  if (!uniqueNew.length) return existing

  return [...existing, ...classifyExtractedPdfs(uniqueNew)]
}

export function resolveIntakeFromReview(review: ClassifiedPdf[]): {
  application: File | null
  bankStatements: File[]
} {
  const application = review.find((r) => r.kind === 'application')?.file ?? null
  const bankStatements = review.filter((r) => r.kind === 'bank_statement').map((r) => r.file)
  return { application, bankStatements }
}

export function classifyPdfFiles(files: File[]): {
  application: File | null
  bankStatements: File[]
  review: ClassifiedPdf[]
} {
  const extracted = files.map((file) => ({ file, sourcePath: file.name }))
  const review = classifyExtractedPdfs(extracted)

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
