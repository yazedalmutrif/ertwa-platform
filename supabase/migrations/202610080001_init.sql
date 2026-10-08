-- Run once in a NEW Supabase project's SQL Editor, or with `supabase db push`.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.departments (
  slug text primary key,
  name text not null unique,
  display_name text not null,
  leader text not null default '',
  deputy text not null default '',
  sort_order integer not null default 0
);
create table public.platform_settings (
  id boolean primary key default true check (id),
  leader_name text not null default '',
  deputy_name text not null default ''
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(full_name) between 1 and 150),
  city text not null default '' check (char_length(city) <= 100),
  age integer check (age between 1 and 120),
  specialization text not null default '' check (char_length(specialization) <= 200),
  role text not null default 'member' check (role in ('member', 'admin')),
  membership_status text not null default 'pending'
    check (membership_status in ('pending', 'active', 'rejected')),
  created_at timestamptz not null default now()
);

-- Roles come from a protected table, never from email or editable metadata.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

create function private.valid_answers(payload jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare entry jsonb; choice jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'array' then return false; end if;
  if jsonb_array_length(payload) not between 1 and 20 or octet_length(payload::text) > 20000 then return false; end if;
  for entry in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry->'question') is distinct from 'string'
      or char_length(trim(entry->>'question')) not between 1 and 500 then return false; end if;
    if jsonb_typeof(entry->'answer') = 'string' then
      if char_length(entry->>'answer') > 2000 then return false; end if;
    elsif jsonb_typeof(entry->'answer') = 'array' then
      if jsonb_array_length(entry->'answer') > 20 then return false; end if;
      for choice in select value from jsonb_array_elements(entry->'answer') loop
        if jsonb_typeof(choice) is distinct from 'string' or char_length(choice #>> '{}') > 200 then return false; end if;
      end loop;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_answers(jsonb) from public, anon, authenticated;

create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  department_slug text not null references public.departments(slug),
  answers jsonb not null check (private.valid_answers(answers)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null check (char_length(trim(description)) between 1 and 5000),
  date date not null,
  time time not null,
  location text not null check (char_length(trim(location)) between 1 and 500),
  image text not null default 'images/web-dev-event.png' check (char_length(image) <= 2000),
  capacity integer check (capacity between 1 and 100000),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index events_schedule_idx on public.events(date, time);
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_registrations_user_idx on public.event_registrations(user_id);
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  client_name text not null check (char_length(trim(client_name)) between 1 and 150),
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  service_type text not null check (service_type in ('web', 'games', 'branding')),
  description text not null check (char_length(trim(description)) between 1 and 5000),
  budget numeric(12, 2) not null check (budget >= 0 and budget <= 9999999999.99),
  timeline text not null check (char_length(trim(timeline)) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'rejected')),
  created_at timestamptz not null default now()
);
create index service_requests_user_idx on public.service_requests(user_id);
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 5000),
  hours numeric(6, 2) not null check (hours > 0 and hours <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index contributions_user_idx on public.contributions(user_id);

-- One Auth transaction saves profile AND application, even without a session
-- when email confirmation is enabled. Passwords remain in Supabase Auth.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles(id, email, full_name, city, age, specialization)
  values (new.id, coalesce(new.email, ''),
    coalesce(nullif(trim(metadata->>'full_name'), ''), split_part(coalesce(new.email, 'عضو'), '@', 1)),
    coalesce(trim(metadata->>'city'), ''), nullif(metadata->>'age', '')::integer,
    coalesce(trim(metadata->>'specialization'), ''));
  if metadata->>'department_slug' is not null then
    insert into public.membership_applications(user_id, department_slug, answers)
    values (new.id, metadata->>'department_slug', metadata->'answers');
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger ertwa_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Preserve Auth users that already exist when installing the migration.
insert into public.profiles(id, email, full_name)
select id, coalesce(email, ''),
  left(coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), split_part(coalesce(email, 'عضو'), '@', 1)), 150)
from auth.users;

-- Aggregate counts expose no registrant identities to public visitors.
create function public.list_events(p_upcoming boolean default false, p_limit integer default 100)
returns table (id uuid, title text, description text, date date, "time" time,
  location text, image text, capacity integer, published boolean, participants bigint)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.description, e.date, e.time, e.location, e.image,
    e.capacity, e.published,
    (select count(*) from public.event_registrations r where r.event_id = e.id)
  from public.events e
  where (e.published or private.is_admin())
    and (not p_upcoming or (e.date + e.time) at time zone 'Asia/Riyadh' > now())
  order by e.date, e.time
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

