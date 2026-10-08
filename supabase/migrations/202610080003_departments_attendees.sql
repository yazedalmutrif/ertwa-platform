-- Run once in the SQL Editor after 202610080002_admin_content.sql.
-- Admin-managed departments (hidden, never deleted) and phone numbers for event attendees.
begin;

alter table public.departments
  alter column slug set default ('dept-' || substr(md5(random()::text), 1, 8)),
  add column page_title text not null default '' check (char_length(page_title) <= 200),
  add column details text not null default '' check (char_length(details) <= 2000),
  add column tasks text not null default '' check (char_length(tasks) <= 2000),
  add column icon text not null default 'fa-layer-group' check (icon ~ '^fa-[a-z0-9-]{1,40}$'),
  add column image text not null default ''
    check (image = '' or image ~ '^images/[A-Za-z0-9() ._-]{1,100}$'),
  add column active boolean not null default true,
  add constraint departments_labels_length
    check (char_length(trim(name)) between 1 and 100 and char_length(trim(display_name)) between 1 and 150);

-- Seed with the departments page wording; tasks are stored one per line.
update public.departments d set page_title = v.page_title, details = v.details, tasks = v.tasks,
  icon = v.icon, image = v.image
from (values
  ('tech', 'القسم التقني (Technology Department)', 'يهتم هذا القسم ببناء وتطوير البنية البرمجية التحتية للمنصة، وإدارة الأنظمة والخدمات الرقمية، وتوفير الحلول المتكاملة لجميع مشاريع المنصة والمجتمع.',
    array_to_string(array['تطوير وتحديث الموقع الإلكتروني والأنظمة البرمجية للمنصة بانتظام.', 'بناء وإعداد النماذج والأسئلة الديناميكية للجان الانضمام والقبول.', 'ربط واجهات المستخدم وتأمين تدفق البيانات الرقمية وضمان تكاملها.'], E'\n'),
    'fa-code', 'images/Overlay(6).svg'),
  ('design', 'قسم التصميم (Design Department)', 'الواجهة البصرية والهوية الجاذبة للمنصة. يتولى هذا القسم تصميم واجهات المستخدم والمخرجات والمنشورات لضمان تجربة مستخدم مذهلة وهوية بصرية موحدة واحترافية.',
    array_to_string(array['ابتكار وتطوير الهوية البصرية والشعارات الخاصة بالمبادرات التابعة للمنصة.', 'تصميم واجهات المستخدم (UI/UX) للموقع الإلكتروني والخدمات الرقمية المستحدثة.', 'إعداد قوالب وتصاميم منشورات شبكات التواصل الاجتماعي بجودة ومعايير عالية.'], E'\n'),
    'fa-palette', 'images/Overlay(1).svg'),
  ('events', 'قسم الفعاليات والعلاقات (Events & Relations)', 'المحرك اللوجستي لتنظيم وإدارة كافة الورش والمؤتمرات التقنية (الواقعية وعن بُعد)، والتواصل مع المتحدثين وبناء شراكات استراتيجية مثمرة مع الجهات الخارجية المعتمدة.',
    array_to_string(array['جدولة والتخطيط اللوجستي والزمني لكافة الورش واللقاءات التدريبية.', 'التواصل الاستباقي مع المتحدثين والخبراء التقنيين لإثراء المحتوى الممتد للجمهور.', 'بناء قنوات الشراكة الاستراتيجية وتوسيع نطاق التعاون المؤسسي الرقمي.'], E'\n'),
    'fa-calendar-days', 'images/Overlay(2).svg'),
  ('quality', 'قسم المتابعة والتطوير (Quality & Follow-up)', 'صمام الأمان والجودة لضمان مخرجات ذات معايير عالية. يتابع هذا القسم سير عمل اللجان والالتزام بالخطط الزمنية وتطوير الأنظمة الداخلية للمنصة بصفة مستمرة.',
    array_to_string(array['مراجعة جودة المخرجات الرقمية للتأكد من مطابقتها للمعايير قبل النشر العلني.', 'الإشراف على معدلات التزام الأعضاء بالمهام الموكلة إليهم والخطط الزمنية للجان.', 'إعداد التقارير الدورية التشغيلية وصياغة التوصيات التطويرية للإدارة التنفيذية.'], E'\n'),
    'fa-chart-line', 'images/Overlay(3).svg'),
  ('media', 'قسم الإعلام والإنتاج المرئي (Media Department)', 'صوت المنصة وصورتها في الفضاء الرقمي، يختص بإنتاج المواد المرئية، المونتاج، التصوير، التغطيات الحية للفعاليات، وإدارة الحسابات الرسمية على شبكات التواصل.',
    array_to_string(array['توثيق وتصوير كافة الفعاليات واللقاءات (الواقعية والافتراضية) الخاصة بالمنصة.', 'إدارة المونتاج وتطوير المواد المرئية ومقاطع الموشن جرافيك والتعليق الصوتي.', 'إدارة الحسابات الرسمية وجدولة التغطيات المباشرة لضمان التواجد الرقمي الفعّال.'], E'\n'),
    'fa-camera-retro', 'images/Overlay(4).svg'),
  ('content', 'قسم صناعة وتحرير المحتوى (Content Department)', 'صياغة وتبسيط المفاهيم المعقدة، حيث يتولى الفريق كتابة الثريدات التقنية، الأدلة المعرفية والمناهج التعليمية بأسلوب مبسط، جذاب، وقريب لوعي وثقافة المجتمع.',
    array_to_string(array['كتابة المحتوى الثقافي والثريدات المعرفية المتخصصة لمنصة X.', 'صياغة السيناريوهات والنصوص التشويقية والإعلانية للفعاليات والخدمات الرقمية.', 'إعداد وتحرير الأدلة والمناهج الحقيبية للورش التدريبية بصورة مبسطة ومفهومة.'], E'\n'),
    'fa-pen-nib', 'images/Overlay(5).svg')
) as v(slug, page_title, details, tasks, icon, image)
where d.slug = v.slug;

