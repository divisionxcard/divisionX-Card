"""สร้างภาพประกอบด้วย FLUX.1-schnell บนเครื่องตัวเอง — ไม่มีค่าใช้จ่ายต่อภาพ

ทำไมต้องรันบนเครื่อง ไม่ใช้ API:
    ลอง OpenAI แล้วบัตรถูกปฏิเสธ · ลอง Google Cloud ก็ติดเรื่องบัตรเหมือนกัน
    เครื่องเจ้าของมี RTX 3050 6GB + RAM 32GB ซึ่งพอรัน FLUX แบบบีบขนาดได้
    → ฟรีถาวร ไม่ต้องพึ่งบัตร ไม่มีโควตา ไม่มีใครมาปิด API ทีหลัง

ทำไม FLUX ไม่ใช่ SDXL:
    ตอนแรกเลือก SDXL เพราะเร็วกว่า 4 เท่า — แต่ความเร็วไม่ใช่ข้อจำกัดของงานนี้
    (โพสต์วันละ 2 ชิ้น ภาพละ 3 นาทีก็ไม่กระทบอะไร) สิ่งที่เป็นปัญหาคือคุณภาพ
    FLUX ทำตามคำสั่งแม่นกว่ามากและให้ภาพที่ดู "ร่วมสมัย" ตั้งแต่ตัวพื้นฐาน
    ซึ่งตรงกับที่เจ้าของติงว่าของเดิม "ล้าสมัย"

⚠️ AI วาดแค่ "ฉาก" ไม่ใช่โปสเตอร์ทั้งใบ
    diffusion model เขียนตัวอักษรเพี้ยนทุกภาษา ไทยยิ่งพัง และวางเลย์เอาต์ตามพิกัดไม่ได้
    จึงแบ่งงานตามที่แต่ละฝ่ายเก่ง:
        FLUX     → ฉาก แสง บรรยากาศ พื้นผิว
        เทมเพลต  → เลย์เอาต์ ตัวอักษรไทย โลโก้ ตัวเลข (ถูกต้อง 100%)
    ผลพลอยได้: ซองการ์ดในภาพเป็นรูปถ่ายของจริง ไม่ใช่ของที่ AI วาดขึ้นเอง
    (ถ้าให้ AI วาดซองเอง จะกลายเป็นสินค้าปลอมที่ไม่มีอยู่จริง)

ต้องมี HF_TOKEN — คลัง black-forest-labs/FLUX.1-schnell ต้องล็อกอิน (ตัว GGUF ไม่ต้อง)

รัน:
    python deploy/agents/local_image.py --prompt "..." --out ภาพ.png
    python deploy/agents/local_image.py --scene hero --out ภาพ.png     # ใช้ฉากสำเร็จรูป
    python deploy/agents/local_image.py --warmup                        # โหลดโมเดลอย่างเดียว
"""
import argparse
import os
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent

# ตัวบีบขนาด Q4_K_S — 6.47 GB · คุณภาพต่างจากตัวเต็มน้อยมากในงานฉาก/แสง
# ตัวเต็ม fp16 คือ 23.8 GB ซึ่งเกิน VRAM 6 GB ไปมาก
GGUF_REPO = "city96/FLUX.1-schnell-gguf"
GGUF_FILE = "flux1-schnell-Q4_K_S.gguf"
BASE_REPO = "black-forest-labs/FLUX.1-schnell"

# schnell เป็นรุ่นกลั่นมาให้เสร็จใน 4 สเต็ป — ใส่มากกว่านี้ไม่ได้อะไรเพิ่ม เสียเวลาเปล่า
STEPS = 4
GUIDANCE = 0.0          # schnell ไม่ใช้ guidance (ต่างจาก dev) ใส่ไปจะทำให้ภาพแย่ลง

# ── ฉากสำเร็จรูป ────────────────────────────────────────────────────────
# เขียนเป็นภาษาอังกฤษเพราะโมเดลภาพเข้าใจดีกว่าไทยมาก (ทดสอบแล้วต่างกันจริง)
# ทุกฉาก **ห้ามมีตัวอักษร ห้ามมีสินค้า** — สองอย่างนั้นเทมเพลตวางทับเอง
SCENES = {
    "hero": (
        "Empty premium retail display podium in a modern Thai shopping mall at night, "
        "deep navy blue and teal color grading, electric cyan neon rim lighting, "
        "polished dark reflective floor, soft volumetric haze, shallow depth of field, "
        "cinematic product photography lighting, clean negative space in the upper half"
    ),
    "hype": (
        "Abstract energy background, electric cyan lightning arcs over deep navy, "
        "brushed chrome shards catching rim light, dynamic diagonal composition, "
        "motion blur streaks, dramatic contrast, dark edges with a bright glowing centre"
    ),
    "shelf": (
        "Blurred bokeh of a brightly lit vending machine aisle in a Thai mall at night, "
        "cool navy and cyan tones, warm accent lights bokeh, shot on 85mm f1.4, "
        "very shallow depth of field, clean empty foreground"
    ),
    "luxe": (
        "Dark navy velvet surface with soft spotlight pool, drifting gold and cyan dust motes, "
        "elegant minimal luxury product staging, deep shadows, subtle chrome reflections, "
        "generous empty space in the centre"
    ),
}

