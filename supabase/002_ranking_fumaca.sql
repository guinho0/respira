-- Respira — migração 002: ranking com fumaça.
-- Rode uma vez no SQL Editor se o seu projeto foi criado antes desta versão.
alter table public.profiles
  add column if not exists rank_ms bigint,
  add column if not exists rank_at timestamptz,
  add column if not exists smoke smallint not null default 0 check (smoke between 0 and 2);
