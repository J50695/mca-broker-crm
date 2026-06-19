import JSZip from 'jszip'

function isPdfName(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf')
}

function isZipName(name: string): boolean {
  return name.toLowerCase().endsWith('.zip')
}

function isMacMetadata(path: string): boolean {
  const parts = path.split('/')
  return parts.some((p) => p === '__MACOSX' || p.startsWith('._'))
}

async function pdfsFromZip(file: File): Promise<File[]> {
  const zip = await JSZip.loadAsync(file)
  const pdfs: File[] = []

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !isPdfName(path) || isMacMetadata(path)) continue
    const blob = await entry.async('blob')
    const name = path.split('/').pop() ?? path
    pdfs.push(new File([blob], name, { type: 'application/pdf' }))
  }

  return pdfs
}

export async function extractPdfsFromUploads(files: FileList | File[]): Promise<File[]> {
  const incoming = Array.from(files)
  const pdfs: File[] = []

  for (const file of incoming) {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      pdfs.push(file)
      continue
    }
    if (isZipName(lower) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      const fromZip = await pdfsFromZip(file)
      if (!fromZip.length) {
        throw new Error(`No PDF files found inside ${file.name}`)
      }
      pdfs.push(...fromZip)
      continue
    }
    throw new Error(`Unsupported file type: ${file.name} (use PDF or ZIP)`)
  }

  return pdfs
}
