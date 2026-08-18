import { Composition } from "remotion"
import { PackReveal } from "./PackReveal"
import { PackHype } from "./PackHype"

// ทะเบียนวิดีโอทั้งหมด — เพิ่มคลิปใหม่ให้เพิ่ม <Composition> ที่นี่
//
// ขนาด 1080×1920 (9:16) เพราะปลายทางคือ Reels / TikTok ซึ่งเป็นที่ที่กลุ่มลูกค้าเราอยู่
// ถ้าจะทำลง Facebook feed แบบจัตุรัส ให้เพิ่ม composition ใหม่ ไม่ต้องแก้ตัวเดิม
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PackReveal"
        component={PackReveal}
        durationInFrames={180}   // 6 วินาทีที่ 30fps — ความยาวที่คนดูจนจบบนฟีด
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          headline: "OP-16 เข้าตู้แล้ว",
          sub: "กดเองหน้าตู้ ลุ้นเองสด ๆ",
          // รูปซองจริงจากคลังของเรา — ห้ามใช้ภาพที่ AI วาดขึ้นเอง
          packUrl:
            "https://xethnqqmpvlpmafvphky.supabase.co/storage/v1/object/public/sku-images/OP_16-pack-1782462123902.webp",
        }}
      />
      {/* ตัวที่ใช้จริง — ฟุตเทจกดตู้จริงเป็นแกน ตัดเป็น 3 จังหวะ
          720x1280 ไม่ใช่ 1080x1920 เพราะฟุตเทจต้นฉบับกว้างแค่ 464px ขยายเกินนี้จะเบลอชัด */}
      <Composition
        id="PackHype"
        component={PackHype}
        durationInFrames={180}
        fps={30}
        width={720}
        height={1280}
        defaultProps={{
          headline: "OP-16 เข้าตู้แล้ว",
          sub: "กดเองหน้าตู้ ลุ้นเองสด ๆ",
          cta: "เช็กหน้าตู้ใกล้บ้าน",
          packUrl:
            "https://xethnqqmpvlpmafvphky.supabase.co/storage/v1/object/public/sku-images/OP_16-pack-1782462123902.webp",
          footage: "how-to-buy.mp4",
        }}
      />
    </>
  )
}
