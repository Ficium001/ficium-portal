/**
 * Feature modules installed in the portal.
 *
 * To add a module: create <feature>/manifest.tsx exporting a ModuleManifest,
 * add it here, and make sure its permission key exists in
 * shared/lib/modules.ts (and catalog.module in the DB). The registry test
 * checks the rest. Order here doesn't matter; each contribution has `order`.
 */
import type { ModuleManifest } from './types'
import { marketplaceModule }   from '@/institution/marketplace/manifest'
import { bidsModule }          from '@/institution/bids/manifest'
import { bidApprovalModule }   from '@/institution/approvals/manifest'
import { approvalChainsModule } from '@/institution/approval-chains/manifest'
import { dualControlModule }   from '@/institution/dual-control/manifest'
import { dealsModule }         from '@/institution/pipeline/manifest'
import { docTemplatesModule }  from '@/institution/doc-templates/manifest'
import { esignModule }         from '@/institution/esign/manifest'
import { bookingModule }       from '@/institution/booking/manifest'
import { analyticsModule }     from '@/institution/analytics/manifest'
import { notificationsModule } from '@/institution/notifications/manifest'
import { settingsModule }      from '@/institution/settings/manifest'
import { productsModule }      from '@/institution/products/manifest'
import { benefitsModule }      from '@/institution/benefits/manifest'
import { teamModule }          from '@/institution/team/manifest'
import { auditModule }         from '@/institution/audit/manifest'

export const FEATURE_MODULES: readonly ModuleManifest[] = [
  marketplaceModule, bidsModule,
  bidApprovalModule, approvalChainsModule, dualControlModule,
  dealsModule, docTemplatesModule, esignModule, bookingModule,
  analyticsModule, notificationsModule,
  settingsModule, productsModule, benefitsModule, teamModule, auditModule,
]
