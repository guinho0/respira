// Conexão com o Supabase (Project Settings → API).
// A chave "anon" / publishable é pública por design: quem protege os dados são as regras RLS
// de supabase/schema.sql. Nunca coloque aqui a chave "service_role" / secret.
// Deixe em branco para usar o app só no aparelho, sem perfil nem grupos.
window.RESPIRA_CONFIG = {
  supabaseUrl: 'https://gbkolvqzwqeneeuhyblk.supabase.co',
  supabaseAnonKey: 'sb_publishable_pekckJmJNfC7tNC1IDEZaA_OFfwB2KF',
};
