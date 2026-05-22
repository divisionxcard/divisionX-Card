"""Pull Ollama model with progress (สำหรับใช้ครั้งเดียว)"""
import sys
from ollama import Client

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

model = sys.argv[1] if len(sys.argv) > 1 else "qwen2.5:14b"
client = Client(host="http://localhost:11434")

print(f"📥 Pulling {model}...")
last_status = ""
for chunk in client.pull(model, stream=True):
    status = chunk.get("status", "")
    if "total" in chunk and "completed" in chunk:
        pct = chunk["completed"] / chunk["total"] * 100
        mb_done = chunk["completed"] / 1024 / 1024
        mb_total = chunk["total"] / 1024 / 1024
        msg = f"  {status}: {pct:.1f}% ({mb_done:.0f}/{mb_total:.0f} MB)"
        # ใช้ \r เพื่อให้บรรทัดเดียว update เรื่อยๆ
        print(f"\r{msg:<80}", end="", flush=True)
    elif status != last_status:
        print(f"\n  {status}", flush=True)
        last_status = status

print(f"\n✅ เสร็จเรียบร้อย: {model}")