-- Deleting means hiding (active = false), so past applications keep their department.
revoke delete on public.departments from authenticated;

-- Signups can only join a department that is still shown on the site.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if metadata->>'department_slug' is not null and not exists (
    select 1 from public.departments where slug = metadata->>'department_slug' and active) then
    raise exception 'اللجنة غير متاحة' using errcode = 'P0001';
  end if;
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

alter table public.event_registrations
  add column phone text check (phone is null or phone ~ '^\+?[0-9]{8,15}$');

-- Registration now records a phone number; registering again updates it.
drop function public.register_for_event(uuid);
create function public.register_for_event(p_event_id uuid, p_phone text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  selected_event public.events;
  registration_id uuid;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;
  if p_phone is null or p_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception 'رقم الجوال غير صحيح' using errcode = '22023';
  end if;
  select * into selected_event from public.events where id = p_event_id for update;
  if not found or not selected_event.published then
    raise exception 'الفعالية غير متاحة' using errcode = 'P0001';
  end if;
  select id into registration_id from public.event_registrations
    where event_id = p_event_id and user_id = auth.uid();
  if found then
    update public.event_registrations set phone = p_phone where id = registration_id;
    return registration_id;
  end if;
  if (selected_event.date + selected_event.time) at time zone 'Asia/Riyadh' <= now() then
    raise exception 'انتهى وقت التسجيل لهذه الفعالية' using errcode = 'P0001';
  end if;
  if selected_event.capacity is not null and
    (select count(*) from public.event_registrations where event_id = p_event_id) >= selected_event.capacity then
    raise exception 'اكتمل عدد المقاعد المتاحة' using errcode = 'P0001';
  end if;
  insert into public.event_registrations(event_id, user_id, phone)
    values (p_event_id, auth.uid(), p_phone) returning id into registration_id;
  return registration_id;
end;
$$;
revoke all on function public.register_for_event(uuid, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, text) to authenticated;
commit;
