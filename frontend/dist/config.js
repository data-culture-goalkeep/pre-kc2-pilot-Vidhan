// Safe, committed defaults for the Tamahar Phase 2 frontend.
// Deployment-specific values are injected by runtime-config.js.
window.TAMAHAR_CONFIG = Object.freeze({
  dataMode: 'supabase',
  supabaseUrl: '',
  supabasePublishableKey: '',
  defaultMonth: '2026-09',
  readOnly: true,
  authMode: 'staff-password'
});
