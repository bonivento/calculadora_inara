/* Configuración pública de Supabase. La clave "publishable" está pensada para ir en el navegador:
   la seguridad real la dan las políticas RLS de supabase/schema.sql. NUNCA pongas aquí la service_role. */
window.CI = window.CI || {};
window.CI.config = {
  supabaseUrl: 'https://slizjhnivjkuxfjaouoq.supabase.co',
  supabaseKey: 'sb_publishable_bqIVlXtpOiZT4iZEohCqIg_10A4nJ40'
};
