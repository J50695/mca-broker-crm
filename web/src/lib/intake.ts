import type { DocumentType } from '@/lib/types'
import { supabase, STORAGE_BUCKET } from '@/lib/supabase'

export type IntakeFiles = {
  application: File
  bankStatements: File[]
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function uploadDocument(
  dealId: string,
  merchantId: string,
  file: File,
  docType: DocumentType,
): Promise<void> {
  const path = `${dealId}/${docType}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`

  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) throw new Error(uploadError.message)

  const { error: docError } = await supabase.from('documents').insert({
    deal_id: dealId,
    merchant_id: merchantId,
    doc_type: docType,
    file_path: path,
    file_name: file.name,
    status: 'processing',
  })

  if (docError) throw new Error(docError.message)
}

async function resolveAssignedAgentId(userId: string | undefined): Promise<string | null> {
  if (!userId) return null
  const { data: agent } = await supabase.from('agents').select('id').eq('id', userId).maybeSingle()
  return agent?.id ?? null
}

export async function createIntakeFromUploads(files: IntakeFiles): Promise<string> {
  const { data: auth } = await supabase.auth.getUser()
  const assignedAgentId = await resolveAssignedAgentId(auth.user?.id)

  const placeholderName = files.application.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()

  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .insert({
      business_name: placeholderName || 'New intake',
      source: 'document_upload',
      assigned_agent_id: assignedAgentId,
    })
    .select('id')
    .single()

  if (merchantError || !merchant) {
    throw new Error(merchantError?.message ?? 'Could not create merchant')
  }

  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .insert({
      merchant_id: merchant.id,
      stage: 'new_intake',
      assigned_agent_id: assignedAgentId,
      qualification_status: 'pending',
      statement_months_provided: files.bankStatements.length,
    })
    .select('id')
    .single()

  if (dealError || !deal) {
    throw new Error(dealError?.message ?? 'Could not create deal')
  }

  await uploadDocument(deal.id, merchant.id, files.application, 'application')

  for (const statement of files.bankStatements) {
    await uploadDocument(deal.id, merchant.id, statement, 'bank_statement')
  }

  const { error: invokeError } = await supabase.functions.invoke('process-intake', {
    body: { deal_id: deal.id },
  })

  if (invokeError) {
    console.warn('process-intake invoke:', invokeError.message)
  }

  return deal.id
}
