-- =============================================================
-- 引力场 · 完整数据库结构迁移脚本 (Schema DDL)
-- 生成时间：2026-08-19
-- 用途：在自建 Supabase 的 SQL Editor 中执行，重建所有表结构
-- 说明：
--   1) 本脚本只建「结构」不含「数据」，数据请单独导出导入
--   2) dblink / pg_stat_statements 为 Supabase 自带扩展，无需迁移
--   3) auth 库（users/identities 等）由 Supabase 自动创建，无需建表
--   4) 执行顺序：先建表 → 再建外键 → 再开 RLS → 再建策略
-- =============================================================

-- 扩展（自建 Supabase 通常已包含，如需可取消注释）
-- create extension if not exists "pg_stat_statements";
-- create extension if not exists "dblink";

-- =============================================================
-- 一、用户与会员
-- =============================================================

create table if not exists public.user_profiles (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  nickname text,
  avatar text,
  phone text,
  member_level_id bigint,
  growth_points integer default 0,
  total_points integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  referral_code text,
  member_expire_at timestamptz,
  referred_by uuid,
  primary key (id),
  unique (user_id)
);

create table if not exists public.member_levels (
  id bigserial primary key,
  name text not null,
  badge text,
  description text,
  price_monthly numeric(12,2) default 0,
  price_yearly numeric(12,2) default 0,
  benefits jsonb default '[]'::jsonb,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  points_yearly integer default 0,
  level_type text default 'paid'::text,
  annual_price numeric(12,2) default 0,
  points_threshold integer default 0,
  benefit_config jsonb
);

