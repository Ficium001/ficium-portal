/**
 * @page AdminAudit
 * @route /admin/audit
 * @access protected — audit:view
 * @description WORM-compliant admin audit log with CSV export.
 * @owner Ficium Engineering
 */

import { useState, useMemo, useCallback } from 'react'
import { ScrollText, Download, Search, X, Filter } from 'lucide-react'
import { useAdminAudit } from '../../hooks/useAdmin'
import type { AdminAuditEntry } from '../../types/admin'
import {
  ASectionHeader, ADataTable, ATr, ATd, AStatusBadge, ASkeletonRow,
  AEmptyState, AFilterPills, ABtn, AMonoRef,
} from '../../components/primitives'

const OUTCOME_OPTS = [
  { key: 'all',     label: 'All'     },
  { key: 'success', label: 'Success' },
  { key: 'failed',  label: 'Failed'  },
  { key: 'blocked', label: 'Blocked' },
  { key: 'rejected',label: 'Rejected'},
  { key: 'logged',  label: 'Logged'  },
]

const CAT_OPTS = [
  { key: 'all',          label: 'All'          },
  { key: 'user.',        label: 'User'         },
  { key: 'role.',        label: 'Role'         },
  { key: 'dual_control.',label: 'Dual ctrl'    },
  { key: 'session.',     label: 'Sessions'     },
  { key: 'security.',    label: 'Security'     },
]

function fmtDate(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-MU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

function exportCSV(entries: AdminAuditEntry[]) {
  const headers = ['Timestamp (UTC)', 'Category', 'Event', 'Actor', 'Actor role', 'Actor IP', 'Resource', 'Outcome', 'Note']
  const rows = entries.map(e => [
    new Date(e.created_at).toISOString(),
    e.action_category, e.event_label,
    e.actor_email ?? 'system', e.actor_role ?? '—', e.actor_ip ?? '—',
    e.resource_type ?? '—', e.outcome, e.outcome_note ?? '',
  ])
  const csv = [headers, ...rows].map(r => r.map(v => JSON.stringify(v)).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `ficium-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`
  a.click(); URL.revokeObjectURL(a.href)
}

export default function AdminAudit() {
  const [limit, setLimit]     = useState(100)
  const [outcome, setOutcome] = useState('all')
  const [cat, setCat]         = useState('all')
  const [search, setSearch]   = useState('')

  const { data: entries = [], isLoading } = useAdminAudit(limit,
    outcome === 'all' ? undefined : outcome,
    cat === 'all' ? undefined : cat,
  )

  const filtered = useMemo(() => {
    const lc = search.toLowerCase()
    return entries.filter(e =>
      !search || e.event_label.toLowerCase().includes(lc) ||
      (e.actor_email ?? '').toLowerCase().includes(lc) ||
      e.action_category.toLowerCase().includes(lc) ||
      (e.resource_label ?? '').toLowerCase().includes(lc)
    )
  }, [entries, search])

  const handleExport = useCallback(() => exportCSV(filtered), [filtered])

  return (
    <main className='p-6 lg:p-8 max-w-[1440px] mx-auto'>
      <ASectionHeader title='Admin Audit Log'
        subtitle={`${filtered.length} events · append-only · WORM compliant · 7-year retention`}
        actions={<ABtn variant='secondary' size='sm' icon={Download} onClick={handleExport}>Export CSV</ABtn>}
      />

      <div className='bg-white border border-ink/[0.08] rounded-xl px-5 py-3 flex items-center gap-3 mb-5'>
        <ScrollText className='w-4 h-4 text-muted/50' aria-hidden />
        <p className='text-[9px] text-muted/30 font-mono uppercase tracking-widest'>
          Append-only · No updates or deletes permitted · WORM enforced at database level · FSC Mauritius compliant
        </p>
      </div>

      <div className='flex flex-col lg:flex-row lg:items-center gap-3 mb-5'>
        <div className='flex items-center gap-2 flex-wrap'>
          <Filter className='w-3.5 h-3.5 text-muted/50' aria-hidden />
          <AFilterPills options={OUTCOME_OPTS} value={outcome} onChange={setOutcome} />
        </div>
        <div className='flex items-center gap-2 flex-wrap lg:ml-4'>
          <AFilterPills options={CAT_OPTS} value={cat} onChange={setCat} />
        </div>
        <div className='relative lg:ml-auto'>
          <Search className='w-3.5 h-3.5 text-muted/50 absolute left-3 top-1/2 -translate-y-1/2' aria-hidden />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder='Search event, actor, resource…'
            aria-label='Search audit events'
            className='bg-white border border-ink/[0.12] rounded-xl pl-8 pr-8 py-2 text-[11px] text-ink/80 outline-none focus:border-ficium font-mono w-56 transition-all' />
          {search && (
            <button onClick={() => setSearch('')} aria-label='Clear' className='absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-ink/80'>
              <X className='w-3 h-3' />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <ADataTable headers={['Timestamp', 'Category', 'Event', 'Actor', 'Actor IP', 'Resource', 'Outcome', 'Note']} caption='Loading…'>
          {Array.from({ length: 8 }).map((_, i) => <ASkeletonRow key={i} cols={8} />)}
        </ADataTable>
      ) : filtered.length === 0 ? (
        <AEmptyState icon={ScrollText} title='No events match' />
      ) : (
        <>
          <ADataTable headers={['Timestamp', 'Category', 'Event', 'Actor', 'Actor IP', 'Resource', 'Outcome', 'Note']}
            caption='Admin audit log'>
            {filtered.map(e => {
              const { date, time } = fmtDate(e.created_at)
              return (
                <ATr key={e.id}>
                  <ATd>
                    <div className='text-[11px] font-mono text-muted whitespace-nowrap'>{date}</div>
                    <div className='text-[10px] font-mono text-muted/50'>{time}</div>
                  </ATd>
                  <ATd className='text-[10px] font-mono text-muted/70'>{e.action_category}</ATd>
                  <ATd>
                    <div className='text-[11px] text-ink/80'>{e.event_label}</div>
                    {e.dual_control_id && <AMonoRef value={e.dual_control_id} />}
                  </ATd>
                  <ATd className='text-[11px] font-mono text-muted'>{e.actor_email ?? 'system'}</ATd>
                  <ATd className='text-[11px] font-mono text-muted/50'>{e.actor_ip ?? '—'}</ATd>
                  <ATd className='text-[11px] text-muted/70'>
                    {e.resource_type ?? '—'}
                    {e.resource_label && <div className='text-muted/50 text-[10px]'>{e.resource_label}</div>}
                  </ATd>
                  <ATd><AStatusBadge status={e.outcome} /></ATd>
                  <ATd className='max-w-[180px]'>
                    <span className='block truncate text-[11px] text-muted/70' title={e.outcome_note ?? ''}>
                      {e.outcome_note ?? '—'}
                    </span>
                  </ATd>
                </ATr>
              )
            })}
          </ADataTable>
          {entries.length >= limit && (
            <div className='flex justify-center mt-5'>
              <ABtn variant='secondary' size='sm' onClick={() => setLimit(l => l + 100)}>
                Load more (showing {limit})
              </ABtn>
            </div>
          )}
        </>
      )}
    </main>
  )
}
