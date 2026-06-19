type PlaceholderPageProps = {
  title: string
  description: string
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="rounded-2xl border border-office-border bg-office-surface p-8 shadow-office">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-secondary">{description}</p>
      <p className="mt-4 inline-flex rounded-lg bg-office-raised px-3 py-1.5 text-xs font-medium text-ink-muted">
        Coming soon
      </p>
    </div>
  )
}
