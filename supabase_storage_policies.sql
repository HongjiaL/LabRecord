-- ============================================================
-- Supabase Storage：允许匿名（anon）读写 meeting-files 桶
-- 在 Supabase Dashboard → SQL Editor 中执行（与业务表 RLS 无关）
-- ============================================================
-- 若报「policy already exists」，请先 drop 对应 policy 或改名。

-- 确保已创建存储桶 meeting-files（Storage → New bucket）

-- storage.objects 的 RLS（未配置时上传会出现：
-- new row violates row-level security policy）

alter table if exists storage.objects enable row level security;

drop policy if exists "lab_meeting_files_select" on storage.objects;
create policy "lab_meeting_files_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'meeting-files');

drop policy if exists "lab_meeting_files_insert" on storage.objects;
create policy "lab_meeting_files_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'meeting-files');

drop policy if exists "lab_meeting_files_update" on storage.objects;
create policy "lab_meeting_files_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'meeting-files')
  with check (bucket_id = 'meeting-files');

drop policy if exists "lab_meeting_files_delete" on storage.objects;
create policy "lab_meeting_files_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'meeting-files');
