import { useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { createMultipleIntakesFromUploads } from '@/lib/intake'
import {
  fileIdentityKey,
  mergeClassifiedWithNewPdfs,
  type ClassifiedPdf,
} from '@/lib/intakeClassify'
import {
  autoGroupClassified,
  countPackageStats,
  isPackageValid,
  mergeIntoPackages,
  packageToIntakeFiles,
  validPackages,
  type IntakePackage,
} from '@/lib/intakeGroup'
import { extractPdfsFromUploads } from '@/lib/zipIntake'

const ACCEPT = '.pdf,.zip,application/pdf,application/zip,application/x-zip-compressed'
const UNMATCHED_DROPPABLE = 'unmatched'

export default function IntakePage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [packages, setPackages] = useState<IntakePackage[]>([])
  const [unmatched, setUnmatched] = useState<ClassifiedPdf[]>([])
  const [loading, setLoading] = useState(false)
  const [unpacking, setUnpacking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string | null>(null)

  const totalFiles = packages.reduce((n, p) => n + p.items.length, 0) + unmatched.length
  const readyCount = validPackages(packages).length

  function clearReview() {
    setPackages([])
    setUnmatched([])
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleIncoming(files: FileList | null) {
    if (!files?.length) return
    setUnpacking(true)
    setError(null)
    try {
      const extracted = await extractPdfsFromUploads(files)
      if (!extracted.length) {
        setError('No PDF files found. Drop a ZIP of PDFs or individual PDF files.')
        return
      }
      const existingItems = [...packages.flatMap((p) => p.items), ...unmatched]
      const merged = mergeClassifiedWithNewPdfs(existingItems, extracted)
      if (merged.length === existingItems.length) {
        setError('These files are already in review.')
        return
      }
      const grouped = !existingItems.length
        ? autoGroupClassified(merged)
        : mergeIntoPackages(
            packages,
            unmatched,
            merged.filter((m) => !existingItems.some((e) => fileIdentityKey(e.file) === fileIdentityKey(m.file))),
          )
      setPackages(grouped.packages)
      setUnmatched(grouped.unmatched)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read files'
      setError(message)
    } finally {
      setUnpacking(false)
    }
  }

  function removeItem(key: string) {
    setUnmatched((prev) => prev.filter((i) => fileIdentityKey(i.file) !== key))
    setPackages((prev) =>
      prev.map((pkg) => ({
        ...pkg,
        items: pkg.items.filter((i) => fileIdentityKey(i.file) !== key),
      })),
    )
  }

  function updateItemKind(key: string, kind: ClassifiedPdf['kind']) {
    const patch = (items: ClassifiedPdf[]) =>
      items.map((i) => (fileIdentityKey(i.file) === key ? { ...i, kind } : i))

    setUnmatched((prev) => patch(prev))
    setPackages((prev) => prev.map((pkg) => ({ ...pkg, items: patch(pkg.items) })))
  }

  function onDragEnd(result: DropResult) {
    const { source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const lists = new Map<string, ClassifiedPdf[]>()
    lists.set(UNMATCHED_DROPPABLE, [...unmatched])
    for (const pkg of packages) lists.set(pkg.id, [...pkg.items])

    const from = lists.get(source.droppableId)
    if (!from) return
    const [moved] = from.splice(source.index, 1)
    if (!moved) return

    const to = lists.get(destination.droppableId) ?? []
    to.splice(destination.index, 0, moved)
    lists.set(source.droppableId, from)
    lists.set(destination.droppableId, to)

    setUnmatched(lists.get(UNMATCHED_DROPPABLE) ?? [])
    setPackages((prev) => prev.map((pkg) => ({ ...pkg, items: lists.get(pkg.id) ?? pkg.items })))
  }

  function addPackage() {
    setPackages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: `Deal ${prev.length + 1}`, items: [] },
    ])
  }

  function removePackage(id: string) {
    setPackages((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target?.items.length) setUnmatched((u) => [...u, ...target.items])
      return prev.filter((p) => p.id !== id)
    })
  }

  async function handleSubmit() {
    const ready = validPackages(packages)
    if (!ready.length) {
      setError('Need at least one package with 1 application and 3+ bank statements.')
      return
    }

    setLoading(true)
    setError(null)
    setStep(`Creating ${ready.length} lead${ready.length === 1 ? '' : 's'} and uploading files…`)

    try {
      const intakeFiles = ready.map((p) => packageToIntakeFiles(p.items)).filter((x): x is NonNullable<typeof x> => x !== null)
      await createMultipleIntakesFromUploads(intakeFiles)
      setStep(`Extracting data for ${intakeFiles.length} deal${intakeFiles.length === 1 ? '' : 's'}…`)
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Intake failed'
      setError(message)
      setStep(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto min-h-0 max-w-4xl flex-1 space-y-5 overflow-y-auto">
      <header className="rounded-2xl border border-office-border bg-office-surface px-6 py-5 shadow-office">
        <h1 className="text-xl font-semibold text-ink">New intake</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Drop a ZIP with many merchant packages — we unpack, group each application with its bank
          statements, and create one lead per package.
        </p>
      </header>

      <DropZone
        unpacking={unpacking}
        fileCount={totalFiles}
        packageCount={packages.length}
        inputRef={inputRef}
        onIncoming={handleIncoming}
        onBrowse={() => inputRef.current?.click()}
      />

      {totalFiles > 0 && (
        <section className="rounded-2xl border border-office-border bg-office-surface shadow-office overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-office-border px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Review merchant packages</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                {packages.length} package{packages.length === 1 ? '' : 's'} · {readyCount} ready to submit
                {unmatched.length > 0 && (
                  <span className="text-warning"> · {unmatched.length} unmatched file{unmatched.length === 1 ? '' : 's'}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={addPackage}
                className="text-xs font-medium text-accent hover:underline"
              >
                + Add package
              </button>
              <button
                type="button"
                onClick={clearReview}
                className="text-xs font-medium text-ink-muted hover:text-danger"
              >
                Clear all
              </button>
            </div>
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <div className="divide-y divide-office-border">
              {packages.map((pkg, pkgIndex) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  index={pkgIndex}
                  onReclassify={updateItemKind}
                  onRemoveFile={removeItem}
                  onRemovePackage={packages.length > 1 ? () => removePackage(pkg.id) : undefined}
                />
              ))}

              {unmatched.length > 0 && (
                <UnmatchedSection items={unmatched} onReclassify={updateItemKind} onRemoveFile={removeItem} />
              )}
            </div>
          </DragDropContext>
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
          disabled={loading || unpacking || readyCount === 0}
          onClick={handleSubmit}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {loading
            ? 'Processing…'
            : unpacking
              ? 'Unpacking…'
              : readyCount > 1
                ? `Submit ${readyCount} deals`
                : readyCount === 1
                  ? 'Submit intake'
                  : 'Submit intake'}
        </button>
        <Link to="/" className="text-sm font-medium text-ink-secondary hover:text-ink">
          Cancel
        </Link>
      </div>
    </div>
  )
}

function PackageCard({
  pkg,
  index,
  onReclassify,
  onRemoveFile,
  onRemovePackage,
}: {
  pkg: IntakePackage
  index: number
  onReclassify: (key: string, kind: ClassifiedPdf['kind']) => void
  onRemoveFile: (key: string) => void
  onRemovePackage?: () => void
}) {
  const stats = countPackageStats(pkg.items)
  const valid = isPackageValid(pkg.items)

  return (
    <div className={clsx('px-5 py-4', !valid && 'bg-warning-soft/20')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Deal {index + 1}: {pkg.label}
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            {stats.applications} application · {stats.bankStatements} bank statement
            {stats.bankStatements === 1 ? '' : 's'}
            {!valid && (
              <span className="text-warning">
                {' '}
                — need 1 app + 3 statements
              </span>
            )}
          </p>
        </div>
        {onRemovePackage && (
          <button type="button" onClick={onRemovePackage} className="text-xs text-ink-muted hover:text-danger">
            Remove package
          </button>
        )}
      </div>

      <Droppable droppableId={pkg.id}>
        {(provided, snapshot) => (
          <ul
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={clsx(
              'min-h-[2.5rem] rounded-lg border border-dashed divide-y divide-office-border overflow-hidden',
              snapshot.isDraggingOver ? 'border-accent bg-accent-soft/30' : 'border-office-border bg-office-raised/30',
              !pkg.items.length && 'py-4 text-center text-xs text-ink-muted',
            )}
          >
            {!pkg.items.length && <li className="px-3 py-2">Drop files here</li>}
            {pkg.items.map((item, i) => (
              <FileRow
                key={fileIdentityKey(item.file)}
                item={item}
                index={i}
                onReclassify={onReclassify}
                onRemove={onRemoveFile}
              />
            ))}
            {provided.placeholder}
          </ul>
        )}
      </Droppable>
    </div>
  )
}

function UnmatchedSection({
  items,
  onReclassify,
  onRemoveFile,
}: {
  items: ClassifiedPdf[]
  onReclassify: (key: string, kind: ClassifiedPdf['kind']) => void
  onRemoveFile: (key: string) => void
}) {
  return (
    <div className="px-5 py-4 bg-warning-soft/30">
      <h3 className="text-sm font-semibold text-warning">Unmatched files</h3>
      <p className="text-xs text-ink-muted mt-0.5 mb-3">
        Drag these into a merchant package above, or reclassify and submit valid packages only.
      </p>
      <Droppable droppableId={UNMATCHED_DROPPABLE}>
        {(provided, snapshot) => (
          <ul
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={clsx(
              'rounded-lg border border-dashed divide-y divide-office-border overflow-hidden',
              snapshot.isDraggingOver ? 'border-warning bg-warning-soft/40' : 'border-warning/40 bg-office-raised/30',
            )}
          >
            {items.map((item, i) => (
              <FileRow
                key={fileIdentityKey(item.file)}
                item={item}
                index={i}
                onReclassify={onReclassify}
                onRemove={onRemoveFile}
              />
            ))}
            {provided.placeholder}
          </ul>
        )}
      </Droppable>
    </div>
  )
}

function FileRow({
  item,
  index,
  onReclassify,
  onRemove,
}: {
  item: ClassifiedPdf
  index: number
  onReclassify: (key: string, kind: ClassifiedPdf['kind']) => void
  onRemove: (key: string) => void
}) {
  const key = fileIdentityKey(item.file)
  const folderHint = item.sourcePath.includes('/') ? item.sourcePath.replace(/\/[^/]+$/, '') : null

  return (
    <Draggable draggableId={key} index={index}>
      {(provided, snapshot) => (
        <li
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={clsx(
            'flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm',
            snapshot.isDragging && 'bg-accent-soft shadow-office-md',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-ink" title={item.sourcePath}>
            {item.file.name}
            {folderHint && <span className="ml-1 text-[10px] text-ink-muted">({folderHint})</span>}
          </span>
          <select
            value={item.kind}
            onChange={(e) => onReclassify(key, e.target.value as ClassifiedPdf['kind'])}
            className="rounded-md border border-office-border bg-office-raised px-2 py-1 text-xs"
          >
            <option value="application">Application</option>
            <option value="bank_statement">Bank statement</option>
            <option value="unknown">Other</option>
          </select>
          <button
            type="button"
            onClick={() => onRemove(key)}
            className="text-xs font-medium text-ink-muted hover:text-danger"
          >
            Remove
          </button>
        </li>
      )}
    </Draggable>
  )
}

function DropZone({
  unpacking,
  fileCount,
  packageCount,
  inputRef,
  onIncoming,
  onBrowse,
}: {
  unpacking: boolean
  fileCount: number
  packageCount: number
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
          One ZIP with many merchant folders, or PDFs — each package needs 1 application + 3+ bank statements
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
          ZIPs unpack automatically — merchants grouped by folder or filename prefix
          {fileCount > 0 &&
            ` · ${fileCount} file${fileCount === 1 ? '' : 's'} · ${packageCount} package${packageCount === 1 ? '' : 's'}`}
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
