"""ART-001 최소 에셋 목록을 생성한다.

실행: python tools/generate-art.py
출력: art/generated/*.png (런타임 에셋 경로)

원칙
- 1x 픽셀 그리드로 그리고 화면에서 정수 배율로 확대한다 (ART-001 §기술규격).
- 스프라이트의 알파는 0 또는 255만 사용한다. 반투명 경계 픽셀이 있으면
  최근접 확대에서 밝은 테두리(할로)로 보인다 (§완료기준 6).
- 광원은 위쪽 실내등의 약한 중성광 + 아래쪽 숯불의 주황빛 (§스타일 5).
- 팔레트는 콘셉트 05/06/13에서 추출한 값을 기준으로 한다 (§스타일 1).
"""

import math
import os

from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "art", "generated")

# ── 팔레트 (콘셉트 추출 기반) ──────────────────────────────────

WOOD_DARK = (36, 28, 20)
WOOD = (56, 40, 32)
WOOD_MID = (72, 56, 40)
WOOD_LIGHT = (88, 72, 56)

IRON_DARK = (20, 20, 18)
IRON = (42, 42, 38)
IRON_LIGHT = (58, 58, 52)

EMBER_DEEP = (122, 36, 6)
EMBER = (192, 64, 10)
EMBER_HOT = (255, 122, 30)
EMBER_CORE = (255, 190, 90)

CHICKEN_RAW = (224, 164, 148)
CHICKEN_RAW_SHADE = (196, 128, 116)
CHICKEN_COOK = (168, 100, 40)
CHICKEN_COOK_SHADE = (138, 74, 24)
CHICKEN_DONE = (150, 86, 30)
CHICKEN_OVER = (96, 52, 18)
CHAR = (42, 26, 16)
CHAR_DEEP = (24, 14, 10)

LEEK = (143, 192, 106)
LEEK_SHADE = (95, 140, 62)
LEEK_DEEP = (66, 102, 42)
LEEK_WHITE = (224, 220, 192)

STICK = (201, 168, 106)
STICK_SHADE = (165, 130, 74)

CERAMIC = (232, 224, 208)
CERAMIC_SHADE = (192, 184, 168)
CERAMIC_DEEP = (150, 142, 128)

SKIN = (217, 168, 120)
SKIN_SHADE = (184, 134, 92)
HAIR = (42, 30, 24)
CLOTH = (53, 72, 94)
CLOTH_SHADE = (40, 55, 72)

SMOKE = (226, 214, 200)
GLOSS = (255, 236, 190)

TRANSPARENT = (0, 0, 0, 0)


def new_img(w, h):
    return Image.new("RGBA", (w, h), TRANSPARENT)


