-- =============================================================
-- Migration 056: ฝังข้อมูลสาขา (branch) ลง machines.config → หน้า /branches ดึงสด (data-driven)
-- =============================================================
-- เดิมหน้า /branches hardcode 11 สาขาในโค้ด → เพิ่มตู้ใหม่ (เช่น pf01 ไอคอนสยาม) แล้วไม่ขึ้นเอง
-- แก้: เก็บ display_name/floor/landmark/maps/order/public ใน config.branch
--      หน้า /branches (app/branches/page.jsx) filter branch.public + sort order → ISR 60s
-- เพิ่มตู้ใหม่ครั้งหน้า: แค่ใส่ config.branch → สาขาขึ้นเอง ไม่ต้องแก้โค้ด
--
-- หมายเหตุ: ตู้ที่ site เดียวกัน (wwv08 = บางกะปิ เดียวกับ wwv02) ไม่ใส่ branch → ไม่ขึ้นซ้ำ
-- merge แบบ config || jsonb (ไม่ทับ key เดิม เช่น machine_id_vendor)
-- =============================================================

UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เดอะมอลล์บางแค','floor','ชั้น 3','landmark','ตรงข้าม Harborland','maps','เดอะมอลล์ บางแค','order',1,'public',true)) WHERE machine_id='chukes01';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลพระราม 2','floor','ชั้น 4','landmark','หน้าจุดขายป๊อบคอร์น ชั้นโรงหนัง','maps','เซ็นทรัล พระราม 2','order',2,'public',true)) WHERE machine_id='chukes02';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลชลบุรี','floor','ชั้น 4','landmark','หน้าลิฟต์ ชั้นโรงหนัง','maps','เซ็นทรัล ชลบุรี','order',3,'public',true)) WHERE machine_id='chukes04';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลพระราม 9','floor','ชั้น 7','landmark','ด้านข้างร้าน โอ้กะจู้','maps','เซ็นทรัล พระราม 9','order',4,'public',true)) WHERE machine_id='chukes03';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลรามอินทรา','floor','ชั้น 3','landmark','ติดบันไดเลื่อนทางขึ้น บริเวณแถวร้าน AKA','maps','เซ็นทรัล รามอินทรา','order',5,'public',true)) WHERE machine_id='wwv01';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เดอะมอลล์บางกะปิ','floor','ชั้น 3','landmark','ก่อนถึงฟิตเนสเฟิร์ส','maps','เดอะมอลล์ บางกะปิ','order',6,'public',true)) WHERE machine_id='wwv02';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลศาลายา','floor','ชั้น 3','landmark','หน้าลิฟต์ หลัง HACHIBAN RAMEN','maps','เซ็นทรัล ศาลายา','order',7,'public',true)) WHERE machine_id='wwv03';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลเวสต์เกต','floor','ชั้น 2','landmark','หน้าห้องน้ำ ข้าง Super Sport','maps','เซ็นทรัล เวสต์เกต','order',8,'public',true)) WHERE machine_id='wwv04';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','ซีคอนบางแค','floor','ชั้น 4','landmark','ด้านหลัง MK','maps','ซีคอนสแควร์ บางแค','order',9,'public',true)) WHERE machine_id='wwv05';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลพระราม 2','floor','ชั้น G','landmark','ติดบันไดเลื่อน หน้า BreadTalk','maps','เซ็นทรัล พระราม 2','order',10,'public',true)) WHERE machine_id='wwv06';
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','เซ็นทรัลเวสต์วิลล์','floor','ชั้น 1','landmark','ฝั่งลานจอดรถ','maps','เซ็นทรัล เวสต์วิลล์','order',11,'public',true)) WHERE machine_id='wwv07';
-- ไอคอนสยาม (Payif) — floor/landmark ยังไม่มี (รอแอดมิน) · โชว์ชื่อ + ปุ่มแผนที่ได้เลย
UPDATE machines SET config = config || jsonb_build_object('branch', jsonb_build_object(
  'display_name','ไอคอนสยาม','floor','','landmark','','maps','ICONSIAM','order',12,'public',true)) WHERE machine_id='pf01';
