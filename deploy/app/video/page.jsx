"use client"
// /video — หน้าสั่งงานโรงงานวิดีโอสั้น (deploy/agents/video)
//
// แยก route ออกมาเหมือน /marketing แต่ต่างกันตรงธีม: หน้านี้ "ไม่" ถอด dx-theme
// ออกจาก <body> เพราะคลิปที่มันสร้างเป็นกรมท่า-ฟ้านีออนอยู่แล้ว การให้หน้าเว็บ
// สีเดียวกับของที่กำลังทำ ทำให้ตัดสินได้เร็วกว่าว่าซับ/พาดหัวจะกลืนพื้นหลังไหม
// (จึงไม่ต้องมี layout.jsx + theme.jsx แบบที่ /marketing ต้องมี)
import VideoStudio from "../../components/VideoStudio"

export default function VideoPage() {
  return <VideoStudio />
}
