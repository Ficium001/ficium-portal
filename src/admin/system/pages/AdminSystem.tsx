/**
 * @page AdminSystem
 * @route /admin/system
 * @access protected — system:view
 * @description System health metrics and platform status.
 * @owner Ficium Engineering
 */

import { MonitorDot, RefreshCw } from 'lucide-react'
import { useSystemMetrics } from '../../hooks/useAdmin'
import { ASectionHeader, ALiveBadge, AKpiCard, ASkeletonCard, ABtn } from '../../components/primitives'

export default function AdminSystem() {
  const { data: metrics = [], isLoading, refetch } = useSystemMetrics()

  const ok       = metrics.filter(m => m.status === 'ok').length
  const warnings = metrics.filter(m => m.status === 'warn').length
  const critical = metrics.filter(m => m.status === 'critical').length

  const overallStatus = critical > 0 ? 'critical' : warnings > 0 ? 'warn' : 'ok'
  const overallLabel  = critical > 0 ? 'DEGRADED' : warnings > 0 ? 'WARNING' : 'OPERATIONAL'
  const overallColor  = critical > 0 ? 'text-red-400' : warnings > 0 ? 'text-amber-400' : 'text-emerald-400'

  return (
    <main className='p-6 lg:p-8 max-w-[1100px] mx-auto'>
      <ASectionHeader
        title='System'
        subtitle='Platform health metrics · refreshes every 60 s'
        badge={<ALiveBadge />}
        actions={<ABtn variant='secondary' size='sm' icon={RefreshCw} onClick={() => refetch()}>Refresh</ABtn>}
      />

      {/* Overall status banner */}
      <div className={`bg-ink/80 border rounded-xl px-5 py-4 flex items-center gap-4 mb-6 ${
        overallStatus === 'critical' ? 'border-red-800' : overallStatus === 'warn' ? 'border-amber-800' : 'border-emerald-800'
      }`}>
        <MonitorDot className={`w-5 h-5 ${overallColor}`} aria-hidden />
        <div>
          <div className={`font-black text-[16px] ${overallColor}`}>{overallLabel}</div>
          <div className='text-[11px] text-ink/45 font-mono'>
            {ok} ok · {warnings} warning{warnings !== 1 ? 's' : ''} · {critical} critical
          </div>
        </div>
        <div className='ml-auto text-[10px] text-ink/30 font-mono'>
          {new Date().toLocaleString('en-MU')}
        </div>
      </div>

      {/* Metric cards */}
      {isLoading ? (
        <div className='grid grid-cols-2 lg:grid-cols-3 gap-4'>
          {Array.from({ length: 6 }).map((_, i) => <ASkeletonCard key={i} />)}
        </div>
      ) : (
        <div className='grid grid-cols-2 lg:grid-cols-3 gap-4'>
          {metrics.map(m => (
            <AKpiCard
              key={m.key}
              label={m.label}
              value={m.value}
              sub={m.unit}
              status={m.status}
            />
          ))}
        </div>
      )}

      {/* Immutability notice */}
      <div className='mt-8 bg-ink/95 border border-ficium/[0.12] rounded-xl p-5'>
        <div className='text-[9px] font-bold text-ink/20 uppercase tracking-widest mb-3'>Platform guarantees</div>
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
          {[
            ['Audit log', 'Append-only · WORM · 7-year retention'],
            ['Dual control', 'Four-eyes enforced at DB level'],
            ['Sessions', 'IP + user agent logged · idle timeout 10 min'],
            ['Authentication', 'MFA required · 5-attempt lockout'],
          ].map(([label, desc]) => (
            <div key={label}>
              <div className='text-[10px] font-bold text-ink/45 mb-1'>{label}</div>
              <div className='text-[10px] text-ink/30 font-mono'>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
