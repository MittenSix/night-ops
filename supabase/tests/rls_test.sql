begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@example.test', '', '{}', '{"display_name":"Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lead@example.test', '', '{}', '{"display_name":"Lead"}', now(), now());

update public.profiles set role = 'lead' where id = '00000000-0000-0000-0000-000000000102';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.profiles), 1, 'members can read only their own profile');
select is((select count(*)::integer from public.training_state), 1, 'members can read only their own training state');
select lives_ok(
  $$update public.training_state set state = '{"packing":{"0":true}}' where user_id = '00000000-0000-0000-0000-000000000101'$$,
  'members can update their own progress'
);
select is((select count(*)::integer from public.announcements), 0, 'members can read announcements');
select throws_ok(
  $$insert into public.announcements (content, created_by) values ('Not allowed', '00000000-0000-0000-0000-000000000101')$$,
  '42501', null, 'members cannot publish announcements'
);
select lives_ok(
  $$insert into public.questions (content, created_by) values ('When is practice?', '00000000-0000-0000-0000-000000000101')$$,
  'members can ask questions as themselves'
);
select throws_ok(
  $$insert into public.questions (content, created_by) values ('Spoofed', '00000000-0000-0000-0000-000000000102')$$,
  '42501', null, 'members cannot post as another user'
);
select throws_ok(
  $$update public.profiles set role = 'lead' where id = '00000000-0000-0000-0000-000000000101'$$,
  '42501', null, 'members cannot promote themselves'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select is((select count(*)::integer from public.profiles), 2, 'leads can read member profiles');
select is((select count(*)::integer from public.training_state), 2, 'leads can read member training state');
select lives_ok(
  $$insert into public.announcements (content, created_by) values ('Practice moved', '00000000-0000-0000-0000-000000000102')$$,
  'leads can publish announcements as themselves'
);

select * from finish();
rollback;
