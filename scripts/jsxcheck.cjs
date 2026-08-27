// ตรวจ syntax JSX ด้วย babel ที่ Next vendor มาให้ (ไม่ต้องลงอะไรเพิ่ม)
// ใช้ตอน dev server ค้างจนยิง localhost ไม่ได้ — ดู skill dvx-web
//
// รัน: node scripts/jsxcheck.cjs deploy/components/Xxx.jsx deploy/app/api/.../route.js
// คืน exit 1 ถ้ามีไฟล์ไหน syntax พัง
const fs = require("fs")
const path = require("path")
// node_modules อยู่ที่ deploy/ ไม่ใช่ราก — อ้างจากตำแหน่งสคริปต์ จะได้รันจากที่ไหนก็ได้
const babel = require(path.join(__dirname, "..", "deploy",
  "node_modules/next/dist/compiled/babel/bundle.js"))
const parser = typeof babel.parser === "function" ? babel.parser() : babel.parser
let bad = 0
for (const f of process.argv.slice(2)) {
  try {
    parser.parse(fs.readFileSync(f, "utf8"), {
      sourceType: "module", plugins: ["jsx", "topLevelAwait"],
    })
    console.log("  OK   " + f)
  } catch (e) {
    bad++
    console.log("  FAIL " + f + "\n       " + String(e.message).split("\n")[0])
  }
}
process.exit(bad ? 1 : 0)