def save(img, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    img.save(path, "PNG", optimize=True)
    print(f"  {name}  {img.width}x{img.height}")


def harden(img):
    """반투명 픽셀을 없앤다. 알파 128 이상은 불투명, 미만은 완전 투명."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return img


def blob(draw, cx, cy, rx, ry, color):
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)


# ── 재료 ──────────────────────────────────────────────────────


OUTLINE = (26, 16, 12)


def draw_chicken_chunk(draw, cx, cy, r, base, shade, ember_rim=True):
    """닭다리살 덩어리. 실루엣은 둥근 사각에 가깝고 표면에 결이 있다 (§스타일 6).

    조각마다 1px 어두운 외곽선을 둘러 작은 크기에서도 개수와 경계가 읽히게 한다.
    """
    draw.rounded_rectangle(
        [cx - r - 1, cy - r, cx + r + 1, cy + r], radius=max(1, r // 2) + 1, fill=OUTLINE
    )
    draw.rounded_rectangle([cx - r, cy - r + 1, cx + r, cy + r - 1], radius=max(1, r // 2), fill=base)
    # 위쪽 중성광 하이라이트
    draw.line([(cx - r + 1, cy - r + 1), (cx + r - 2, cy - r + 1)], fill=lighten(base, 26))
    draw.point((cx - r + 2, cy - r + 2), fill=lighten(base, 40))
    # 아래쪽 그림자
    draw.line([(cx - r + 1, cy + r - 2), (cx + r - 1, cy + r - 2)], fill=shade)
    # 결 (표면 질감)
    draw.point((cx - 1, cy), fill=shade)
    draw.point((cx + 2, cy + 1), fill=shade)
    if ember_rim:
        draw.point((cx - r + 1, cy + r - 2), fill=EMBER_DEEP)
        draw.point((cx + r - 1, cy + r - 2), fill=EMBER_DEEP)


def draw_leek_chunk(draw, cx, cy, r, base=LEEK, shade=LEEK_SHADE):
    """대파. 원통 단면이라 실루엣이 원형이고 안쪽에 동심 링이 있다 (§스타일 6)."""
    blob(draw, cx, cy, r + 1, r + 1, OUTLINE)
    blob(draw, cx, cy, r, r, shade)
    blob(draw, cx, cy, r - 1, r - 1, base)
    blob(draw, cx, cy, max(1, r - 3), max(1, r - 3), LEEK_WHITE)
    blob(draw, cx, cy, max(0, r - 4), max(0, r - 4), lighten(base, 10))
    draw.point((cx - 1, cy - r + 1), fill=lighten(base, 30))


def lighten(c, amount):
    return tuple(min(255, v + amount) for v in c[:3])


def darken(c, amount):
    return tuple(max(0, v - amount) for v in c[:3])


def gen_ingredient_chicken():
    img = new_img(20, 20)
    d = ImageDraw.Draw(img)
    draw_chicken_chunk(d, 10, 10, 8, CHICKEN_RAW, CHICKEN_RAW_SHADE, ember_rim=False)
    return harden(img)


def gen_ingredient_leek():
    img = new_img(20, 20)
    d = ImageDraw.Draw(img)
    draw_leek_chunk(d, 10, 10, 8)
    return harden(img)


def gen_piece(kind):
    img = new_img(14, 14)
    d = ImageDraw.Draw(img)
    if kind == "chicken":
        draw_chicken_chunk(d, 7, 7, 6, CHICKEN_RAW, CHICKEN_RAW_SHADE, ember_rim=False)
    else:
        draw_leek_chunk(d, 7, 7, 6)
    return harden(img)


def gen_icon(kind):
    """주문표용 작은 아이콘.

    22px 안팎으로 축소되므로 대비를 크게 준다. 닭은 가로로 눕힌 덩어리에
    결을 굵게 넣고, 대파는 동심 링을 유지해 실루엣부터 다르게 만든다 (§스타일 6).
    """
    img = new_img(16, 16)
    d = ImageDraw.Draw(img)
    if kind == "chicken":
        d.rounded_rectangle([1, 3, 14, 12], radius=4, fill=OUTLINE)
        d.rounded_rectangle([2, 4, 13, 11], radius=3, fill=CHICKEN_COOK)
        # 위쪽 중성광
        d.line([(3, 5), (12, 5)], fill=lighten(CHICKEN_COOK, 34))
        # 굵은 결 2줄
        d.line([(4, 8), (11, 8)], fill=CHICKEN_COOK_SHADE)
        d.line([(5, 10), (10, 10)], fill=CHICKEN_COOK_SHADE)
    else:
        draw_leek_chunk(d, 8, 8, 6)
    return harden(img)


def gen_skewer_stick():
    """조립 화면의 빈 꼬치 막대. 어두운 배경 위에서도 보이도록 굵게 잡는다."""
    img = new_img(96, 16)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 5, 95, 11], fill=OUTLINE)
    d.rectangle([1, 6, 94, 10], fill=STICK)
    d.line([(1, 6), (94, 6)], fill=lighten(STICK, 30))
    d.line([(1, 10), (94, 10)], fill=STICK_SHADE)
    # 손잡이 끝을 두껍게
    d.rectangle([86, 3, 95, 13], fill=OUTLINE)
    d.rectangle([87, 4, 94, 12], fill=STICK_SHADE)
    d.line([(87, 4), (94, 4)], fill=STICK)
    return harden(img)


# ── 조리 꼬치 (셰이더 대체용 래스터 5상태) ──────────────────────

COOK_STATES = {
    # (재료색, 그림자색, 그을음 점 개수, 연기 여부, 윤기 여부)
    "raw": (CHICKEN_RAW, CHICKEN_RAW_SHADE, 0, False, False),
    "cooking": ((196, 130, 76), (160, 98, 52), 0, False, False),
    "perfect": (CHICKEN_DONE, CHICKEN_COOK_SHADE, 2, False, True),
    "over": (CHICKEN_OVER, darken(CHICKEN_OVER, 20), 7, True, False),
    "burnt": (CHAR, CHAR_DEEP, 14, True, False),
}


def gen_negima(state):
    """네기마 꼬치 세로 배치. 닭-대파-닭-대파-닭 (GPL-001 레시피 순서)."""
    base, shade, char_dots, smoky, glossy = COOK_STATES[state]
    img = new_img(64, 64)
    d = ImageDraw.Draw(img)

    # 꼬치 막대. 아래쪽으로 손잡이가 드러나게 둔다 (콘셉트 13의 실루엣)
    d.rectangle([31, 3, 33, 63], fill=STICK)
    d.line([(31, 3), (31, 63)], fill=lighten(STICK, 20))
    d.line([(33, 3), (33, 63)], fill=STICK_SHADE)

    order = ["chicken", "leek", "chicken", "leek", "chicken"]
    ys = [11, 21, 31, 41, 51]
    for kind, cy in zip(order, ys):
        if kind == "chicken":
            draw_chicken_chunk(d, 32, cy, 7, base, shade, ember_rim=(state != "raw"))
        else:
            if state == "burnt":
                draw_leek_chunk(d, 32, cy, 6, CHAR, CHAR_DEEP)
            elif state == "over":
                draw_leek_chunk(d, 32, cy, 6, LEEK_DEEP, darken(LEEK_DEEP, 18))
            else:
                draw_leek_chunk(d, 32, cy, 6, LEEK, LEEK_SHADE)

    # 그을음 점 — 과다/탄 상태를 색이 아니라 면적으로 구분한다 (§경계조건)
    rng = _Rng(seed=len(state) * 977 + 13)
    for _ in range(char_dots):
        x = 24 + rng.next(17)
        y = 8 + rng.next(49)
        _, _, _, a = img.getpixel((x, y))
        if a:
            d.point((x, y), fill=CHAR_DEEP)
            if rng.next(2):
                d.point((x + 1, y), fill=CHAR_DEEP)

    if glossy:
        for cy in ys[::2]:
            d.point((28, cy - 4), fill=GLOSS)
            d.point((29, cy - 5), fill=GLOSS)

    return harden(img)


class _Rng:
    """결정적 의사난수. 같은 입력이 같은 에셋을 만들도록 고정한다."""

    def __init__(self, seed):
        self.s = seed

    def next(self, n):
        self.s = (self.s * 1103515245 + 12345) & 0x7FFFFFFF
        return self.s % n


# ── 그릴 ──────────────────────────────────────────────────────


def gen_brazier(hot):
    """숯불 화로 + 석쇠 1칸."""
    img = new_img(110, 110)
    d = ImageDraw.Draw(img)

    # 화로 몸통 (나무 테 두른 원통)
    d.ellipse([8, 26, 101, 74], fill=IRON_DARK)
    d.rectangle([8, 50, 101, 88], fill=WOOD_DARK)
    d.ellipse([8, 70, 101, 100], fill=WOOD)
    d.line([(8, 60), (101, 60)], fill=WOOD_MID)
    d.line([(8, 74), (101, 74)], fill=WOOD_MID)
    for x in range(12, 100, 12):
        d.line([(x, 52), (x, 84)], fill=darken(WOOD_DARK, 6))

    # 숯 바닥
    d.ellipse([14, 30, 95, 70], fill=IRON)
    rng = _Rng(seed=4211)
    for _ in range(70):
        x = 18 + rng.next(74)
        y = 34 + rng.next(32)
        r = 1 + rng.next(3)
        if hot and rng.next(3) == 0:
            color = EMBER if rng.next(2) else EMBER_HOT
        else:
            color = IRON_LIGHT if rng.next(2) else IRON_DARK
        blob(d, x, y, r, max(1, r - 1), color)

    if hot:
        blob(d, 55, 52, 16, 7, EMBER_DEEP)
        blob(d, 55, 52, 10, 4, EMBER)
        blob(d, 55, 52, 5, 2, EMBER_HOT)
        blob(d, 55, 52, 2, 1, EMBER_CORE)

    # 석쇠 1칸
    for x in range(20, 92, 7):
        d.line([(x, 28), (x, 62)], fill=IRON_LIGHT if hot else IRON)
    d.line([(16, 28), (94, 28)], fill=IRON_LIGHT)
    d.line([(16, 62), (94, 62)], fill=IRON_LIGHT)

    return harden(img)


# ── 서빙 ──────────────────────────────────────────────────────


def gen_plate():
    img = new_img(60, 60)
    d = ImageDraw.Draw(img)
    d.ellipse([2, 14, 57, 52], fill=CERAMIC_DEEP)
    d.ellipse([2, 10, 57, 48], fill=CERAMIC_SHADE)
    d.ellipse([7, 13, 52, 44], fill=CERAMIC)
    d.ellipse([14, 18, 45, 39], fill=CERAMIC_SHADE)
    d.arc([7, 13, 52, 44], 190, 340, fill=lighten(CERAMIC, 16))
    return harden(img)


def gen_order_mat():
    img = new_img(100, 70)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, 99, 69], radius=6, fill=WOOD_DARK)
    d.rounded_rectangle([3, 3, 96, 66], radius=5, fill=WOOD)
    d.rounded_rectangle([7, 7, 92, 62], radius=4, outline=WOOD_MID)
    for y in range(12, 60, 8):
        d.line([(10, y), (89, y)], fill=darken(WOOD, 6))
    return harden(img)


def gen_customer(mood):
    """허리 위 초상 (§스타일 8). 대기 / 좋은 반응 / 낮은 품질 반응.

    세 반응은 눈썹 각도, 눈 모양, 입 형태를 모두 다르게 해 색이 아닌 형태로 구분한다.
    얼굴을 크게 잡아 2배 확대에서도 표정이 읽히게 한다 (§완료기준 4).
    """
    img = new_img(40, 48)
    d = ImageDraw.Draw(img)

    # 몸통
    d.rounded_rectangle([3, 33, 36, 47], radius=4, fill=CLOTH)
    d.line([(3, 33), (36, 33)], fill=lighten(CLOTH, 16))
    d.rectangle([17, 33, 22, 47], fill=CLOTH_SHADE)
    # 옷깃
    d.line([(15, 33), (20, 38)], fill=lighten(CLOTH, 24))
    d.line([(24, 33), (20, 38)], fill=lighten(CLOTH, 24))

    # 목
    d.rectangle([16, 29, 23, 34], fill=SKIN_SHADE)

    # 얼굴
    d.rounded_rectangle([8, 7, 31, 32], radius=7, fill=SKIN)
    d.line([(9, 31), (30, 31)], fill=SKIN_SHADE)

    # 머리카락 — 이마 위쪽만 덮어 눈이 가려지지 않게 한다
    d.rounded_rectangle([7, 4, 32, 15], radius=6, fill=HAIR)
    d.rectangle([7, 10, 10, 24], fill=HAIR)
    d.rectangle([29, 10, 32, 24], fill=HAIR)
    d.line([(12, 13), (18, 11)], fill=lighten(HAIR, 18))

    eye_l, eye_r = 14, 24

    if mood == "happy":
        # 눈썹 위로, 눈은 감은 호, 입은 크게 웃는 형태
        d.line([(11, 16), (16, 14)], fill=HAIR)
        d.line([(23, 14), (28, 16)], fill=HAIR)
        d.arc([eye_l - 3, 17, eye_l + 2, 22], 180, 360, fill=HAIR)
        d.arc([eye_r - 3, 17, eye_r + 2, 22], 180, 360, fill=HAIR)
        d.chord([15, 22, 24, 29], 0, 180, fill=(122, 52, 44))
        d.arc([15, 22, 24, 29], 0, 180, fill=HAIR)
        d.point((11, 24), fill=(224, 138, 116))
        d.point((28, 24), fill=(224, 138, 116))
    elif mood == "meh":
        # 눈썹 안쪽 내림, 눈은 작은 점, 입은 한쪽으로 기운 직선
        d.line([(11, 14), (16, 17)], fill=HAIR)
        d.line([(23, 17), (28, 14)], fill=HAIR)
        d.rectangle([eye_l - 1, 19, eye_l, 20], fill=HAIR)
        d.rectangle([eye_r - 1, 19, eye_r, 20], fill=HAIR)
        d.line([(16, 27), (23, 25)], fill=HAIR)
        # 땀방울 — 낮은 품질 반응임을 형태로 한 번 더 알린다
        d.point((33, 12), fill=(150, 200, 220))
        d.point((33, 13), fill=(180, 220, 235))
    else:  # idle
        d.line([(11, 15), (16, 15)], fill=HAIR)
        d.line([(23, 15), (28, 15)], fill=HAIR)
        d.rectangle([eye_l - 1, 19, eye_l + 1, 21], fill=HAIR)
        d.rectangle([eye_r - 1, 19, eye_r + 1, 21], fill=HAIR)
        d.line([(17, 26), (22, 26)], fill=HAIR)

    return harden(img)


# ── 배경 ──────────────────────────────────────────────────────


def gen_background(kind):
    """배경은 조작 대상보다 명도·채도를 낮춘다 (§스타일 2). 불투명.

    화면에서 `cover`로 늘어나므로 1px 선처럼 가는 디테일은 넣지 않는다.
    가는 선은 비정수 배율에서 뭉개져 오히려 지저분해진다. 큰 면과 부드러운
    밝기 변화만 사용해 어떤 배율에서도 안정적으로 보이게 한다
    (§적용요구사항 4: 밀도가 이질적으로 보이지 않을 것).
    """
    w, h = 640, 360
    img = Image.new("RGBA", (w, h), (18, 15, 13, 255))
    d = ImageDraw.Draw(img)

    wall_h = int(h * 0.56)

    # 뒤쪽 벽 — 넓은 목재 패널 (폭 80px)
    d.rectangle([0, 0, w, wall_h], fill=(26, 21, 17))
    for i, x in enumerate(range(0, w, 80)):
        tone = (30, 24, 20) if i % 2 == 0 else (24, 20, 16)
        d.rectangle([x, 0, x + 78, wall_h], fill=tone)

    # 카운터 상판 — 넓은 판 (높이 40px)
    d.rectangle([0, wall_h, w, h], fill=WOOD_DARK)
    for i, y in enumerate(range(wall_h, h, 40)):
        tone = (48, 36, 26) if i % 2 == 0 else (42, 31, 22)
        d.rectangle([0, y, w, y + 38], fill=tone)
    # 상판 앞모서리 하이라이트 (두껍게)
    d.rectangle([0, wall_h, w, wall_h + 4], fill=(86, 66, 46))

    if kind == "grill":
        # 아래쪽 숯불 반사광 — 넓고 부드럽게
        for i in range(120):
            t = i / 120
            y = h - 1 - i
            base = img.getpixel((0, y))[:3]
            d.line([(0, y), (w, y)], fill=_mix(base, (150, 60, 14), (1 - t) * 0.5))
    elif kind == "counter":
        # 손님 쪽 실내등 — 위에서 내려오는 중성광
        for i in range(110):
            t = i / 110
            base = img.getpixel((0, i))[:3]
            d.line([(0, i), (w, i)], fill=_mix(base, (150, 140, 120), (1 - t) * 0.22))
    else:
        # 조립대 도마 — 화면 하단을 가로지르는 넓은 면
        d.rounded_rectangle([w // 2 - 210, wall_h + 22, w // 2 + 210, h - 18], radius=10, fill=(74, 56, 38))
        d.rounded_rectangle([w // 2 - 202, wall_h + 28, w // 2 + 202, h - 24], radius=8, fill=(92, 70, 48))

    # 비네트 — 중앙 작업 영역이 먼저 읽히게 한다
    edge = 150
    for i in range(edge):
        t = 1 - i / edge
        for x in (i, w - 1 - i):
            base = img.getpixel((x, h // 2))[:3]
            d.line([(x, 0), (x, h)], fill=_mix(base, (8, 6, 5), t * 0.55))

    return img


def _mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


# ── VFX ───────────────────────────────────────────────────────


def gen_vfx_smoke():
    img = new_img(16, 16)
    d = ImageDraw.Draw(img)
    blob(d, 8, 9, 6, 6, SMOKE)
    blob(d, 5, 6, 3, 3, SMOKE)
    blob(d, 11, 5, 2, 2, SMOKE)
    return harden(img)


def gen_vfx_ember():
    img = new_img(8, 8)
    d = ImageDraw.Draw(img)
    blob(d, 4, 4, 2, 2, EMBER_HOT)
    d.point((4, 4), fill=EMBER_CORE)
    return harden(img)


def gen_vfx_gloss():
    img = new_img(24, 24)
    d = ImageDraw.Draw(img)
    d.arc([2, 2, 21, 21], 200, 330, fill=GLOSS)
    d.arc([4, 4, 19, 19], 210, 320, fill=lighten(GLOSS, 10))
    return harden(img)


def gen_vfx_pierce():
    """관통 스파크 4프레임 시트 (§최소 에셋 목록 VFX)."""
    fw = 16
    img = new_img(fw * 4, 16)
    d = ImageDraw.Draw(img)
    for f in range(4):
        ox = f * fw
        r = 2 + f * 3
        n = 4 + f * 2
        for i in range(n):
            ang = (i / n) * math.tau + f * 0.3
            x = int(ox + 8 + math.cos(ang) * r)
            y = int(8 + math.sin(ang) * r)
            if 0 <= x - ox < fw and 0 <= y < 16:
                d.point((x, y), fill=EMBER_CORE if f < 2 else EMBER_HOT)
    return harden(img)


# ── 실행 ──────────────────────────────────────────────────────


def main():
    print("ART-001 에셋 생성")

    save(gen_background("assembly"), "bg-assembly.png")
    save(gen_background("grill"), "bg-grill.png")
    save(gen_background("counter"), "bg-counter.png")

    save(gen_icon("chicken"), "icon-chicken.png")
    save(gen_icon("leek"), "icon-leek.png")

    save(gen_ingredient_chicken(), "ingredient-chicken.png")
    save(gen_ingredient_leek(), "ingredient-leek.png")

    save(gen_piece("chicken"), "piece-chicken.png")
    save(gen_piece("leek"), "piece-leek.png")
    save(gen_skewer_stick(), "skewer-empty.png")

    for state in COOK_STATES:
        save(gen_negima(state), f"skewer-negima-{state}.png")

    save(gen_brazier(False), "brazier.png")
    save(gen_brazier(True), "brazier-hot.png")

    save(gen_plate(), "plate.png")
    save(gen_order_mat(), "order-mat.png")

    for mood in ("idle", "happy", "meh"):
        save(gen_customer(mood), f"customer-{mood}.png")

    save(gen_vfx_smoke(), "vfx-smoke.png")
    save(gen_vfx_ember(), "vfx-ember.png")
    save(gen_vfx_gloss(), "vfx-gloss.png")
    save(gen_vfx_pierce(), "vfx-pierce.png")

    print("완료")


if __name__ == "__main__":
    main()
