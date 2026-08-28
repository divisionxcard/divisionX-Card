// ทดสอบตัวอ่านบรรทัด FORMAT: ที่โมเดลเขียนบอกว่าเลือกรูปแบบไหน
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// ⚠️ อ้างจากตำแหน่งไฟล์สคริปต์เอง ไม่ใช่ path เครื่องใครเครื่องมัน
const ROOT = fileURLToPath(new URL("..", import.meta.url))
const src = readFileSync(`${ROOT}deploy/app/api/marketing/content/generate/route.js`, "utf8")
const fn = src.match(/function readFormatLine[\s\S]*?\n}/)[0]
const readFormatLine = new Function("return " + fn)()

const voice = { content_formats: [{ key: "story", label: "เล่าเรื่อง" }, { key: "compare", label: "เทียบให้เห็น" }] }
const FB = { key: "compare", label: "เทียบให้เห็น" }

const NL = "\n"
const cases = [
  [`FORMAT: story${NL}วันก่อนมีลูกค้าเดินมาถาม...`, "story"],
  [`format: story${NL}วันก่อน...`, "story"],
  [`  FORMAT:  story  ${NL}เนื้อหา`, "story"],
  [`FORMAT: ไม่รู้จัก${NL}เนื้อหา`, "compare"],
  [`FORMAT: story — เพราะมีลำดับเวลา${NL}เนื้อหา`, "story"],
  [`FORMAT: COMPARE${NL}เนื้อหา`, "compare"],
  [`เนื้อหาขึ้นก่อน${NL}FORMAT: story${NL}ต่อ`, "story"],
]

let bad = 0
for (const [inp, want] of cases) {
  const r = readFormatLine(inp, voice, FB)
  const gotKey = r.format?.key
  const stripped = !/FORMAT:/i.test(r.text)
  const ok = gotKey === want && stripped
  if (!ok) bad++
  console.log(`  ${ok ? "OK  " : "FAIL"} ${JSON.stringify(inp.slice(0, 36))} → ${gotKey} · ตัดออก=${stripped}`)
}

// ไม่มีบรรทัด FORMAT เลย — ต้องคืนข้อความเดิมทั้งดุ้นและใช้ตัวสำรอง
const none = readFormatLine(`ไม่มีบรรทัดนี้เลย${NL}เนื้อหา`, voice, FB)
const noneOk = none.format?.key === "compare" && none.text === `ไม่มีบรรทัดนี้เลย${NL}เนื้อหา`
if (!noneOk) bad++
console.log(`  ${noneOk ? "OK  " : "FAIL"} ไม่มีบรรทัด FORMAT → ${none.format?.key} · ข้อความไม่ถูกแตะ=${none.text.includes("ไม่มีบรรทัดนี้เลย")}`)

console.log(bad ? `${NL}❌ พลาด ${bad} เคส` : `${NL}✅ ผ่านทุกเคส`)
process.exit(bad ? 1 : 0)
