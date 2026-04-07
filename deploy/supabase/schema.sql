-- ================================================================
-- DivisionX Card — Supabase Schema (v2 - corrected)
-- วิธีใช้: Copy ทั้งหมด → วางใน Supabase SQL Editor → Run
-- ================================================================

-- ── 1. MACHINES ───────────────────────────────────────────────
create table if not exists machines (
  id           serial primary key,
  machine_id   text unique not null,
  name         text not null,
  location     text,
  status       text not null default 'active'
);

-- ── 2. SKUS ───────────────────────────────────────────────────
create table if not exists skus (
  id               serial primary key,
  sku_id           text unique not null,
  name             text not null,
  series           text not null,
  packs_per_box    int  not null default 12,
  boxes_per_cotton int  not null default 12,
  sell_price       numeric(10,2) not null default 0,
  cost_price       numeric(10,2) not null default 0,
  is_active        boolean not null default true
);

-- ── 3. STOCK IN ───────────────────────────────────────────────
create table if not exists stock_in (
  id             serial primary key,
  sku_id         text not null references skus(sku_id),
  source         text not null,
  unit           text not null default 'pack',
  quantity       int  not null check (quantity > 0),
  quantity_packs int  not null check (quantity_packs > 0),
  unit_cost      numeric(10,2) not null default 0,
  total_cost     numeric(12,2) not null default 0,
  purchased_at   timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now()
);

-- ── 4. STOCK OUT ──────────────────────────────────────────────
create table if not exists stock_out (
  id             serial primary key,
  sku_id         text not null references skus(sku_id),
  machine_id     text not null references machines(machine_id),
  quantity_packs int  not null check (quantity_packs > 0),
  withdrawn_at   timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now()
);

-- ── 5. SALES ──────────────────────────────────────────────────
-- sale_key = transaction_id + '-' + line_index (แก้ปัญหา 1 transaction มีหลาย SKU)
-- ตัวอย่าง: "019d679c06b77183-0", "019d679c06b77183-1"
create table if not exists sales (
  id               serial primary key,
  sale_key         text unique not null,  -- transaction_id-line_index
  transaction_id   text not null,
  machine_id       text not null references machines(machine_id),
  sku_id           text not null references skus(sku_id),
  product_name_raw text,
  quantity_sold    int  not null default 1,
  grand_total      numeric(10,2) not null default 0,
  sold_at          timestamptz not null,
  synced_at        timestamptz not null default now()
);

-- ── INDEX ─────────────────────────────────────────────────────
create index if not exists idx_sales_machine    on sales(machine_id);
create index if not exists idx_sales_sku        on sales(sku_id);
create index if not exists idx_sales_sold_at    on sales(sold_at desc);
create index if not exists idx_sales_txn        on sales(transaction_id);
create index if not exists idx_stock_in_sku     on stock_in(sku_id);
create index if not exists idx_stock_out_sku    on stock_out(sku_id);
create index if not exists idx_stock_out_mach   on stock_out(machine_id);

-- ── VIEW: สต็อกคงเหลือ real-time ─────────────────────────────
create or replace view v_stock_balance as
select
  s.sku_id,
  s.name,
  s.series,
  s.sell_price,
  s.cost_price,
  coalesce(si.total_in,  0) as total_packs_in,
  coalesce(so.total_out, 0) as total_packs_out,
  coalesce(si.total_in,  0) - coalesce(so.total_out, 0) as balance_packs
from skus s
left join (
  select sku_id, sum(quantity_packs) as total_in
  from stock_in group by sku_id
) si on si.sku_id = s.sku_id
left join (
  select sku_id, sum(quantity_packs) as total_out
  from stock_out group by sku_id
) so on so.sku_id = s.sku_id
where s.is_active = true;

-- ── VIEW: ยอดขายรายวัน ────────────────────────────────────────
create or replace view v_daily_sales as
select
  date(sold_at at time zone 'Asia/Bangkok') as sale_date,
  machine_id,
  sku_id,
  sum(quantity_sold) as total_qty,
  sum(grand_total)   as total_revenue
from sales
group by
  date(sold_at at time zone 'Asia/Bangkok'),
  machine_id,
  sku_id;

-- ── RLS Policies (ให้ Frontend อ่านเขียนได้) ─────────────────
alter table machines  enable row level security;
alter table skus      enable row level security;
alter table stock_in  enable row level security;
alter table stock_out enable row level security;
alter table sales     enable row level security;

-- อนุญาตให้ anon key อ่าน-เขียนได้ทุก table
create policy "allow_all_machines"  on machines  for all to anon using (true) with check (true);
create policy "allow_all_skus"      on skus      for all to anon using (true) with check (true);
create policy "allow_all_stock_in"  on stock_in  for all to anon using (true) with check (true);
create policy "allow_all_stock_out" on stock_out for all to anon using (true) with check (true);
create policy "allow_all_sales"     on sales     for all to anon using (true) with check (true);

-- ================================================================
-- SEED DATA
-- ================================================================

insert into machines (machine_id, name, location, status) values
  ('chukes01', 'ตู้ที่ 1 (chukes01)', 'Office', 'active'),
  ('chukes02', 'ตู้ที่ 2 (chukes02)', 'Office', 'active'),
  ('chukes03', 'ตู้ที่ 3 (chukes03)', 'Office', 'active'),
  ('chukes04', 'ตู้ที่ 4 (chukes04)', 'Office', 'active')
on conflict (machine_id) do nothing;

insert into skus (sku_id, name, series, packs_per_box, boxes_per_cotton) values
  ('OP 01',  'One Piece OP-01',            'OP',  12, 12),
  ('OP 02',  'One Piece OP-02',            'OP',  12, 12),
  ('OP 03',  'One Piece OP-03',            'OP',  12, 12),
  ('OP 04',  'One Piece OP-04',            'OP',  12, 12),
  ('OP 05',  'One Piece OP-05',            'OP',  12, 12),
  ('OP 06',  'One Piece OP-06',            'OP',  12, 12),
  ('OP 07',  'One Piece OP-07',            'OP',  12, 12),
  ('OP 08',  'One Piece OP-08',            'OP',  12, 12),
  ('OP 09',  'One Piece OP-09',            'OP',  12, 12),
  ('OP 10',  'One Piece OP-10',            'OP',  12, 12),
  ('OP 11',  'One Piece OP-11',            'OP',  12, 12),
  ('OP 12',  'One Piece OP-12',            'OP',  12, 12),
  ('OP 13',  'One Piece OP-13',            'OP',  12, 12),
  ('OP 14',  'One Piece OP-14',            'OP',  12, 12),
  ('OP 15',  'One Piece OP-15',            'OP',  12, 12),
  ('PRB 01', 'One Piece Premium Booster 01','PRB', 10, 12),
  ('PRB 02', 'One Piece Premium Booster 02','PRB', 10, 12),
  ('EB 01',  'One Piece Extra Booster 01',  'EB',  12, 12),
  ('EB 02',  'One Piece Extra Booster 02',  'EB',  12, 12),
  ('EB 03',  'One Piece Extra Booster 03',  'EB',  12, 12),
  ('EB 04',  'One Piece Extra Booster 04',  'EB',  12, 12)
on conflict (sku_id) do nothing;
