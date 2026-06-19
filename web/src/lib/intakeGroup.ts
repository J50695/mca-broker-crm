import type { ClassifiedPdf } from '@/lib/intakeClassify'
import { fileIdentityKey } from '@/lib/intakeClassify'

export type IntakePackage = {
  id: string
  label: string
  items: ClassifiedPdf[]
}

const GENERIC_FOLDERS = new Set([
  'statements',
  'stmt',
  'stms',
  'docs',
  'documents',
  'bank',
  'banks',
  'applications',
  'apps',
  'files',
  'uploads',
  'pdf',
  'pdfs',
])

const APP_STEM_RE =
  /\b(app(?:lication)?|mca[\s_-]?app|credit[\s_-]?app|merchant[\s_-]?app|signed[\s_-]?app)\b/gi

function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] ?? path
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(APP_STEM_RE, '')
    .replace(/\b(bank[\s_-]?statement|stmt|statement|checking|savings)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

/** Derive a grouping key from ZIP folder path or filename patterns. */
export function extractGroupKey(sourcePath: string, fileName: string): string | null {
  const parts = sourcePath.split('/').filter(Boolean)
  const dirs = parts.length > 1 ? parts.slice(0, -1) : []

  for (const dir of dirs) {
    const lower = dir.toLowerCase()
    if (!GENERIC_FOLDERS.has(lower)) return dir
  }
  if (dirs.length > 0) return dirs[0]

  const base = basename(fileName)
  const numMatch = base.match(/^(\d{1,4})[_\-.]/)
  if (numMatch) return numMatch[1]

  const tokenMatch = base.match(/^(.+?)[_\-\.](?:app(?:lication)?|stmt|statement|bank)/i)
  if (tokenMatch?.[1]) return normalizeToken(tokenMatch[1])

  const stem = normalizeToken(base)
  if (stem.length >= 3) return stem

  return null
}

function resolvePackageItems(items: ClassifiedPdf[]): {
  application: ClassifiedPdf | null
  bankStatements: ClassifiedPdf[]
} {
  const applications = items.filter((i) => i.kind === 'application')
  const bankStatements = items.filter((i) => i.kind === 'bank_statement')
  const unknowns = items.filter((i) => i.kind === 'unknown')

  let application = applications[0] ?? null
  const extraApps = applications.slice(1)

  if (!application && unknowns.length === 1) {
    application = unknowns[0]
    unknowns.length = 0
  }

  for (const extra of extraApps) {
    unknowns.push(extra)
  }

  for (const item of unknowns) {
    bankStatements.push(item)
  }

  return { application, bankStatements }
}

export function packageLabelFromItems(items: ClassifiedPdf[]): string {
  const { application } = resolvePackageItems(items)
  if (application) {
    const stem = application.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
    return stem || 'Merchant package'
  }
  const first = items[0]
  if (first) {
    const key = extractGroupKey(first.sourcePath, first.file.name)
    if (key) return key
  }
  return 'Unnamed package'
}

export function isPackageValid(items: ClassifiedPdf[]): boolean {
  const { application, bankStatements } = resolvePackageItems(items)
  return application !== null && bankStatements.length >= 3
}

export function packageToIntakeFiles(items: ClassifiedPdf[]): {
  application: File
  bankStatements: File[]
} | null {
  const { application, bankStatements } = resolvePackageItems(items)
  if (!application || bankStatements.length < 3) return null
  return {
    application: application.file,
    bankStatements: bankStatements.map((s) => s.file),
  }
}

function scoreTokenMatch(statementStem: string, appStem: string): number {
  if (!statementStem || !appStem) return 0
  if (statementStem === appStem) return 100
  if (statementStem.startsWith(appStem) || appStem.startsWith(statementStem)) {
    return 60 + Math.min(appStem.length, statementStem.length)
  }
  if (statementStem.includes(appStem) || appStem.includes(statementStem)) {
    return 40 + Math.min(appStem.length, statementStem.length)
  }
  return 0
}

function createPackage(label: string, items: ClassifiedPdf[]): IntakePackage {
  return {
    id: crypto.randomUUID(),
    label,
    items,
  }
}

function splitMultiAppPackages(packages: IntakePackage[], unmatched: ClassifiedPdf[]): {
  packages: IntakePackage[]
  unmatched: ClassifiedPdf[]
} {
  const split: IntakePackage[] = []
  const extraUnmatched = [...unmatched]

  for (const pkg of packages) {
    const apps = pkg.items.filter((i) => i.kind === 'application')
    if (apps.length <= 1) {
      split.push({ ...pkg, label: packageLabelFromItems(pkg.items) })
      continue
    }

    const assigned = new Set<string>()
    for (const app of apps) {
      const stem = normalizeToken(app.file.name)
      const related = pkg.items.filter((i) => {
        if (fileIdentityKey(i.file) === fileIdentityKey(app.file)) return true
        if (i.kind === 'application') return false
        return scoreTokenMatch(normalizeToken(i.file.name), stem) >= 40
      })
      for (const item of related) assigned.add(fileIdentityKey(item.file))
      split.push(createPackage(app.file.name.replace(/\.[^.]+$/, ''), related))
    }

    for (const item of pkg.items) {
      if (!assigned.has(fileIdentityKey(item.file))) extraUnmatched.push(item)
    }
  }

  return { packages: split, unmatched: extraUnmatched }
}

function assignOrphansToPackages(packages: IntakePackage[], orphans: ClassifiedPdf[]): ClassifiedPdf[] {
  const unmatched: ClassifiedPdf[] = []

  for (const orphan of orphans) {
    const orphanStem = normalizeToken(orphan.file.name)
    let best: { pkg: IntakePackage; score: number } | null = null

    for (const pkg of packages) {
      const { application } = resolvePackageItems(pkg.items)
      if (!application) continue
      const score = scoreTokenMatch(orphanStem, normalizeToken(application.file.name))
      if (score >= 40 && (!best || score > best.score)) {
        best = { pkg, score }
      }
    }

    if (best) {
      best.pkg.items.push(orphan)
    } else {
      unmatched.push(orphan)
    }
  }

  return unmatched
}

/** Auto-group classified PDFs into merchant packages. */
export function autoGroupClassified(items: ClassifiedPdf[]): {
  packages: IntakePackage[]
  unmatched: ClassifiedPdf[]
} {
  if (!items.length) return { packages: [], unmatched: [] }

  const appCount = items.filter((i) => i.kind === 'application').length
  const buckets = new Map<string, ClassifiedPdf[]>()
  const orphans: ClassifiedPdf[] = []

  for (const item of items) {
    const key = extractGroupKey(item.sourcePath, item.file.name)
    if (key) {
      const list = buckets.get(key) ?? []
      list.push(item)
      buckets.set(key, list)
    } else {
      orphans.push(item)
    }
  }

  if (appCount <= 1 && buckets.size <= 1) {
    return {
      packages: [createPackage(packageLabelFromItems(items), [...items])],
      unmatched: [],
    }
  }

  const packages: IntakePackage[] = []
  for (const [key, bucketItems] of buckets) {
    packages.push(createPackage(key, bucketItems))
  }

  let unmatched = assignOrphansToPackages(packages, orphans)
  const split = splitMultiAppPackages(packages, unmatched)
  return split
}

/** Re-group when new PDFs are added (preserves dedupe; may reset manual layout). */
export function mergeIntoPackages(
  existing: IntakePackage[],
  unmatched: ClassifiedPdf[],
  newItems: ClassifiedPdf[],
): { packages: IntakePackage[]; unmatched: ClassifiedPdf[] } {
  const assigned = new Set([
    ...existing.flatMap((p) => p.items.map((i) => fileIdentityKey(i.file))),
    ...unmatched.map((i) => fileIdentityKey(i.file)),
  ])
  const fresh = newItems.filter((i) => !assigned.has(fileIdentityKey(i.file)))
  if (!fresh.length) return { packages: existing, unmatched }

  const allItems = [...existing.flatMap((p) => p.items), ...unmatched, ...fresh]
  return autoGroupClassified(allItems)
}

export function validPackages(packages: IntakePackage[]): IntakePackage[] {
  return packages.filter((p) => isPackageValid(p.items))
}

export function countPackageStats(items: ClassifiedPdf[]): {
  applications: number
  bankStatements: number
} {
  const { application, bankStatements } = resolvePackageItems(items)
  return {
    applications: application ? 1 : 0,
    bankStatements: bankStatements.length,
  }
}
