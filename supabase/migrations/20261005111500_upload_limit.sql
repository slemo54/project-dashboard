update storage.buckets set file_size_limit=52428800 where id='axn-deliverables';
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
