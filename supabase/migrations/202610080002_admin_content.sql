-- Run once in the SQL Editor after 202610080001_init.sql. Additive only.
-- Lets admins edit homepage content, team titles and roles from the dashboard.
begin;

alter table public.platform_settings
  add column hero_text text not null default '' check (char_length(hero_text) <= 1000),
  add column mission_text text not null default '' check (char_length(mission_text) <= 1000),
  add column vision_text text not null default '' check (char_length(vision_text) <= 1000),
  add column leader_title text not null default 'قائد المنصة'
    check (leader_title in ('قائد المنصة', 'قائدة المنصة')),
  add column deputy_title text not null default 'نائب القائد'
    check (deputy_title in ('نائب القائد', 'نائبة القائد')),
  add constraint platform_settings_names_length
    check (char_length(leader_name) <= 150 and char_length(deputy_name) <= 150);

alter table public.departments
  add column description text not null default '' check (char_length(description) <= 500),
  add column leader_title text not null default 'قائد القسم'
    check (leader_title in ('قائد القسم', 'قائدة القسم')),
  add column deputy_title text not null default 'نائب القسم'
    check (deputy_title in ('نائب القسم', 'نائبة القسم')),
  add constraint departments_names_length
    check (char_length(leader) <= 150 and char_length(deputy) <= 150);

-- The six homepage stat cards; icons stay in the HTML, so rows are edit-only.
create table public.home_stats (
  slug text primary key,
  value text not null check (char_length(trim(value)) between 1 and 20),
  label text not null check (char_length(trim(label)) between 1 and 100),
  caption text not null default '' check (char_length(caption) <= 200),
  sort_order integer not null default 0
);

-- Seed with the wording already published on the site.
update public.platform_settings set
  hero_text = 'منصة تقنية متخصصة تحت مظلة معهد طاقات المعتمد للتدريب، تهدف إلى تمكين الأفراد والشركات من خلال تقديم محتوى تقني متطور.',
  mission_text = 'نؤمن أن المعرفة حق للجميع ورسالتنا هي أن نكون مصدراً دائماً وموثوقاً لإرواء شغف التقنية والمعرفة.',
  vision_text = 'أن نكون المنصة الرائدة في إرواء المجتمع معرفياً وأن نصبح رمزاً للتوعية التقنية الشاملة.';
update public.departments d set description = v.description, leader_title = v.leader_title, deputy_title = v.deputy_title
from (values
  ('tech', 'تطوير المواقع والتطبيقات وتقديم الحلول التقنية المتقدمة.', 'قائدة القسم', 'نائب القسم'),
  ('design', 'إنشاء هويات بصرية مبتكرة وتصاميم جذابة للمشاريع.', 'قائدة القسم', 'نائبة القسم'),
  ('events', 'تنظيم وإدارة الفعاليات التقنية وبناء شراكات استراتيجية.', 'قائد القسم', 'نائبة القسم'),
  ('quality', 'متابعة سير العمل وتطوير الأداء لضمان جودة المخرجات.', 'قائدة القسم', 'نائب القسم'),
  ('media', 'إنتاج المحتوى المرئي والتغطية الإعلامية للفعاليات.', 'قائدة القسم', 'نائب القسم'),
  ('content', 'كتابة وإعداد المحتوى التقني والتعليمي بأسلوب مبسط.', 'قائدة القسم', 'نائبة القسم')
) as v(slug, description, leader_title, deputy_title)
where d.slug = v.slug;
insert into public.home_stats(slug, value, label, caption, sort_order) values
  ('volunteer_hours', '400+', 'ساعة تطوعية معتمدة', 'من منصة العمل التطوعي', 1),
  ('followers', '10K+', 'متابع', 'عبر منصات التواصل الاجتماعي', 2),
  ('partnerships', '25+', 'شراكة', 'مع مؤسسات وشركات رائدة', 3),
  ('training_hours', '300+', 'ساعة تدريبية', 'في المجال التقني', 4),
  ('events', '15+', 'فعالية منفذة', 'ورش عمل ومؤتمرات ولقاءات', 5),
  ('members', '50+', 'عضو نشط', 'من مختلف التخصصات التقنية', 6);

-- Roles change only through this function: admins only, never their own role.
create function public.set_member_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'صلاحيات الإدارة مطلوبة' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'الصلاحية غير صحيحة' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'لا يمكنك تغيير صلاحياتك' using errcode = 'P0001';
  end if;
  update public.profiles
    set role = p_role,
      membership_status = case when p_role = 'admin' then 'active' else membership_status end
    where id = p_user_id;
  if not found then raise exception 'العضو غير موجود' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.set_member_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;

-- Editing an event cannot leave fewer seats than people already registered.
create function private.check_event_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.capacity is not null and new.capacity <
    (select count(*) from public.event_registrations where event_id = new.id) then
    raise exception 'عدد المقاعد أقل من عدد المسجلين' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.check_event_capacity() from public, anon, authenticated;
create trigger events_capacity_guard before update of capacity on public.events
  for each row execute function private.check_event_capacity();

alter table public.home_stats enable row level security;
create policy home_stats_read on public.home_stats for select to anon, authenticated using (true);
create policy home_stats_admin on public.home_stats for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on table public.home_stats from public, anon, authenticated;
grant select on public.home_stats to anon, authenticated;
grant update(value, label, caption) on public.home_stats to authenticated;
grant all on public.home_stats to service_role;
commit;
