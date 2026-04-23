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
export const CHART_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4"]

export const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

export const SKU_SERIES_ORDER = { OP: 0, PRB: 1, EB: 2 }

export const UNIT_LABEL = { pack: "ซอง", box: "กล่อง", cotton: "Cotton" }