-- Lock each event so concurrent registrations cannot overbook it.
create function public.register_for_event(p_event_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  selected_event public.events;
  registration_id uuid;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;
  select * into selected_event from public.events where id = p_event_id for update;
  if not found or not selected_event.published then
    raise exception 'الفعالية غير متاحة' using errcode = 'P0001';
  end if;
  select id into registration_id from public.event_registrations
    where event_id = p_event_id and user_id = auth.uid();
  if found then return registration_id; end if;
  if (selected_event.date + selected_event.time) at time zone 'Asia/Riyadh' <= now() then
    raise exception 'انتهى وقت التسجيل لهذه الفعالية' using errcode = 'P0001';
  end if;
  if selected_event.capacity is not null and
    (select count(*) from public.event_registrations where event_id = p_event_id) >= selected_event.capacity then
    raise exception 'اكتمل عدد المقاعد المتاحة' using errcode = 'P0001';
  end if;
  insert into public.event_registrations(event_id, user_id)
    values (p_event_id, auth.uid()) returning id into registration_id;
  return registration_id;
end;
$$;
create function public.review_application(p_application_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare applicant_id uuid;
begin
  if not private.is_admin() then
    raise exception 'صلاحيات الإدارة مطلوبة' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'حالة الطلب غير صحيحة' using errcode = '22023';
  end if;
  update public.membership_applications
    set status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_application_id returning user_id into applicant_id;
  if not found then raise exception 'الطلب غير موجود'; end if;
  update public.profiles set membership_status = case when p_status = 'approved' then 'active' else 'rejected' end
    where id = applicant_id;
end;
$$;

alter table public.departments enable row level security;
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.membership_applications enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.service_requests enable row level security;
alter table public.contributions enable row level security;
create policy departments_read on public.departments for select to anon, authenticated using (true);
create policy settings_read on public.platform_settings for select to anon, authenticated using (true);
create policy departments_admin on public.departments for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy settings_admin on public.platform_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy applications_read on public.membership_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy events_read on public.events for select to anon, authenticated using (published);
create policy events_admin on public.events for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy registrations_read on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy requests_insert on public.service_requests for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()) and status = 'pending');
create policy requests_read on public.service_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy requests_admin_update on public.service_requests for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy contributions_insert on public.contributions for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy contributions_read on public.contributions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy contributions_admin_update on public.contributions for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Reset default grants: browsers cannot write roles, profiles, applications, or
-- registrations directly. Guests can submit requests but cannot read them back.
revoke all on table public.departments, public.platform_settings, public.profiles,
  public.membership_applications, public.events, public.event_registrations,
  public.service_requests, public.contributions from public, anon, authenticated;
grant select on public.departments, public.platform_settings, public.events to anon, authenticated;
grant insert, update, delete on public.departments, public.platform_settings, public.events to authenticated;
grant select on public.profiles, public.membership_applications, public.event_registrations,
  public.service_requests, public.contributions to authenticated;
grant insert(client_name, email, service_type, description, budget, timeline)
  on public.service_requests to anon, authenticated;
grant update(status) on public.service_requests to authenticated;
grant insert(description, hours) on public.contributions to authenticated;
grant update(status) on public.contributions to authenticated;
grant all on public.departments, public.platform_settings, public.profiles,
  public.membership_applications, public.events, public.event_registrations,
  public.service_requests, public.contributions to service_role;
revoke all on function public.list_events(boolean, integer), public.register_for_event(uuid),
  public.review_application(uuid, text) from public, anon, authenticated;
grant execute on function public.list_events(boolean, integer) to anon, authenticated;
grant execute on function public.register_for_event(uuid), public.review_application(uuid, text) to authenticated;

insert into public.departments(slug, name, display_name, leader, deputy, sort_order) values
  ('tech', 'التقنية', 'القسم التقني', 'منار الغامدي', 'سامي الزهراني', 1),
  ('design', 'التصميم', 'لجنة التصميم', 'شهد بخاري', 'رغد', 2),
  ('events', 'الفعاليات والعلاقات', 'الفعاليات والعلاقات', 'يزيد المطرف', 'وسن السفياني', 3),
  ('quality', 'المتابعة والتطوير', 'المتابعة والتطوير', 'الجوري القصيّر', 'عارف الشهري', 4),
  ('media', 'الإعلام', 'اللجنة الإعلامية', 'مجد عسيري', 'طارق الحربي', 5),
  ('content', 'المحتوى', 'صناعة المحتوى', 'سما الوقداني', 'ليان الغامدي', 6);
insert into public.platform_settings(id, leader_name, deputy_name)
  values (true, 'رواء المالكي', 'رياض المالكي');
commit;