NEGATIVE_HINT = (
    "no text, no letters, no words, no numbers, no watermark, no logo, "
    "no people, no faces, no anime characters, no trading cards, no packaging"
)


def load_env():
    """อ่าน HF_TOKEN จาก deploy/.env.local — ที่เดียวกับ key อื่นของโปรเจกต์"""
    f = ROOT / ".env.local"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_pipe = None


def get_pipe():
    """โหลดโมเดลครั้งเดียวแล้วเก็บไว้ — โหลดใหม่ทุกครั้งจะช้ามาก (~1 นาที)"""
    global _pipe
    if _pipe is not None:
        return _pipe

    import torch
    from diffusers import FluxPipeline, FluxTransformer2DModel, GGUFQuantizationConfig

    if not torch.cuda.is_available():
        print("[image] ⚠️  ไม่เจอ CUDA — จะรันบน CPU ซึ่งช้ามาก (หลายสิบนาที/ภาพ)")

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        print("[image] ไม่มี HF_TOKEN ใน deploy/.env.local")
        print("        คลัง black-forest-labs/FLUX.1-schnell ต้องล็อกอิน (ตัว GGUF ไม่ต้อง)")
        print("        1) ยอมรับเงื่อนไขที่ huggingface.co/black-forest-labs/FLUX.1-schnell")
        print("        2) สร้าง token แบบ Read ที่ huggingface.co/settings/tokens")
        sys.exit(1)

    from huggingface_hub import hf_hub_download
    t0 = time.time()
    print(f"[image] โหลดตัววาดภาพ (GGUF {GGUF_FILE}) …")
    ckpt = hf_hub_download(GGUF_REPO, GGUF_FILE)

    transformer = FluxTransformer2DModel.from_single_file(
        ckpt,
        quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
        config=BASE_REPO,
        subfolder="transformer",
        torch_dtype=torch.bfloat16,
        token=token,
    )
    print(f"[image] โหลดตัวอ่านคำสั่ง + ตัวแปลงภาพ …")
    pipe = FluxPipeline.from_pretrained(
        BASE_REPO, transformer=transformer, torch_dtype=torch.bfloat16, token=token,
    )

    # ⚠️ ห้ามใช้ pipe.to("cuda") — โมเดลรวมกันเกิน VRAM 6 GB แน่นอน
    # model_cpu_offload ย้ายทีละส่วนเข้า GPU ตอนใช้ แล้วคืน RAM ทันที
    # ช้ากว่าอยู่บน GPU ทั้งก้อน แต่เป็นวิธีเดียวที่การ์ด 6 GB รันตัวนี้ได้
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_slicing()      # ถอดรหัสภาพทีละส่วน ลดพีค VRAM ตอนจบ
    pipe.vae.enable_tiling()

    print(f"[image] พร้อมแล้ว ({time.time() - t0:.0f} วิ)")
    _pipe = pipe
    return pipe


def generate(prompt, out, width=1024, height=1024, seed=None):
    import torch
    pipe = get_pipe()
    gen = torch.Generator("cpu").manual_seed(seed) if seed is not None else None

    t0 = time.time()
    img = pipe(
        prompt=f"{prompt}. {NEGATIVE_HINT}",
        num_inference_steps=STEPS,
        guidance_scale=GUIDANCE,
        width=width, height=height,
        generator=gen,
    ).images[0]

    pathlib.Path(out).parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    kb = pathlib.Path(out).stat().st_size / 1024
    print(f"[image] เสร็จ {out} ({kb:.0f} KB · {width}x{height} · {time.time() - t0:.0f} วิ)")
    return out


def main():
    ap = argparse.ArgumentParser(description="สร้างภาพฉากด้วย FLUX.1-schnell บนเครื่อง")
    ap.add_argument("--prompt", help="คำสั่งภาพ (ภาษาอังกฤษได้ผลดีกว่ามาก)")
    ap.add_argument("--scene", choices=sorted(SCENES), help="ใช้ฉากสำเร็จรูป")
    ap.add_argument("--out", default="scene.png")
    ap.add_argument("--size", default="1024x1024", help="เช่น 1024x1024 · 1024x1280")
    ap.add_argument("--seed", type=int, help="ใส่เพื่อให้ได้ภาพเดิมซ้ำได้")
    ap.add_argument("--warmup", action="store_true", help="โหลดโมเดลอย่างเดียว ไม่สร้างภาพ")
    args = ap.parse_args()

    load_env()

    if args.warmup:
        get_pipe()
        print("[image] วอร์มอัปเสร็จ — โมเดลอยู่ในแคชแล้ว รอบหน้าจะเร็วขึ้น")
        return

    prompt = args.prompt or SCENES.get(args.scene or "")
    if not prompt:
        ap.error("ต้องระบุ --prompt หรือ --scene อย่างใดอย่างหนึ่ง")

    w, h = (int(x) for x in args.size.lower().split("x"))
    generate(prompt, args.out, w, h, args.seed)


if __name__ == "__main__":
    main()
