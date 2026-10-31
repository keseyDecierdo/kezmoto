-- =========================================================================
-- KEZMOTO — Profile provisioning
-- Every auth.users row gets a matching profiles row, so a signup can never
-- leave a session without a profile behind it. Runs as security definer
-- because the new user has no session yet at insert time.
-- The name / phone / address come from the `options.data` passed to signUp().
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (profile_id, role, full_name, phone, address)
  values (
    new.id,
    'customer',                                   -- admins are promoted manually
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'address', '')
  )
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
