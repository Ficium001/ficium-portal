// =============================================================
// Ficium Portal — Member picker modal
//
// Searchable popup for selecting a specific institution member by
// name/email, instead of asking the caller to type a raw UUID.
// Returns the member's auth_user_id (their login identity) via
// onSelect — NOT institution.member.id — since that's what backend
// checks (e.g. committee_member.member_id, approval actor matching)
// actually compare against.
// =============================================================
import { useMemo, useState } from 'react'
import { Search, X, User as UserIcon } from 'lucide-react'
import { useInstitutionMembers } from '@/institution/hooks/useInstitutionMembers'
import type { InstitutionMember } from '@/institution/types/institution'

interface MemberPickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (member: InstitutionMember) => void
  title?: string
  /** auth_user_ids to hide from the results (e.g. people already on the committee) */
  excludeAuthUserIds?: string[]
}

export function MemberPickerModal({
  open,
  onClose,
  onSelect,
  title = 'Select a person',
  excludeAuthUserIds = [],
}: MemberPickerModalProps) {
  const [query, setQuery] = useState('')
  const { data: members = [], isLoading } = useInstitutionMembers(false) // active only

  const excluded = useMemo(() => new Set(excludeAuthUserIds), [excludeAuthUserIds])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members
      .filter((m) => !excluded.has(m.auth_user_id))
      .filter((m) => {
        if (!q) return true
        return (
          (m.full_name ?? '').toLowerCase().includes(q) ||
          (m.email ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? ''))
  }, [members, query, excluded])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-ink/50 backdrop-blur-xs flex items-start justify-center z-50 p-4 pt-24"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="member-picker-title"
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink/[0.07]">
          <h2 id="member-picker-title" className="font-semibold text-ink text-[15px]">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink p-1 rounded-lg hover:bg-ink/[0.04]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-ink/[0.1] text-[13px] outline-none focus:border-ficium/40"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2 mt-1">
          {isLoading && (
            <p className="px-3 py-6 text-center text-[13px] text-muted">Loading members…</p>
          )}

          {!isLoading && results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted">
              {query ? 'No matching members.' : 'No active members found.'}
            </p>
          )}

          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onSelect(m)
                setQuery('')
                onClose()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-ink/[0.04] transition-colors"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ficium/8 text-ficium">
                <UserIcon size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink truncate">
                  {m.full_name || m.email || m.auth_user_id}
                </span>
                {m.full_name && m.email && (
                  <span className="block text-[11px] text-muted truncate">{m.email}</span>
                )}
              </span>
              {m.member_role && (
                <span className="shrink-0 rounded bg-ink/4 px-1.5 py-0.5 text-[10px] text-muted uppercase tracking-wide">
                  {m.member_role}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
