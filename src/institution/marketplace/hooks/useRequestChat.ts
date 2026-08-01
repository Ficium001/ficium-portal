// =============================================================
// Ficium Portal — request chat (institution side)
//
// Chat rows live in the App DB (public.request_messages), NOT the
// Portal DB, so there is no Supabase client in the portal that can
// reach them. Everything goes through ficium-portal-api, which
// proxies via a service session and scopes each query to the
// caller's own institution_id from the JWT.
//
// Note the response deliberately has no sender_id: the borrower's
// auth.uid() is stable across every request they post, so exposing
// it would let an institution correlate the same anonymous borrower
// across the marketplace. `sender_label` is what the UI renders.
// =============================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { portalApi } from '@/shared/lib/portalApi'
import { poll30s, useInvalidateOnVisible } from '@/shared/lib/polling'

export interface ChatMessage {
  id: string
  request_id: string
  sender_type: 'institution' | 'client'
  sender_label: string
  body: string
  kind: 'structured' | 'free'
  template_code: string | null
  params: Record<string, unknown>
  created_at: string
}

export interface MessageTemplate {
  code: string
  label: string
  body_template: string
  params_schema: Record<string, unknown>
  sort_order: number
}

export interface ChatThread {
  messages: ChatMessage[]
  is_open: boolean
  is_winner: boolean
  can_send_free_text: boolean
}

export const requestChatKey = (requestId: string) =>
  ['request-chat', requestId] as const

const templatesKey = ['request-chat-templates'] as const

export function useRequestChat(requestId: string, enabled = true) {
  useInvalidateOnVisible(requestChatKey(requestId))
  return useQuery({
    queryKey: requestChatKey(requestId),
    queryFn: () =>
      portalApi.get<ChatThread>(`/marketplace/requests/${requestId}/messages`),
    enabled: enabled && Boolean(requestId),
    refetchInterval: poll30s,
    refetchOnWindowFocus: true,
  })
}

export function useMessageTemplates(enabled = true) {
  return useQuery({
    queryKey: templatesKey,
    queryFn: () =>
      portalApi.get<MessageTemplate[]>('/marketplace/requests/message-templates'),
    enabled,
    // The catalogue is effectively static config — don't re-fetch it on
    // every drawer open.
    staleTime: 30 * 60_000,
  })
}

export interface SendMessageInput {
  kind: 'structured' | 'free'
  template_code?: string | null
  params?: Record<string, unknown>
  body?: string
}

export function useSendMessage(requestId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      portalApi.post<ChatMessage>(
        `/marketplace/requests/${requestId}/messages`,
        input,
      ),
    onSuccess: () => {
      // Refetch rather than push the returned row in: the API renders
      // structured bodies server-side from the catalogue, and the thread
      // state (is_open / can_send_free_text) can change on acceptance.
      void queryClient.invalidateQueries({ queryKey: requestChatKey(requestId) })
    },
  })
}
