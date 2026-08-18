import { Config } from "@remotion/cli/config"

// เข้ารหัสวิดีโอเป็น H.264 — เล่นได้ทุกที่รวมถึงในแอป Facebook/TikTok บนมือถือ
Config.setVideoImageFormat("jpeg")
Config.setOverwriteOutput(true)
