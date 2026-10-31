-- =========================================================================
-- KEZMOTO — Personal details on profiles
-- Create account now asks for first / middle / last name, sex, birthday and
-- a picked address (region → barangay, plus zone / street). Each is stored
-- in its own column. full_name, phone and address stay as the composed
-- values the rest of the app (and the ID name check) already reads.
-- Safe to re-run.
-- =========================================================================

alter table public.profiles
  add column if not exists first_name  text,
  add column if not exists middle_name text,
  add column if not exists last_name   text,
  add column if not exists sex         text,
  add column if not exists birthdate   date,
  add column if not exists region      text,
  add column if not exists province    text,
  add column if not exists city        text,
  add column if not exists barangay    text,
  add column if not exists street      text;

alter table public.profiles drop constraint if exists profiles_sex_check;
alter table public.profiles
  add constraint profiles_sex_check check (sex is null or sex in ('male', 'female'));

-- Signup copies everything from the `options.data` passed to signUp().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  raw_sex text := lower(nullif(trim(meta ->> 'sex'), ''));
  raw_birthdate text := nullif(trim(meta ->> 'birthdate'), '');
begin
  insert into public.profiles (
    profile_id, role, full_name, phone, address,
    first_name, middle_name, last_name, sex, birthdate,
    region, province, city, barangay, street
  )
  values (
    new.id,
    'customer',                                   -- admins are promoted manually
    coalesce(meta ->> 'full_name', ''),
    coalesce(meta ->> 'phone', ''),
    coalesce(meta ->> 'address', ''),
    nullif(trim(meta ->> 'first_name'), ''),
    nullif(trim(meta ->> 'middle_name'), ''),
    nullif(trim(meta ->> 'last_name'), ''),
    case when raw_sex in ('male', 'female') then raw_sex end,
    case when raw_birthdate ~ '^\d{4}-\d{2}-\d{2}$' then raw_birthdate::date end,
    nullif(trim(meta ->> 'region'), ''),
    nullif(trim(meta ->> 'province'), ''),
    nullif(trim(meta ->> 'city'), ''),
    nullif(trim(meta ->> 'barangay'), ''),
    nullif(trim(meta ->> 'street'), '')
  )
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
