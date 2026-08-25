// ─────────────────────────────────────────────
// STATIC SKU DATA (ราคา/ต้นทุน)
// ─────────────────────────────────────────────
export const SKUS = [
  { sku_id:"OP 01",  name:"One Piece OP-01",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 02",  name:"One Piece OP-02",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 03",  name:"One Piece OP-03",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 04",  name:"One Piece OP-04",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 05",  name:"One Piece OP-05",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 06",  name:"One Piece OP-06",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 07",  name:"One Piece OP-07",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 08",  name:"One Piece OP-08",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 09",  name:"One Piece OP-09",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 10",  name:"One Piece OP-10",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 11",  name:"One Piece OP-11",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 12",  name:"One Piece OP-12",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 13",  name:"One Piece OP-13",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 14",  name:"One Piece OP-14",    series:"OP",  packs_per_box:24, sell_price:80,  cost_price:55 },
  { sku_id:"OP 15",  name:"One Piece OP-15",    series:"OP",  packs_per_box:24, sell_price:80,  cost_price:55 },
  { sku_id:"PRB 01", name:"Premium Booster 01", series:"PRB", packs_per_box:10, boxes_per_cotton:10, sell_price:150, cost_price:110 },
  { sku_id:"PRB 02", name:"Premium Booster 02", series:"PRB", packs_per_box:10, boxes_per_cotton:20, sell_price:180, cost_price:130 },
  { sku_id:"EB 01",  name:"Extra Booster 01",   series:"EB",  packs_per_box:24, sell_price:120, cost_price:85  },
  { sku_id:"EB 02",  name:"Extra Booster 02",   series:"EB",  packs_per_box:24, sell_price:120, cost_price:85  },
  { sku_id:"EB 03",  name:"Extra Booster 03",   series:"EB",  packs_per_box:24, sell_price:130, cost_price:90  },
  { sku_id:"EB 04",  name:"Extra Booster 04",   series:"EB",  packs_per_box:24, sell_price:130, cost_price:90  },
]

export const SERIES_COLOR = { OP: "#3b82f6", PRB: "#8b5cf6", EB: "#10b981" }
export const CHART_COLORS = [
  "#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4",
  "#ec4899","#84cc16","#f97316","#14b8a6","#a855f7","#eab308",
  "#22d3ee","#f43f5e",
]

export const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

export const SKU_SERIES_ORDER = { OP: 0, PRB: 1, EB: 2 }

// ลำดับ SKU สำหรับ "รายงานเตรียมของเติมตู้" เท่านั้น (ไม่ใช้กับตารางทำงานหรือหน้าอื่น)
// เรียงตามใบที่แอดมินใช้จริง เพราะคนเดินหยิบของไล่ตามลำดับนี้อยู่แล้ว
// ถ้าเรียงตามตัวอักษร EB จะขึ้นก่อน OP และ B29 ขึ้นก่อน FB ซึ่งสวนทางกับการหยิบของจริง
//
// ⚠️ SKU ที่ไม่อยู่ในรายการนี้ "ไม่หาย" — จะไปต่อท้ายเรียงตามตัวอักษร
//    (จงใจ เพื่อให้สินค้าใหม่ยังโผล่ในรายงานแม้ยังไม่ได้มาเพิ่มลำดับตรงนี้)
export const REFILL_REPORT_SKU_ORDER = [
  // ── One Piece ──
  "OP 01", "OP 02", "OP 03", "OP 04", "OP 05", "OP 06", "OP 07", "OP 08",
  "OP 09", "OP 10", "OP 11", "OP 12", "OP 13", "OP 14", "OP 15", "OP 16",
  "OP 17",          // ลงตู้ wwv03/04/07 · 25 ส.ค. 2026
  "PRB 01", "PRB 02",
  "EB 01", "EB 02", "EB 03", "EB 04",
  // ── Dragon Ball ── (FB 10-15 ปิดใช้งานอยู่ · ใส่ไว้ให้ลำดับถูกถ้าเปิดกลับมา)
  "FB 01", "FB 02", "FB 03", "FB 04", "FB 05", "FB 06", "FB 07", "FB 08", "FB 09",
  "FB 10", "FB 11", "FB 12", "FB 13", "FB 14", "FB 15",
  "B29",
  // ── Naruto ──
  "NRT Jin - 1", "NRT Jin - 2", "NRT Series - 01", "NRT Series - 02",
  // ── Pokemon ──
  "PKM Dream EX",   // ใบแอดมินเขียน "Mega Dream"
  "PKM Ghost",      // ใบแอดมินเขียน "M5 Abyss Eye"
  "PKM Ninja",
  // ── Solo Leveling ──
  "SLL UA 51",      // ใบแอดมินเขียน "Ua01"
  // ── Yu-Gi-Oh ──
  "YGH Chaos Origins",
  "YGH The Revals", // ชื่อจริงตอนนี้คือ "Yu-Gi-Oh The Rivals" (sku_id ยังเป็นคำเดิม)
  "YGH UT01",
  "YGH The Heroes", // ไม่มีในใบแอดมิน — ต่อท้ายกลุ่มไว้ไม่ให้ตกหล่น
  // ── Mobile Legends ──
  "MLBB HOD - 02",  // ใบแอดมินเขียน "HOD002"
  // ── Transformers ──
  "TF Overdrive 01",
  // ── My Little Pony ──
  "MLP SEA02",
  "MLP BP-01",      // ใบแอดมินเขียน "Booster Pack 01"
]

export const UNIT_LABEL = { pack: "ซอง", box: "กล่อง", cotton: "Cotton" }
