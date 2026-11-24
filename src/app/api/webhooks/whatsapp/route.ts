/**
 * WhatsApp Cloud API Webhook Alias.
 * Re-exports the primary webhook route from @/app/api/whatsapp/webhook/route
 * to support both /api/whatsapp/webhook and /api/webhooks/whatsapp endpoints.
 */
export { GET, POST } from '@/app/api/whatsapp/webhook/route'
