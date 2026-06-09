/**
 * @page AdminRoles
 * @route /admin/roles
 * @access protected — roles:view
 * @description Role definitions, permission matrices, custom role creation.
 * @owner Ficium Engineering
 */

import { useState } from 'react'
import { Shield, Plus, Lock } from 'lucide-react'
import { useAdminRoles, useCreateAdminRole, useAdminMe } from '../../hooks/useAdmin'
import { PERMISSION_CATALOGUE } from '../../types/admin'
import type { CreateRolePayload } from '../../types/admin'
import {
  ASectionHeader, AEmptyState,
  ABtn, AAlert, AModal, AFormField, aInputCls, PermissionTag, RiskBadge,
} from '../../components/primitives'

function CreateRoleModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: (id: string) => void }) {
  const create = useCreateAdminRole()
  const [form, setForm] = useState<CreateRolePayload>({ slug: '', label: '', description: '', permissions: [] })

  const categories = Array.from(new Set(PERMISSION_CATALOGUE.map(p => p.category)))

  const toggle = (key: string) =>
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }))

  const handleSubmit = async () => {
    const dcId = await create.mutateAsync(form) as string
    onSuccess(dcId)
    onClose()
    setForm({ slug: '', label: '', description: '', permissions: [] })
  }

  return (
    <AModal open={open} onClose={onClose} title='Create custom role' width='max-w-2xl'>
      <div className='space-y-4'>
        <AAlert variant='warning'>
          Custom role creation enters dual-control. A second admin must approve.
        </AAlert>
        <div className='grid grid-cols-2 gap-4'>
          <AFormField label='Role slug' hint='Lowercase, underscores only'>
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
              placeholder='custom_analyst' className={aInputCls} />
          </AFormField>
          <AFormField label='Display label'>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder='Custom Analyst' className={aInputCls} />
          </AFormField>
        </div>
        <AFormField label='Description'>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder='What this role does…' className={aInputCls} />
        </AFormField>
        <div>
          <div className='text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3'>Permissions</div>
          <div className='space-y-4 max-h-72 overflow-y-auto pr-1'>
            {categories.map(cat => (
              <div key={cat}>
                <div className='text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2 capitalize'>{cat}</div>
                <div className='space-y-1.5'>
                  {PERMISSION_CATALOGUE.filter(p => p.category === cat).map(p => (
                    <button key={p.key} type='button' onClick={() => toggle(p.key)}
                      aria-pressed={form.permissions.includes(p.key)}
                      className={[
                        'w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg border transition-all',
                        form.permissions.includes(p.key)
                          ? 'border-indigo-600 bg-indigo-900/20'
                          : 'border-[#2d3748] hover:border-indigo-800',
                      ].join(' ')}>
                      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${form.permissions.includes(p.key) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                        {form.permissions.includes(p.key) && <span className='text-white text-[8px]'>✓</span>}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='text-[11px] font-mono text-slate-300'>{p.key}</div>
                        <div className='text-[10px] text-slate-600'>{p.description}</div>
                      </div>
                      <RiskBadge risk={p.risk} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className='flex gap-3 pt-1'>
          <ABtn variant='primary' onClick={handleSubmit}
            disabled={!form.slug || !form.label || form.permissions.length === 0} loading={create.isPending}>
            Submit for approval
          </ABtn>
          <ABtn variant='ghost' onClick={onClose}>Cancel</ABtn>
        </div>
      </div>
    </AModal>
  )
}

export default function AdminRoles() {
  const { data: me } = useAdminMe()
  const { data: roles = [], isLoading } = useAdminRoles()
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canCreate = me?.role_slug === 'super_admin' || me?.permissions?.includes('roles:create')

  return (
    <main className='p-6 lg:p-8 max-w-[1100px] mx-auto'>
      <ASectionHeader
        title='Roles & Permissions'
        subtitle={`${roles.length} roles · system roles are read-only`}
        actions={canCreate && (
          <ABtn variant='primary' size='sm' icon={Plus} onClick={() => setShowCreate(true)}>
            Create custom role
          </ABtn>
        )}
      />

      {success && <div className='mb-5'><AAlert variant='success' onDismiss={() => setSuccess(null)}>{success}</AAlert></div>}

      <AAlert variant='info'>
        System roles cannot be edited or deleted. Assign custom roles via the Users page (dual-control required).
      </AAlert>

      <div className='mt-5 space-y-3'>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='bg-[#111827] rounded-xl border border-[#1f2937] p-5 animate-pulse h-16' />
          ))
        ) : roles.length === 0 ? (
          <AEmptyState icon={Shield} title='No roles' />
        ) : roles.map(role => {
          const isOpen = expanded === role.id
          return (
            <div key={role.id} className='bg-[#111827] rounded-xl border border-[#1f2937] overflow-hidden'>
              <button
                onClick={() => setExpanded(isOpen ? null : role.id)}
                aria-expanded={isOpen}
                className='w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#1a2236] transition-colors'
              >
                <div className='w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0'>
                  {role.is_system
                    ? <Lock className='w-4 h-4 text-indigo-400' aria-hidden />
                    : <Shield className='w-4 h-4 text-indigo-400' aria-hidden />
                  }
                </div>
                <div className='flex-1 min-w-0 text-left'>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-[14px] text-white'>{role.label}</span>
                    {role.is_system && (
                      <span className='text-[9px] font-bold bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full border border-slate-700 uppercase tracking-widest'>System</span>
                    )}
                    <span className='text-[9px] font-mono text-slate-600'>{role.slug}</span>
                  </div>
                  <div className='text-[11px] text-slate-600 mt-0.5'>{role.description}</div>
                </div>
                <div className='text-[11px] text-slate-600 flex-shrink-0'>
                  {role.permissions[0] === '*' ? 'All permissions' : `${role.permissions.length} permissions`}
                </div>
                <div className='text-slate-600 ml-2'>
                  {isOpen ? '▲' : '▼'}
                </div>
              </button>
              {isOpen && (
                <div className='border-t border-[#1f2937] px-5 py-4 bg-[#0d1117]/60'>
                  <div className='text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-3'>
                    Granted permissions
                  </div>
                  {role.permissions[0] === '*' ? (
                    <p className='text-[11px] text-indigo-400 font-mono'>All permissions (super admin)</p>
                  ) : (
                    <div className='flex flex-wrap gap-1.5'>
                      {role.permissions.map(p => <PermissionTag key={p} perm={p} />)}
                    </div>
                  )}
                  <div className='mt-4'>
                    <div className='text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2'>Permission details</div>
                    <div className='space-y-1'>
                      {PERMISSION_CATALOGUE.filter(p => role.permissions[0] === '*' || role.permissions.includes(p.key)).map(p => (
                        <div key={p.key} className='flex items-center gap-3 text-[11px]'>
                          <RiskBadge risk={p.risk} />
                          <code className='font-mono text-indigo-300'>{p.key}</code>
                          <span className='text-slate-500'>—</span>
                          <span className='text-slate-500'>{p.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <CreateRoleModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={dcId => { setSuccess(`Role creation submitted (action ${dcId.slice(0, 8)})`); setShowCreate(false) }}
      />
    </main>
  )
}
