import { useRef, useState, type DragEvent, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { createIntakeFromUploads } from '@/lib/intake'

const PDF_ACCEPT = '.pdf,application/pdf'

export default function IntakePage() {
  const navigate = useNavigate()
  const appInputRef = useRef<HTMLInputElement>(null)
  const stmtInputRef = useRef<HTMLInputElement>(null)

  const [application, setApplication] = useState<File | null>(null)
  const [bankStatements, setBankStatements] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string | null>(null)

  async function handleSubmit() {
    if (!application) {
      setError('Upload the signed application (PDF).')
      return
    }
    if (bankStatements.length < 3) {
      setError('Upload at least 3 months of bank statements (PDF).')
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
          Upload the application and bank statements — we create the lead automatically and extract business
          details, deposits, and DTI.
        </p>
      </header>

      <div className="space-y-4">
        <FileZone
          label="Application"
          hint="Signed MCA application (PDF)"
          required
          files={application ? [application] : []}
          multiple={false}
          inputRef={appInputRef}
          onFiles={(files) => setApplication(files[0] ?? null)}
          onBrowse={() => appInputRef.current?.click()}
        />

        <FileZone
          label="Bank statements"
          hint="3–4 most recent months (PDF)"
          required
          files={bankStatements}
          multiple
          inputRef={stmtInputRef}
          onFiles={(files) => setBankStatements(files)}
          onBrowse={() => stmtInputRef.current?.click()}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {step && (
        <p className="rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-accent">{step}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? 'Processing…' : 'Submit intake'}
        </button>
        <Link to="/" className="text-sm font-medium text-ink-secondary hover:text-ink">
          Cancel
        </Link>
      </div>
    </div>
  )
}

function FileZone({
  label,
  hint,
  required,
  files,
  multiple,
  inputRef,
  onFiles,
  onBrowse,
}: {
  label: string
  hint: string
  required?: boolean
  files: File[]
  multiple: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onFiles: (files: File[]) => void
  onBrowse: () => void
}) {
  const [dragging, setDragging] = useState(false)

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    )
    if (!pdfs.length) return
    if (multiple) {
      onFiles([...files, ...pdfs])
    } else {
      onFiles([pdfs[0]])
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  return (
    <section className="rounded-2xl border border-office-border bg-office-surface shadow-office overflow-hidden">
      <div className="border-b border-office-border px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </h2>
        <p className="text-xs text-ink-muted mt-0.5">{hint}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'm-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
          dragging ? 'border-accent bg-accent-soft/40' : 'border-office-border bg-office-raised/50',
        )}
      >
        <p className="text-sm text-ink-secondary">Drag PDFs here or</p>
        <button
          type="button"
          onClick={onBrowse}
          className="mt-2 text-sm font-semibold text-accent hover:underline"
        >
          browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={PDF_ACCEPT}
          multiple={multiple}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="border-t border-office-border divide-y divide-office-border">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="truncate text-ink">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (multiple) onFiles(files.filter((_, idx) => idx !== i))
                  else onFiles([])
                }}
                className="shrink-0 text-xs font-medium text-ink-muted hover:text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