create table if not exists public.user_memberships (
  id bigserial primary key,
  user_id uuid not null,
  level_id bigint not null,
  source text not null default 'paid'::text,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  status text not null default 'active'::text,
  points_cost integer,
  order_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_logs (
  id bigserial primary key,
  user_id uuid,
  level_id bigint,
  action text not null,
  operator text,
  reason text,
  created_at timestamptz default now()
);

create table if not exists public.affiliates (
  id bigserial primary key,
  name text not null,
  phone text,
  commission_rate numeric(5,2) default 10.0,
  total_earnings numeric(12,2) default 0,
  status text default 'active'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  level text default 'general'::text,
  applied_at timestamptz,
  approved_at timestamptz,
  referred_count integer default 0,
  user_id uuid
);

-- =============================================================
-- 二、积分与分销
-- =============================================================

create table if not exists public.user_points (
  id bigserial primary key,
  user_id uuid not null unique,
  total_points integer default 0,
  available_points integer default 0,
  frozen_points integer default 0,
  lifetime_points integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.points_rules (
  id bigserial primary key,
  rule_key text not null unique,
  rule_name text not null,
  rule_type text not null,
  points_value numeric default 0,
  is_enabled boolean default true,
  scope text default 'all'::text,
  description text,
  sort_order integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.points_transactions (
  id bigserial primary key,
  user_id uuid not null,
  amount integer not null,
  type text not null,
  ref_id text,
  note text,
  created_at timestamptz not null default now(),
  balance_after integer,
  source text
);

create table if not exists public.point_products (
  id bigserial primary key,
  name text not null,
  description text,
  cover_image text,
  points_cost integer not null,
  stock integer default 0,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.distribution_settings (
  id bigserial primary key,
  key text not null unique,
  value text,
  updated_at timestamptz default now()
);

create table if not exists public.distribution_records (
  id bigserial primary key,
  inviter_id uuid not null,
  invitee_id uuid,
  course_id bigint,
  event_type text not null,
  reward_points integer not null default 0,
  status text not null default 'rewarded'::text,
  created_at timestamptz not null default now()
);

create table if not exists public.distribution_earnings (
  id bigserial primary key,
  distributor_id bigint,
  referred_user_id uuid,
  order_id bigint,
  target_type text,
  target_id bigint,
  amount numeric(12,2) default 0,
  points integer default 0,
  status text default 'pending'::text,
  settled_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.withdrawal_requests (
  id bigserial primary key,
  distributor_id bigint,
  method text default 'cash'::text,
  amount numeric(12,2) default 0,
  points integer default 0,
  status text default 'pending'::text,
  note text,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- =============================================================
-- 三、课程与内容
-- =============================================================

create table if not exists public.course_categories (
  id bigserial primary key,
  name text not null,
  description text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.courses (
  id bigserial primary key,
  title text not null,
  subtitle text,
  description text,
  cover_image text,
  category_id bigint,
  course_type text default 'video'::text,
  price numeric(12,2) default 0,
  original_price numeric(12,2),
  is_free boolean default false,
  is_member_only boolean default false,
  status text default 'draft'::text,
  sort_order integer default 0,
  total_lessons integer default 0,
  duration_minutes integer default 0,
  instructor_name text,
  instructor_avatar text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  column_id bigint,
  type varchar(255) default 'single_video'::varchar,
  member_price numeric(10,2),
  member_level_required integer default 0,
  is_free_trial boolean default false,
  trial_duration integer default 300,
  is_published boolean default true,
  is_featured boolean default false,
  view_count integer default 0,
  sold_count integer default 0,
  created_by bigint
);

create table if not exists public.chapters (
  id bigserial primary key,
  course_id bigint not null,
  title text not null,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lessons (
  id bigserial primary key,
  chapter_id bigint not null,
  course_id bigint not null,
  title text not null,
  lesson_type text default 'video'::text,
  video_url text,
  audio_url text,
  content text,
  duration_minutes integer default 0,
  is_free_preview boolean default false,
  sort_order integer default 0,
  status text default 'draft'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.columns (
  id bigint not null primary key,
  title varchar(255) not null,
  subtitle varchar(255),
  cover_image varchar(512),
  description text,
  price numeric(10,2) not null default 0,
  member_price numeric(10,2),
  member_level_required integer default 0,
  is_published boolean default true,
  sort_order integer default 0,
  view_count integer default 0,
  sold_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.column_courses (
  id bigint not null primary key,
  column_id bigint not null,
  course_id bigint not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.content_categories (
  id bigserial primary key,
  name varchar(100) not null,
  sort_order integer default 0,
  icon varchar(255),
  description varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.content_chapters (
  id bigserial primary key,
  name varchar(100) not null,
  category_id bigint,
  sort_order integer default 0,
  description varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.content_assets (
  id bigserial primary key,
  asset_type varchar(20) not null,
  title varchar(255) not null,
  category varchar(100),
  chapter varchar(100),
  sort_order integer default 0,
  content_text text,
  audio_url varchar(512),
  audio_duration integer,
  audio_size bigint,
  video_url varchar(512),
  video_duration integer,
  video_size bigint,
  video_cover varchar(512),
  is_free_preview boolean default false,
  status varchar(20) not null default 'draft'::varchar,
  uploaded_by bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  category_id bigint,
  chapter_id bigint
);

create table if not exists public.course_content_units (
  id bigint not null primary key,
  course_id bigint not null,
  section_title varchar(255),
  unit_type varchar(50) not null,
  unit_title varchar(255) not null,
  sort_order integer not null default 0,
  is_free boolean default false,
  content_text text,
  audio_url varchar(512),
  audio_duration integer default 0,
  video_url varchar(512),
  video_duration integer default 0,
  video_cover varchar(512),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.course_content_assets (
  id bigserial primary key,
  course_id bigint not null,
  asset_id bigint not null,
  sort_order integer not null default 0,
  is_free_trial boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.user_learning_progress (
  id bigint not null primary key,
  user_id uuid not null,
  course_id bigint not null,
  content_unit_id bigint not null,
  progress_percent numeric(5,2) default 0,
  video_watch_time integer default 0,
  is_completed boolean default false,
  completed_at timestamptz,
  last_access_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  asset_id bigint
);

-- =============================================================
-- 四、商品（商城主表）
-- =============================================================

create table if not exists public.products (
  id bigserial primary key,
  name text not null,
  cover_image text,
  description text,
  category text,
  price numeric(12,2) default 0,
  member_price numeric(12,2),
  points_required integer default 0,
  points_plus_price numeric(12,2),
  stock integer default '-1'::integer,
  is_virtual boolean default false,
  delivery_content text,
  is_published boolean default true,
  sort_order integer default 0,
  view_count integer default 0,
  sold_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.product_categories (
  id bigserial primary key,
  name text not null,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_items (
  id bigserial primary key,
  name text not null,
  category_id bigint,
  status text not null default 'draft'::text,
  description text,
  pricing_mode integer default 0,
  currency text not null default 'USD'::text,
  price numeric(12,2) default 0,
  stock integer default 0,
  discount_enabled boolean not null default false,
  discount_price numeric(12,2),
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id bigserial primary key,
  product_id bigint not null,
  name text not null,
  options jsonb not null default '[]'::jsonb,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_skus (
  id bigserial primary key,
  product_id bigint not null,
  label text,
  options jsonb not null default '[]'::jsonb,
  price numeric(12,2) default 0,
  stock integer default 0,
  discount_enabled boolean not null default false,
  discount_price numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.product_custom_fields (
  id bigserial primary key,
  name text not null,
  field_type text not null default 'text'::text,
  options jsonb default '[]'::jsonb,
  required boolean not null default false,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_custom_values (
  id bigserial primary key,
  product_id bigint not null,
  field_id bigint not null,
  value text default ''::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, field_id)
);

-- =============================================================
-- 五、订单
-- =============================================================

create table if not exists public.order_headers (
  id bigserial primary key,
  customer_id text,
  status text,
  customer_notes text,
  admin_notes text,
  tracking_number text,
  currency text not null default 'USD'::text,
  shipping_total numeric(12,2) default 0,
  tax_total numeric(12,2) default 0,
  subtotal_items numeric(12,2) default 0,
  discount_price numeric(12,2) default 0,
  payment_provider text,
  checkout_session_id text,
  payment_id text,
  recipient jsonb not null default ''::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  points_total integer
);

create table if not exists public.order_items (
  id bigserial primary key,
  order_id bigint not null,
  product_id text not null,
  product_name text not null,
  sku_id text,
  sku_label text,
  quantity integer not null default 1,
  unit_price numeric(12,2) not null,
  final_price numeric(12,2) default 0,
  subtotal numeric(12,2) default 0,
  created_at timestamptz not null default now(),
  points integer
);

create table if not exists public.payment_configs (
  id bigserial primary key,
  provider text not null,
  config_key text not null,
  config_value text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider, config_key)
);

-- =============================================================
-- 六、AI 智能体
-- =============================================================

create table if not exists public.ai_models (
  id bigserial primary key,
  name varchar(100) not null,
  model_code varchar(50) not null,
  provider varchar(50) not null,
  api_endpoint varchar(512),
  api_key varchar(256),
  default_temp numeric(3,2) default 0.70,
  default_max_tokens integer default 2048,
  is_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agents (
  id bigserial primary key,
  name varchar(100) not null,
  alias varchar(50),
  category varchar(50),
  icon varchar(512),
  description text,
  status varchar(20) default 'draft'::varchar,
  sort_order integer default 0,
  view_count integer default 0,
  used_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  agent_type varchar(20) default 'tool'::varchar,
  short_desc varchar(255),
  avatar varchar(512),
  tags jsonb default '[]'::jsonb,
  model_id bigint,
  temperature numeric(3,2) default 0.70,
  max_tokens integer default 2048
);

create table if not exists public.agent_configs (
  id bigserial primary key,
  agent_id bigint not null,
  model_id bigint,
  c_library_id bigint,
  d_library_id bigint,
  temperature numeric(3,2) default 0.70,
  max_tokens integer default 2048,
  system_prompt text,
  question_display_mode varchar(20) default 'step_by_step'::varchar,
  is_required_all boolean default true,
  scoring_rule jsonb,
  archive_timing varchar(20) default 'auto'::varchar,
  archive_fields jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agent_consultant_configs (
  id bigserial primary key,
  agent_id bigint not null,
  role_definition text,
  communication_style varchar(50),
  opening_greeting text,
  address_term varchar(50),
  c_library_files jsonb default '[]'::jsonb,
  k_library_files jsonb default '[]'::jsonb,
  q_library_files jsonb default '[]'::jsonb,
  d_library_file varchar(512),
  workflow_sop text,
  stage_definition text,
  follow_up_rules text,
  boundary_constraints text,
  escalation_rules text,
  data_write_rules text,
  output_format text,
  reference_scripts text,
  closing_template text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agent_tool_configs (
  id bigserial primary key,
  agent_id bigint not null,
  input_config jsonb,
  c_library_rules jsonb default '[]'::jsonb,
  k_library_materials jsonb default '[]'::jsonb,
  output_type varchar(30),
  output_custom_rules text,
  boundary_constraints text,
  archive_rules text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agent_pricing (
  id bigserial primary key,
  agent_id bigint not null,
  access_type varchar(20) default 'all'::varchar,
  member_level_required integer default 0,
  price_type varchar(20) default 'free'::varchar,
  price numeric(10,2) default 0,
  member_price numeric(10,2) default 0,
  free_quota integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agent_share_configs (
  id bigserial primary key,
  agent_id bigint not null,
  share_title varchar(200),
  share_desc varchar(255),
  share_image varchar(512),
  enable_distribution boolean default false,
  commission_rate numeric(5,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agent_ui_configs (
  id bigserial primary key,
  agent_id bigint not null,
  theme_color varchar(20) default 'brand'::varchar,
  welcome_title varchar(200),
  welcome_desc text,
  welcome_media varchar(512),
  btn_text varchar(50) default '开始测评'::varchar,
  show_radar boolean default true,
  show_score_detail boolean default true,
  show_k_recommend boolean default true,
  show_suggestions boolean default true,
  ending_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agent_usage_logs (
  id bigserial primary key,
  agent_id bigint,
  user_id bigint,
  session_id varchar(64),
  c_score jsonb,
  k_recommendations jsonb,
  ai_report jsonb,
  d_archive_id bigint,
  duration integer default 0,
  status varchar(20) default 'started'::varchar,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_call_logs (
  id bigserial primary key,
  tool_id bigint not null,
  user_id text,
  input_text text,
  output_text text,
  tokens_used integer default 0,
  cost numeric(10,4) default 0,
  created_at timestamptz default now()
);

create table if not exists public.ai_tools (
  id bigserial primary key,
  name text not null,
  description text,
  icon text,
  category text default 'chat'::text,
  prompt_template text,
  is_free boolean default true,
  price_per_call numeric(12,2) default 0,
  daily_limit integer default 5,
  sort_order integer default 0,
  status text default 'active'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- =============================================================
-- 七、知识库（C/K/Q/D）
-- =============================================================

create table if not exists public.c_libraries (
  id bigserial primary key,
  file_name varchar(255) not null,
  file_path varchar(512) not null,
  file_type varchar(20) not null default 'capability'::varchar,
  capability_type varchar(20) default 'advisor'::varchar,
  content text,
  description varchar(255),
  tags jsonb default '[]'::jsonb,
  version varchar(20) default '1.0'::varchar,
  status varchar(20) default 'draft'::varchar,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.k_libraries (
  id bigserial primary key,
  file_name varchar(255) not null,
  file_path varchar(512) not null,
  k_type varchar(20) not null default 'product'::varchar,
  content text,
  tags jsonb default '[]'::jsonb,
  match_keywords jsonb default '[]'::jsonb,
  status varchar(20) default 'draft'::varchar,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.q_libraries (
  id bigserial primary key,
  file_name varchar(255) not null,
  file_path varchar(512) not null,
  q_type varchar(20) not null default 'questionnaire'::varchar,
  content text,
  fields jsonb default '[]'::jsonb,
  status varchar(20) default 'draft'::varchar,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.d_libraries (
  id bigserial primary key,
  file_name varchar(255) not null,
  file_path varchar(512) not null,
  template_type varchar(30) not null default 'client_profile'::varchar,
  schema_data jsonb,
  description varchar(255),
  status varchar(20) default 'draft'::varchar,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.d_archives (
  id bigserial primary key,
  d_library_id bigint not null,
  user_id text,
  agent_id bigint,
  archive_data jsonb,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================
-- 八、测评
-- =============================================================

create table if not exists public.assessments (
  id bigserial primary key,
  title text not null,
  description text,
  cover_image text,
  status text default 'draft'::text,
  ai_enabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.assessment_questions (
  id bigserial primary key,
  assessment_id bigint not null,
  question_text text not null,
  question_type text default 'single'::text,
  options jsonb default '[]'::jsonb,
  score integer default 0,
  weight numeric(4,2) default 1.0,
  sort_order integer default 0
);

create table if not exists public.assessment_results (
  id bigserial primary key,
  assessment_id bigint not null,
  min_score integer default 0,
  max_score integer default 100,
  title text not null,
  description text,
  report_template text,
  sort_order integer default 0
);

-- =============================================================
-- 九、活动与直播
-- =============================================================

create table if not exists public.activities (
  id bigserial primary key,
  title text not null,
  description text,
  cover_image text,
  activity_type text default 'online'::text,
  location text,
  start_time timestamptz,
  end_time timestamptz,
  price numeric(12,2) default 0,
  status text default 'upcoming'::text,
  max_participants integer default 0,
  registered_count integer default 0,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.activity_registrations (
  id bigserial primary key,
  activity_id bigint not null,
  name text not null,
  phone text,
  email text,
  extra_fields jsonb,
  status text default 'pending'::text,
  created_at timestamptz default now()
);

create table if not exists public.activity_checkins (
  id bigserial primary key,
  registration_id bigint not null,
  activity_id bigint not null,
  checkin_time timestamptz default now()
);

create table if not exists public.live_sessions (
  id bigserial primary key,
  title text not null,
  description text,
  cover_image text,
  start_time timestamptz,
  end_time timestamptz,
  stream_url text,
  replay_url text,
  status text default 'upcoming'::text,
  is_public boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================
-- 十、站点配置
-- =============================================================

create table if not exists public.site_settings (
  id bigserial primary key,
  key text not null unique,
  value text,
  type text default 'string'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.banners (
  id bigserial primary key,
  title text not null,
  subtitle text,
  image_url text,
  link_url text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.navigation (
  id bigserial primary key,
  name text not null,
  path text not null,
  icon text,
  sort_order integer default 0,
  is_active boolean default true,
  is_external boolean default false,
  parent_id bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.homepage_sections (
  id bigserial primary key,
  section_type text not null,
  title text,
  config jsonb,
  sort_order integer default 0,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================
-- 二、外键约束
-- =============================================================

alter table public.user_profiles
  add constraint user_profiles_member_level_id_fkey foreign key (member_level_id) references public.member_levels(id);

alter table public.affiliates
  add constraint affiliates_user_id_fkey foreign key (user_id) references public.user_profiles(user_id) on delete set null;

alter table public.courses
  add constraint fk_courses_category foreign key (category_id) references public.course_categories(id);

alter table public.chapters
  add constraint chapters_course_id_fkey foreign key (course_id) references public.courses(id);

alter table public.lessons
  add constraint lessons_chapter_id_fkey foreign key (chapter_id) references public.chapters(id),
  add constraint lessons_course_id_fkey foreign key (course_id) references public.courses(id);

alter table public.course_content_assets
  add constraint course_content_assets_asset_id_fkey foreign key (asset_id) references public.content_assets(id);

alter table public.product_items
  add constraint product_items_category_id_fkey foreign key (category_id) references public.product_categories(id);

alter table public.product_variants
  add constraint product_variants_product_id_fkey foreign key (product_id) references public.product_items(id) on delete cascade;

alter table public.product_skus
  add constraint product_skus_product_id_fkey foreign key (product_id) references public.product_items(id) on delete cascade;

alter table public.product_custom_values
  add constraint product_custom_values_product_id_fkey foreign key (product_id) references public.product_items(id) on delete cascade,
  add constraint product_custom_values_field_id_fkey foreign key (field_id) references public.product_custom_fields(id) on delete cascade;

alter table public.order_items
  add constraint order_items_order_id_fkey foreign key (order_id) references public.order_headers(id);

alter table public.agents
  add constraint agents_model_id_fkey foreign key (model_id) references public.ai_models(id);

alter table public.agent_configs
  add constraint agent_configs_agent_id_fkey foreign key (agent_id) references public.agents(id);

alter table public.agent_consultant_configs
  add constraint fk_agent_consultant_configs_agent_id foreign key (agent_id) references public.agents(id);

alter table public.agent_tool_configs
  add constraint fk_agent_tool_configs_agent_id foreign key (agent_id) references public.agents(id);

alter table public.agent_pricing
  add constraint agent_pricing_agent_id_fkey foreign key (agent_id) references public.agents(id);

alter table public.agent_share_configs
  add constraint agent_share_configs_agent_id_fkey foreign key (agent_id) references public.agents(id);

alter table public.agent_ui_configs
  add constraint agent_ui_configs_agent_id_fkey foreign key (agent_id) references public.agents(id);

alter table public.assessment_questions
  add constraint assessment_questions_assessment_id_fkey foreign key (assessment_id) references public.assessments(id);

alter table public.assessment_results
  add constraint assessment_results_assessment_id_fkey foreign key (assessment_id) references public.assessments(id);

alter table public.activity_registrations
  add constraint activity_registrations_activity_id_fkey foreign key (activity_id) references public.activities(id);

alter table public.activity_checkins
  add constraint activity_checkins_registration_id_fkey foreign key (registration_id) references public.activity_registrations(id),
  add constraint activity_checkins_activity_id_fkey foreign key (activity_id) references public.activities(id);

alter table public.navigation
  add constraint navigation_parent_id_fkey foreign key (parent_id) references public.navigation(id);

-- =============================================================
-- 三、自定义函数
-- =============================================================

create or replace function public.increment_activity_reg_count(activity_id bigint)
returns void
language plpgsql
security definer
as $function$
begin
  update activities set registered_count = coalesce(registered_count, 0) + 1 where id = activity_id;
end;
$function$;

-- =============================================================
-- 四、开启 RLS（仅这 18 张表）
-- =============================================================

alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_items enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_skus enable row level security;
alter table public.product_custom_fields enable row level security;
alter table public.product_custom_values enable row level security;
alter table public.order_headers enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_configs enable row level security;
alter table public.point_products enable row level security;
alter table public.points_transactions enable row level security;
alter table public.user_memberships enable row level security;
alter table public.d_archives enable row level security;
alter table public.distribution_records enable row level security;
alter table public.homepage_sections enable row level security;

-- =============================================================
-- 五、RLS 策略（public 角色，与源库完全一致）
-- =============================================================

-- products
create policy "products_public_read" on public.products for select to public using (true);
create policy "products_public_insert" on public.products for insert to public with check (true);
create policy "products_public_update" on public.products for update to public using (true) with check (true);
create policy "products_public_delete" on public.products for delete to public using (true);

-- product_categories
create policy "product_categories_select" on public.product_categories for select to public using (true);

-- product_items
create policy "product_items_select" on public.product_items for select to public using (true);

-- product_variants
create policy "product_variants_select" on public.product_variants for select to public using (true);

-- product_skus
create policy "product_skus_select" on public.product_skus for select to public using (true);

-- product_custom_fields
create policy "product_custom_fields_select" on public.product_custom_fields for select to public using (true);

-- product_custom_values
create policy "product_custom_values_select" on public.product_custom_values for select to public using (true);

-- order_headers
create policy "order_headers_customer_select" on public.order_headers for select to public using (true);
create policy "order_headers_customer_insert" on public.order_headers for insert to public with check (true);
create policy "order_headers_customer_update" on public.order_headers for update to public using (true);

-- order_items
create policy "order_items_customer_select" on public.order_items for select to public using (true);
create policy "order_items_customer_insert" on public.order_items for insert to public with check (true);

-- payment_configs
create policy "anon_select_payment_configs" on public.payment_configs for select to public using (true);
create policy "service_write_payment_configs" on public.payment_configs for all to public using (true) with check (true);

-- point_products
create policy "anon select point_products" on public.point_products for select to public using (true);
create policy "anon insert point_products" on public.point_products for insert to public with check (true);
create policy "anon update point_products" on public.point_products for update to public using (true);

-- points_transactions
create policy "anon select points" on public.points_transactions for select to public using (true);
create policy "anon insert points" on public.points_transactions for insert to public with check (true);

-- user_memberships
create policy "anon select memberships" on public.user_memberships for select to public using (true);
create policy "anon insert memberships" on public.user_memberships for insert to public with check (true);
create policy "anon update memberships" on public.user_memberships for update to public using (true);

-- d_archives
create policy "anon_select_d_archives" on public.d_archives for select to public using (true);
create policy "anon_insert_d_archives" on public.d_archives for insert to public with check (true);

-- distribution_records
create policy "anon select distribution" on public.distribution_records for select to public using (true);
create policy "anon insert distribution" on public.distribution_records for insert to public with check (true);
create policy "anon update distribution" on public.distribution_records for update to public using (true);

-- homepage_sections
create policy "Allow all on homepage_sections" on public.homepage_sections for all to public using (true) with check (true);