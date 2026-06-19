import JSZip from 'jszip'

export type ExtractedPdf = {
  file: File
  /** Full path inside the ZIP, or bare filename for standalone PDFs */
  sourcePath: string
}

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

async function pdfsFromZip(file: File): Promise<ExtractedPdf[]> {
  const zip = await JSZip.loadAsync(file)
  const pdfs: ExtractedPdf[] = []

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !isPdfName(path) || isMacMetadata(path)) continue
    const blob = await entry.async('blob')
    const name = path.split('/').pop() ?? path
    pdfs.push({
      file: new File([blob], name, { type: 'application/pdf' }),
      sourcePath: path.replace(/\\/g, '/'),
    })
  }

  return pdfs
}

export async function extractPdfsFromUploads(files: FileList | File[]): Promise<ExtractedPdf[]> {
  const incoming = Array.from(files)
  const pdfs: ExtractedPdf[] = []

  for (const file of incoming) {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      pdfs.push({ file, sourcePath: file.name })
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
