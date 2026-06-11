/**
 * @page AdminGroups
 * @route /admin/groups
 * @access protected — admin:groups
 * @description
 *   Group management — parent list + child detail panel.
 *   Groups define module access for both admin and institution users.
 *   System groups are read-only. Custom groups go through dual-control
 *   for create/edit/delete.
 *
 *   Layout: two-column when a group is selected (list | detail).
 *   Module Security tab: full MODULE_CATALOGUE grouped by category,
 *   checkbox per module — same pattern as Quantum user-group screen.
 *
 * @owner Ficium Engineering
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Plus, Shield, Users, ChevronRight, Lock,
  LayoutDashboard, Store, FileText, Clock, Package,
  Webhook, ScrollText, Settings, GitMerge, Radio, MonitorDot, X,
  CheckSquare, Square,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import adminDb from '../../lib/adminSupabase'
import {
  MODULE_CATALOGUE, INSTITUTION_MODULE_LIST, ADMIN_MODULE_LIST,
  type PortalModule,
} from '../../../shared/lib/modules'
import type { UserGroup, CreateGroupPayload } from '../../../shared/lib/groups'
import {
  ASectionHeader, ABtn, AAlert, AModal, AFormField, aInputCls,
  ASkeletonRow, AEmptyState,
} from '../../components/primitives'
import { useAdminMe, useCreateAdminGroup, useUpdateGroupModules } from '../../hooks/useAdmin'

// ─────────────────────────────────────────────────────────────────────────────
// Icon resolver — keeps lucide out of the module catalogue
// ─────────────────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Store, FileText, Clock, Package,
  Webhook, ScrollText, Settings, GitMerge, Radio, MonitorDot,
  Shield, Users,
}

function ModuleIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const Icon = ICON_MAP[iconKey] ?? Shield
  return <Icon className={className ?? 'w-3.5 h-3.5'} aria-hidden />
}

// ─────────────────────────────────────────────────────────────────────────────
// Data hook
// ─────────────────────────────────────────────────────────────────────────────

function useGroups() {
  return useQuery<UserGroup[]>({
    queryKey: ['admin', 'groups'],
    queryFn:  async () => {
      const { data, error } = await adminDb.rpc('get_user_groups')
      if (error) throw error
      return (data as UserGroup[]) ?? []
    },
    staleTime: 30_000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Module Security panel
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  institution: 'Institution Portal',
  admin:       'Admin Portal',
}

function ModuleSecurityPanel({
  group,
  onSaved,
}: {
  group:   UserGroup
  onSaved: () => void
}) {
  const qc        = useQueryClient()
  const updateMod = useUpdateGroupModules()

  const allKeys    = MODULE_CATALOGUE.map(m => m.key)
  const isWildcard = group.module_permissions.includes('*')

  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(isWildcard ? allKeys : group.module_permissions)
  )
  const [reason,  setReason]  = useState('')
  const [dirty,   setDirty]   = useState(false)
  const [toastId, setToastId] = useState<string | null>(null)

  const toggle = useCallback((key: string) => {
    if (group.is_system) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setDirty(true)
  }, [group.is_system])

  const toggleCategory = useCallback((modules: PortalModule[]) => {
    if (group.is_system) return
    const keys  = modules.map(m => m.key)
    const allOn = keys.every(k => selected.has(k))
    setSelected(prev => {
      const next = new Set(prev)
      keys.forEach(k => allOn ? next.delete(k) : next.add(k))
      return next
    })
    setDirty(true)
  }, [group.is_system, selected])

  const handleSave = async () => {
    if (!reason.trim()) return
    const permissions = Array.from(selected)
    const dcId = await updateMod.mutateAsync({
      group_id: group.id,
      module_permissions: permissions,
      reason,
    }) as string
    setToastId(dcId)
    setDirty(false)
    setReason('')
    qc.invalidateQueries({ queryKey: ['admin', 'groups'] })
    onSaved()
  }

  const renderCategory = (cat: 'institution' | 'admin') => {
    const mods = cat === 'institution' ? INSTITUTION_MODULE_LIST : ADMIN_MODULE_LIST
    const allOn = mods.every(m => selected.has(m.key))
    return (
      <div key={cat} className='mb-5'>
        <div className='flex items-center justify-between mb-2'>
          <h4 className='text-[11px] font-bold text-ink/40 uppercase tracking-[0.12em]'>
            {CATEGORY_LABELS[cat]}
          </h4>
          {!group.is_system && (
            <button
              onClick={() => toggleCategory(mods)}
              className='text-[11px] text-ficium hover:underline font-semibold'
            >
              {allOn ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>
        <div className='grid grid-cols-1 gap-1'>
          {mods.map(mod => {
            const on = isWildcard || selected.has(mod.key)
            return (
              <button
                key={mod.key}
                onClick={() => toggle(mod.key)}
                disabled={group.is_system}
                className={[
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                  group.is_system
                    ? 'cursor-default'
                    : 'cursor-pointer hover:border-ficium/40',
                  on
                    ? 'bg-ficium/[0.06] border-ficium/20'
                    : 'bg-white border-ink/[0.08]',
                ].join(' ')}
                aria-pressed={on}
                aria-label={`${mod.label} — ${on ? 'enabled' : 'disabled'}`}
              >
                {on
                  ? <CheckSquare className='w-4 h-4 text-ficium flex-shrink-0' aria-hidden />
                  : <Square      className='w-4 h-4 text-ink/20 flex-shrink-0' aria-hidden />
                }
                <ModuleIcon iconKey={mod.iconKey} className='w-3.5 h-3.5 text-muted flex-shrink-0' />
                <div className='min-w-0 flex-1'>
                  <div className='text-[13px] font-semibold text-ink'>{mod.label}</div>
                  <div className='text-[11px] text-muted/60 truncate'>{mod.description}</div>
                </div>
                {mod.shortcut && (
                  <kbd className='text-[9px] font-mono text-muted/40 bg-ink/[0.04] px-1.5 py-0.5 rounded hidden sm:block'>
                    G+{mod.shortcut}
                  </kbd>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      {group.is_system && isWildcard && (
        <AAlert variant='info'>
          Super Admin has access to all modules — this cannot be modified.
        </AAlert>
      )}
      {group.is_system && !isWildcard && (
        <AAlert variant='info'>
          System group — module permissions are read-only. Clone this group to customise.
        </AAlert>
      )}
      {toastId && (
        <AAlert variant='success'>
          Module changes submitted for dual-control approval. Action ID: {toastId.slice(0, 8)}
        </AAlert>
      )}

      {renderCategory('institution')}
      {renderCategory('admin')}

      {!group.is_system && dirty && (
        <div className='mt-5 border-t border-ink/[0.08] pt-4 space-y-3'>
          <AAlert variant='warning'>
            Saving module changes enters the dual-control queue. A second admin must approve.
          </AAlert>
          <AFormField label='Reason for change'>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder='Describe why modules are being changed…'
              className={aInputCls}
            />
          </AFormField>
          <div className='flex gap-2'>
            <ABtn
              variant='primary'
              onClick={handleSave}
              loading={updateMod.isPending}
              disabled={!reason.trim()}
            >
              Submit for approval
            </ABtn>
            <ABtn variant='ghost' onClick={() => { setDirty(false); setSelected(new Set(isWildcard ? MODULE_CATALOGUE.map(m => m.key) : group.module_permissions)) }}>
              Discard
            </ABtn>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group detail panel
// ─────────────────────────────────────────────────────────────────────────────

type DetailTab = 'details' | 'modules'

function GroupDetail({
  group,
  onClose,
}: {
  group:   UserGroup
  onClose: () => void
}) {
  const [tab, setTab] = useState<DetailTab>('modules')

  const typeLabel = group.user_type === 'admin' ? 'Admin Portal' : 'Institution Portal'
  const typeColor = group.user_type === 'admin'
    ? 'text-ficium bg-ficium/[0.08] border-ficium/20'
    : 'text-emerald-700 bg-emerald-50 border-emerald-200'

  const memberCount = group.member_count ?? 0
  const modCount    = group.module_permissions.includes('*')
    ? MODULE_CATALOGUE.length
    : group.module_permissions.length

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='px-5 pt-5 pb-4 border-b border-ink/[0.08] flex-shrink-0'>
        <div className='flex items-start justify-between gap-3 mb-3'>
          <div className='flex items-center gap-3'>
            <div className='w-9 h-9 rounded-xl bg-ficium/10 border border-ficium/20 flex items-center justify-center flex-shrink-0'>
              <Shield className='w-4 h-4 text-ficium' aria-hidden />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h2 className='text-[16px] font-bold text-ink'>{group.label}</h2>
                {group.is_system && (
                  <span className='flex items-center gap-1 text-[9px] font-bold text-muted/50 bg-ink/[0.04] border border-ink/[0.08] px-1.5 py-0.5 rounded-full uppercase tracking-wider'>
                    <Lock className='w-2.5 h-2.5' aria-hidden />System
                  </span>
                )}
              </div>
              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1 ${typeColor}`}>
                {typeLabel}
              </span>
            </div>
          </div>
          <button onClick={onClose} className='text-muted hover:text-ink transition-colors p-1' aria-label='Close'>
            <X className='w-4 h-4' aria-hidden />
          </button>
        </div>

        <p className='text-[13px] text-muted mb-3'>{group.description}</p>

        <div className='flex gap-4 text-[12px]'>
          <div>
            <span className='text-muted/60'>Members</span>
            <span className='ml-2 font-bold text-ink'>{memberCount}</span>
          </div>
          <div>
            <span className='text-muted/60'>Modules</span>
            <span className='ml-2 font-bold text-ink'>
              {group.module_permissions.includes('*') ? 'All' : modCount}
            </span>
          </div>
          <div>
            <span className='text-muted/60'>Slug</span>
            <code className='ml-2 text-[11px] text-ficium font-mono'>{group.slug}</code>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className='px-5 border-b border-ink/[0.08] flex gap-1 flex-shrink-0'>
        {(['modules', 'details'] as DetailTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-3 py-2.5 text-[12px] font-semibold border-b-2 transition-colors capitalize',
              tab === t
                ? 'border-ficium text-ficium'
                : 'border-transparent text-muted/60 hover:text-ink',
            ].join(' ')}
          >
            {t === 'modules' ? 'Module Security' : 'Group Details'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className='flex-1 overflow-y-auto p-5'>
        {tab === 'modules' && (
          <ModuleSecurityPanel group={group} onSaved={() => {}} />
        )}
        {tab === 'details' && (
          <div className='space-y-3'>
            {[
              ['Group ID',    group.id],
              ['Slug',        group.slug],
              ['User type',   typeLabel],
              ['System',      group.is_system ? 'Yes — read-only' : 'No — editable'],
              ['Created',     new Date(group.created_at).toLocaleDateString('en-MU')],
              ['Last updated',new Date(group.updated_at).toLocaleDateString('en-MU')],
            ].map(([label, value]) => (
              <div key={label} className='flex justify-between py-2 border-b border-ink/[0.05]'>
                <span className='text-[12px] text-muted/60'>{label}</span>
                <span className='text-[12px] font-semibold text-ink font-mono'>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create group modal
// ─────────────────────────────────────────────────────────────────────────────

function CreateGroupModal({
  open,
  onClose,
}: {
  open:    boolean
  onClose: () => void
}) {
  const qc     = useQueryClient()
  const create = useCreateAdminGroup()

  const EMPTY: CreateGroupPayload = {
    slug: '', label: '', description: '',
    user_type: 'institution', module_permissions: [],
  }
  const [form,   setForm]   = useState<CreateGroupPayload>(EMPTY)
  const [toastId, setToast] = useState<string | null>(null)

  const selected = new Set(form.module_permissions)

  const toggle = (key: string) =>
    setForm(f => ({
      ...f,
      module_permissions: selected.has(key)
        ? f.module_permissions.filter(k => k !== key)
        : [...f.module_permissions, key],
    }))

  const handleSubmit = async () => {
    const dcId = await create.mutateAsync(form) as string
    setToast(dcId)
    qc.invalidateQueries({ queryKey: ['admin', 'groups'] })
    setTimeout(() => { onClose(); setForm(EMPTY); setToast(null) }, 1500)
  }

  const valid = form.slug.trim() && form.label.trim() && form.module_permissions.length > 0

  const mods = form.user_type === 'admin' ? ADMIN_MODULE_LIST : INSTITUTION_MODULE_LIST

  return (
    <AModal open={open} onClose={onClose} title='Create group' width='max-w-xl'>
      <div className='space-y-4'>
        {toastId
          ? <AAlert variant='success'>Group submitted for dual-control. Action ID: {toastId.slice(0,8)}</AAlert>
          : <AAlert variant='warning'>Group creation enters dual-control. A second admin must approve.</AAlert>
        }

        <div className='grid grid-cols-2 gap-3'>
          <AFormField label='Group name'>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder='Bank Officer' className={aInputCls} />
          </AFormField>
          <AFormField label='Slug' hint='Lowercase, underscores only'>
            <input value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s/g,'_').replace(/[^a-z0-9_]/g,'') }))}
              placeholder='bank_officer' className={aInputCls} />
          </AFormField>
        </div>

        <AFormField label='Description'>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder='Marketplace browse and bid submission' className={aInputCls} />
        </AFormField>

        <AFormField label='Portal type'>
          <select value={form.user_type}
            onChange={e => setForm(f => ({ ...f, user_type: e.target.value as 'admin'|'institution', module_permissions: [] }))}
            className={aInputCls}>
            <option value='institution'>Institution Portal</option>
            <option value='admin'>Admin Portal</option>
          </select>
        </AFormField>

        <div>
          <p className='text-[11px] font-bold text-ink/40 uppercase tracking-[0.12em] mb-2'>Module Access</p>
          <div className='grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-1'>
            {mods.map(mod => {
              const on = selected.has(mod.key)
              return (
                <button key={mod.key} onClick={() => toggle(mod.key)}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all',
                    on ? 'bg-ficium/[0.06] border-ficium/20' : 'bg-white border-ink/[0.08] hover:border-ficium/30',
                  ].join(' ')}>
                  {on ? <CheckSquare className='w-4 h-4 text-ficium flex-shrink-0' /> : <Square className='w-4 h-4 text-ink/20 flex-shrink-0' />}
                  <ModuleIcon iconKey={mod.iconKey} className='w-3.5 h-3.5 text-muted flex-shrink-0' />
                  <span className='text-[13px] font-medium text-ink'>{mod.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className='flex gap-2 pt-1'>
          <ABtn variant='primary' onClick={handleSubmit} loading={create.isPending} disabled={!valid || !!toastId}>
            Submit for approval
          </ABtn>
          <ABtn variant='ghost' onClick={onClose}>Cancel</ABtn>
        </div>
      </div>
    </AModal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group list item
// ─────────────────────────────────────────────────────────────────────────────

function GroupRow({
  group,
  selected,
  onClick,
}: {
  group:    UserGroup
  selected: boolean
  onClick:  () => void
}) {
  const modCount = group.module_permissions.includes('*')
    ? MODULE_CATALOGUE.length
    : group.module_permissions.length

  const typeColor = group.user_type === 'admin'
    ? 'text-ficium bg-ficium/[0.08] border-ficium/20'
    : 'text-emerald-700 bg-emerald-50 border-emerald-200'

  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-b border-ink/[0.05]',
        selected
          ? 'bg-ficium/[0.06] border-l-2 border-l-ficium'
          : 'hover:bg-ink/[0.02] border-l-2 border-l-transparent',
      ].join(' ')}
      aria-current={selected ? 'true' : undefined}
    >
      <div className='w-8 h-8 rounded-lg bg-ficium/10 flex items-center justify-center flex-shrink-0'>
        <Shield className='w-3.5 h-3.5 text-ficium' aria-hidden />
      </div>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2'>
          <span className='text-[13px] font-semibold text-ink truncate'>{group.label}</span>
          {group.is_system && <Lock className='w-3 h-3 text-muted/40 flex-shrink-0' aria-label='System group' />}
        </div>
        <div className='flex items-center gap-2 mt-0.5'>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${typeColor}`}>
            {group.user_type === 'admin' ? 'Admin' : 'Institution'}
          </span>
          <span className='text-[11px] text-muted/50'>
            {modCount} module{modCount !== 1 ? 's' : ''} · {group.member_count ?? 0} member{(group.member_count ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${selected ? 'text-ficium' : 'text-ink/20'}`} aria-hidden />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminGroups() {
  const { data: me }     = useAdminMe()
  const { data: groups = [], isLoading } = useGroups()
  const [selected,  setSelected]  = useState<UserGroup | null>(null)
  const [creating,  setCreating]  = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all'|'admin'|'institution'>('all')

  const canCreate = me?.permissions?.includes('*') ||
                    me?.module_permissions?.includes('admin:groups')

  const filtered = useMemo(() =>
    typeFilter === 'all' ? groups : groups.filter(g => g.user_type === typeFilter),
  [groups, typeFilter])

  const adminCount = groups.filter(g => g.user_type === 'admin').length
  const instCount  = groups.filter(g => g.user_type === 'institution').length

  return (
    <div className='flex h-full overflow-hidden'>
      {/* Left: group list */}
      <div className={`flex flex-col border-r border-ink/[0.08] bg-white flex-shrink-0 ${selected ? 'w-72' : 'flex-1'}`}>
        <div className='px-5 pt-5 pb-4 border-b border-ink/[0.08]'>
          <ASectionHeader
            title='Groups'
            subtitle={`${groups.length} groups · ${adminCount} admin · ${instCount} institution`}
            actions={canCreate ? (
              <ABtn variant='primary' size='sm' icon={Plus} onClick={() => setCreating(true)}>
                New group
              </ABtn>
            ) : undefined}
          />

          {/* Filter pills */}
          <div className='flex gap-1.5 mt-3'>
            {(['all', 'admin', 'institution'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={[
                  'px-3 py-1 rounded-full text-[11px] font-semibold border transition-all capitalize',
                  typeFilter === f
                    ? 'bg-ficium text-white border-ficium'
                    : 'bg-white text-muted border-ink/[0.12] hover:border-ficium/30',
                ].join(' ')}
              >
                {f === 'all' ? 'All' : f === 'admin' ? 'Admin Portal' : 'Institution Portal'}
              </button>
            ))}
          </div>
        </div>

        <div className='flex-1 overflow-y-auto'>
          {isLoading && (
            <div className='p-4 space-y-2'>
              {[...Array(5)].map((_, i) => <ASkeletonRow key={i} cols={2} />)}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <AEmptyState
              icon={Shield}
              title='No groups'
              description='Create a group to define module access.'
            />
          )}
          {!isLoading && filtered.map(g => (
            <GroupRow
              key={g.id}
              group={g}
              selected={selected?.id === g.id}
              onClick={() => setSelected(prev => prev?.id === g.id ? null : g)}
            />
          ))}
        </div>
      </div>

      {/* Right: group detail */}
      {selected && (
        <div className='flex-1 overflow-hidden bg-cream flex flex-col'>
          <GroupDetail group={selected} onClose={() => setSelected(null)} />
        </div>
      )}

      {!selected && (
        <div className='flex-1 hidden md:flex items-center justify-center bg-cream'>
          <div className='text-center'>
            <div className='w-14 h-14 rounded-2xl bg-ficium/10 border border-ficium/20 flex items-center justify-center mx-auto mb-3'>
              <Shield className='w-6 h-6 text-ficium/50' aria-hidden />
            </div>
            <p className='text-[13px] text-muted/50'>Select a group to view module security</p>
          </div>
        </div>
      )}

      <CreateGroupModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
