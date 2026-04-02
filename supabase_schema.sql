-- ============================================================
-- Lab Meeting Records — Supabase Database Setup
-- Run this SQL in: Supabase Dashboard → SQL Editor
-- ============================================================

-- meetings 表
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null,
  topic text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- participants 表
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

-- literature 表
create table if not exists literature (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id) on delete cascade not null,
  title text not null,
  authors text,
  journal text,
  doi text,
  link text,
  keywords text[],
  ppt_data_url text,
  ppt_file_name text,
  transcript text,
  created_at timestamptz default now()
);

-- RLS 策略：表设为公开读写（所有人可编辑，无需登录）
alter table meetings enable row level security;
create policy if not exists "public_all_meetings" on meetings for all using (true) with check (true);

alter table participants enable row level security;
create policy if not exists "public_all_participants" on participants for all using (true) with check (true);

alter table literature enable row level security;
create policy if not exists "public_all_literature" on literature for all using (true) with check (true);

-- ============================================================
-- meeting_files 表：存储 PPT/PDF 文件（Supabase Storage）
-- ============================================================
create table if not exists meeting_files (
  id uuid primary key default gen_random_uuid(),
  meeting_id text not null,
  file_name text not null,
  file_path text not null,
  file_size bigint,
  mime_type text,
  created_at timestamptz default now()
);

alter table meeting_files enable row level security;
create policy if not exists "public_all_meeting_files" on meeting_files for all using (true) with check (true);
