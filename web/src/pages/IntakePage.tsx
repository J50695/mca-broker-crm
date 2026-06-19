import { useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { createIntakeFromUploads } from '@/lib/intake'
import {
  mergeClassifiedWithNewPdfs,
  resolveIntakeFromReview,
  type ClassifiedPdf,
} from '@/lib/intakeClassify'
import { extractPdfsFromUploads } from '@/lib/zipIntake'

const ACCEPT = '.pdf,.zip,application/pdf,application/zip,application/x-zip-compressed'

export default function IntakePage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [review, setReview] = useState<ClassifiedPdf[]>([])
  const [application, setApplication] = useState<File | null>(null)
  const [bankStatements, setBankStatements] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [unpacking, setUnpacking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string | null>(null)

  function syncFromReview(items: ClassifiedPdf[]) {
    const resolved = resolveIntakeFromReview(items)
    setApplication(resolved.application)
    setBankStatements(resolved.bankStatements)
  }

  function applyClassification(pdfs: File[]) {
    setReview((prev) => {
      const merged = mergeClassifiedWithNewPdfs(prev, pdfs)
      const resolved = resolveIntakeFromReview(merged)
      setApplication(resolved.application)
      setBankStatements(resolved.bankStatements)
      return merged
    })
    setError(null)
  }

  function clearReview() {
    setReview([])
    setApplication(null)
    setBankStatements([])
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleIncoming(files: FileList | null) {
    if (!files?.length) return
    setUnpacking(true)
    setError(null)
    try {
      const pdfs = await extractPdfsFromUploads(files)
      if (!pdfs.length) {
        setError('No PDF files found. Drop a ZIP of PDFs or individual PDF files.')
        return
      }
      applyClassification(pdfs)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read files'
      setError(message)
    } finally {
      setUnpacking(false)
    }
  }

  function reclassify(index: number, kind: ClassifiedPdf['kind']) {
    const next = review.map((item, i) => (i === index ? { ...item, kind } : item))
    setReview(next)
    syncFromReview(next)
  }

  function removeFile(index: number) {
    const next = review.filter((_, i) => i !== index)
    setReview(next)
    syncFromReview(next)
  }

  async function handleSubmit() {
    if (!application) {
      setError('Need 1 application PDF — rename or reclassify a file below.')
      return
    }
    if (bankStatements.length < 3) {
      setError(`Need at least 3 bank statement PDFs (have ${bankStatements.length}).`)
      return
    }

    setLoading(true)
    setError(null)
    setStep('Creating lead and uploading files…')

    try {
      const dealId = await createIntakeFromUploads({ application, bankStatements })
      setStep('Extracting data from documents…')
      navigate(`/clients/${dealId}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Intake failed'
      setError(message)
      setStep(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="rounded-2xl border border-office-border bg-office-surface px-6 py-5 shadow-office">
        <h1 className="text-xl font-semibold text-ink">New intake</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Drop a ZIP or PDFs — we unpack, classify application vs bank statements, create the lead, and extract
          business details, deposits, and DTI.
        </p>
      </header>

      <DropZone
        unpacking={unpacking}
        fileCount={review.length}
        inputRef={inputRef}
        onIncoming={handleIncoming}
        onBrowse={() => inputRef.current?.click()}
      />

      {review.length > 0 && (
        <section className="rounded-2xl border border-office-border bg-office-surface shadow-office overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-office-border px-5 py-3">
            <div>
            <h2 className="text-sm font-semibold text-ink">Review classified files</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {application ? '1 application' : '0 applications'} · {bankStatements.length} bank statement
              {bankStatements.length === 1 ? '' : 's'}
              {bankStatements.length < 3 && (
                <span className="text-danger"> — need at least 3 statements</span>
              )}
            </p>
            </div>
            <button
              type="button"
              onClick={clearReview}
              className="text-xs font-medium text-ink-muted hover:text-danger"
            >
              Clear all
            </button>
          </div>
          <ul className="divide-y divide-office-border">
            {review.map((item, i) => (
              <li key={`${item.file.name}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{item.file.name}</span>
                <select
                  value={item.kind}
                  onChange={(e) => reclassify(i, e.target.value as ClassifiedPdf['kind'])}
                  className="rounded-md border border-office-border bg-office-raised px-2 py-1 text-xs"
                >
                  <option value="application">Application</option>
                  <option value="bank_statement">Bank statement</option>
                  <option value="unknown">Other</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-xs font-medium text-ink-muted hover:text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {step && (
        <p className="rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-accent">{step}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={loading || unpacking || review.length === 0}
          onClick={handleSubmit}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? 'Processing…' : unpacking ? 'Unpacking…' : 'Submit intake'}
        </button>
        <Link to="/" className="text-sm font-medium text-ink-secondary hover:text-ink">
          Cancel
        </Link>
      </div>
    </div>
  )
}

function DropZone({
  unpacking,
  fileCount,
  inputRef,
  onIncoming,
  onBrowse,
}: {
  unpacking: boolean
  fileCount: number
  inputRef: React.RefObject<HTMLInputElement | null>
  onIncoming: (files: FileList | null) => void
  onBrowse: () => void
}) {
  const [dragging, setDragging] = useState(false)

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    onIncoming(e.dataTransfer.files)
  }

  return (
    <section className="rounded-2xl border border-office-border bg-office-surface shadow-office overflow-hidden">
      <div className="border-b border-office-border px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">
          Documents <span className="text-danger">*</span>
        </h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Signed application + 3–4 recent bank statements (PDF or ZIP)
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'm-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition',
          dragging ? 'border-accent bg-accent-soft/40' : 'border-office-border bg-office-raised/50',
        )}
      >
        <p className="text-sm font-medium text-ink">Drop multiple PDFs or ZIPs here</p>
        <p className="mt-1 text-xs text-ink-muted">
          Select or drop as many files as you need — ZIPs unpack automatically
          {fileCount > 0 && ` · ${fileCount} file${fileCount === 1 ? '' : 's'} in review`}
        </p>
        <button
          type="button"
          onClick={onBrowse}
          disabled={unpacking}
          className="mt-3 text-sm font-semibold text-accent hover:underline disabled:opacity-60"
        >
          {unpacking ? 'Unpacking…' : 'browse files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            onIncoming(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </section>
  )
}
