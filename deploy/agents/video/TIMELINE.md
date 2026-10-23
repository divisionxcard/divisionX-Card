# สัญญาข้อมูล "ห้องตัดต่อ" (plan.engine = "timeline")

> 23 ต.ค. 2026 · เจ้าของ: "ทำหน้าโรงงานวิดีโอให้ใช้งานง่าย รองรับการตัดต่อได้ทุกรูปแบบ พร้อมรองรับการอัปโหลดไฟล์วิดีโอจากภายนอก"
> เลือกครบ 4 อย่าง: ตัด/ต่อ/เรียงคลิป · ตัวหนังสือ+ซับไทย · เสียงพากย์+เพลง · ซอง/โลโก้/แม่แบบ · ผู้ใช้: แอดมิน+ทีมการตลาด · เก็บไฟล์ตลอด

หน้าเว็บ (`/video/editor` · `components/edit/`) เขียนก้อนนี้ · `api/video/render` ตรวจแล้วจองงาน · runner เรียก `agents/video/hf_timeline.py`
— **แก้รูปทรงที่นี่ต้องแก้ทั้งสามที่พร้อมกัน**

```jsonc
{
  "project": "edit-20261023-ab12",        // a-z0-9-_ ≤ 64
  "engine": "timeline",
  "script": "…",                          // ตาราง video_jobs บังคับไม่ว่าง — ใช้บทพากย์ หรือข้อความแทนที่ถ้าไม่มีเสียงพากย์
  "edit_id": "e-…",                       // ร่างใน Storage marketing/video-edits/<edit_id>.json (เปิดมาแก้ต่อได้)
  "timeline": {
    "version": 1,
    "clips": [                            // แทร็กหลัก เล่นต่อกันตามลำดับ (ไม่มีช่องว่าง)
      { "id": "c1", "kind": "video", "src": "https://…/marketing/video-uploads/….mp4",
        "in": 0.0, "out": 5.2,            // ช่วงของไฟล์ที่ใช้ (วินาทีในไฟล์)
        "speed": 1.0,                     // 0.25–4 · ความยาวบนไทม์ไลน์ = (out-in)/speed
        "fit": "cover",                   // cover = เต็มจอ (ครอป) · contain = ทั้งภาพ + พื้นหลังเบลอ
        "fx": 0.5, "fy": 0.5,             // จุดกึ่งกลางตอนครอป (0–1)
        "zoom": 1.0,                      // 1–2
        "volume": 1.0,                    // 0 = ปิดเสียงคลิป
        "transition": "cut" },            // รอยต่อ "เข้า" คลิปนี้: cut · flash · zoom
      { "id": "c2", "kind": "image", "src": "sku:OP 17" | "https://…png",
        "dur": 3.0, "fit": "contain", "motion": "zoomin", "transition": "flash" }   // motion: none · zoomin · zoomout
    ],
    "overlays": [                         // ของทับ ช่วงเวลาอิสระ (วินาทีบนไทม์ไลน์)
      { "id": "t1", "type": "text", "text": "ซองไหนขายดีสุด?", "start": 0, "end": 3,
        "x": 0.5, "y": 0.2,               // จุดกึ่งกลาง (สัดส่วนจอ)
        "size": 96, "style": "bold",      // bold · gold · neon · box
        "color": "#ffffff", "anim": "pop" },          // pop · slide · fade · float · none
      { "id": "i1", "type": "image", "src": "sku:OP 17", "start": 2, "end": 6, "x": 0.5, "y": 0.5, "w": 0.45, "anim": "pop" },
      { "id": "l1", "type": "logo", "start": 0, "end": -1 }                     // end -1 = ถึงท้ายคลิป
    ],
    "voice": { "script": "บรรทัด 1\nบรรทัด 2", "voice": "Puck", "style": "…", "tts_model": null },   // null = ไม่มีเสียงพากย์
    "captions": { "on": true },           // ซับจากบทพากย์ (เวลาจาก whisper) · ไม่มีเสียงพากย์ = ไม่มีซับอัตโนมัติ
    "music": { "src": "lib:<id>" | "https://…mp3", "volume": 0.22 },   // null = ไม่มีเพลง · ไฟล์ที่อัปโหลดเอง = ผู้ใช้รับรองสิทธิ์
    "sfx": true                           // เอฟเฟกต์ที่รอยตัด + ตอนของทับโผล่
  }
}
```

## กติกา

- **ความยาวคลิป** = max(ผลรวมแทร็กหลัก, เสียงพากย์ + 0.6 วิ) · แทร็กหลักสั้นกว่า = ท้ายคลิปเป็นพื้นกรมท่า (หน้าเว็บเตือน)
- **แหล่งไฟล์ที่รับ**: `https://<supabase>/storage/v1/object/public/marketing/…` (ของเราเท่านั้น) · `sku:<รหัส>` (รูปซอง) · `assets/…` ในเทมเพลต
  — route ปฏิเสธลิงก์ภายนอก (กันใช้เครื่องเรนเดอร์ดาวน์โหลดของจากที่อื่น)
- เสียงพากย์ผ่าน `voice.pronounce` (`tasks/tts_pronounce.json`) และย่อช่วงเงียบแบบเดียวกับคลิปรูปแบบ
- ชั้นเสียงหลังเรนเดอร์ (`sound.master`): เพลง + เอฟเฟกต์ + −14 LUFS · ล้ม = ใช้ไฟล์ที่เรนเดอร์ได้
  · `music.volume` ที่ผู้ใช้ปรับส่งถึงตัวผสมจริง (`music_volume=`) · เพลงหลบเสียงพูด/เสียงคลิปด้วย sidechain
- **ก่อนประกอบ runner เตรียมคลิปวิดีโอทุกชิ้น** (`hf_timeline._prep_video`): ตัดเฉพาะช่วง in–out · 30 fps keyframe ทุก 1 วิ
  · ย่อไม่เกินขนาดที่คลุมจอ 1080×1920 · ไฟล์ไม่มีแทร็กเสียง = บังคับ `volume 0`
  — `data-has-audio` บนไฟล์ไม่มีเสียงทำ HyperFrames ปฏิเสธทั้งงาน ("do not match their authored media element type")
- **อัปโหลด**: Storage รับ ≤ 50 MB/ไฟล์ (แพ็กเกจฟรีของ Supabase · 60 MB → 413) · วิดีโอที่เกิน หน้าเว็บย่อเองก่อนส่ง
  (`components/edit/compress.js` · mediabunny + WebCodecs · เป้า ≤ 44 MB) · ไฟล์ไม่ผ่าน Vercel (ลิงก์อัปโหลดลงชื่อ)
- พรีวิวบนเว็บใช้ CSS ชุดเดียวกับเทมเพลตเรนเดอร์ (ฟอนต์ Kanit ใน `public/fonts`) — **แก้สไตล์ของทับต้องแก้สองที่**:
  `timeline.template.html` + `components/edit/edit.module.css` (เคยต่างกันแค่ `width: max-content` → ตัวหนังสือในคลิปตัดบรรทัดเร็วกว่าพรีวิว)
- เพดาน: คลิปหลัก ≤ 40 ชิ้น · ของทับ ≤ 40 · ความยาวรวม ≤ 180 วิ
