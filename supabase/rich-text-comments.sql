-- Rich text support for ticket comments (bold, italic, highlight, lists, etc.)
alter table public.ticket_comments
  add column if not exists "contentHtml" text;
