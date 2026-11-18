"""Siber Task demo sunumunu üretir: python build_deck.py  (gereksinim: python-pptx)

Çıktı: sunum/Siber-Task-Demo.pptx. İçerik spec (.scratch/dashboard-gelistirme/spec.md),
GLOSSARY.md, ADR'ler, ticket durumları ve seed fixture'dan derlenmiştir.
"""
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

HERE = Path(__file__).resolve().parent
OUT = HERE / "Siber-Task-Demo.pptx"
FONT = "Calibri"


def rgb(h):
    return RGBColor.from_string(h)


NAVY, INK, MUTED, BG, WHITE = "0F1B2D", "1E293B", "64748B", "F8FAFC", "FFFFFF"
LINE = "CBD5E1"
TEAL, TEAL_L = "0D9488", "CCFBF1"
CYAN, CYAN_L = "0891B2", "CFFAFE"
AMBER, AMBER_L = "B45309", "FEF3C7"
ROSE, ROSE_L = "BE123C", "FFE4E6"
VIOLET, VIOLET_L = "6D28D9", "EDE9FE"
GREEN, GREEN_L = "15803D", "DCFCE7"
SLATE_L = "E2E8F0"

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]
TOTAL = 18
_count = 0


# ---------------------------------------------------------------- helpers
def _fill(shape, fill, line=None, line_w=1.0):
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(fill)
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = rgb(line)
        shape.line.width = Pt(line_w)
    shape.shadow.inherit = False


def _runs(p, content, size, color, bold):
    """content: str or list of (text, {bold, color, size}) tuples."""
    if isinstance(content, str):
        content = [(content, {})]
    for txt, st in content:
        r = p.add_run()
        r.text = txt
        f = r.font
        f.name = FONT
        f.size = Pt(st.get("size", size))
        f.bold = st.get("bold", bold)
        f.color.rgb = rgb(st.get("color", color))


def text(slide, x, y, w, h, paras, size=16, color=INK, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, space=4, bullet=None, line_spacing=1.05):
    """paras: str | list of paragraph contents (str or run lists)."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.04)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    if isinstance(paras, str) or (paras and isinstance(paras[0], tuple)):
        paras = [paras]  # tek paragraf (düz metin ya da run listesi)
    for i, content in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space)
        p.line_spacing = line_spacing
        if bullet:
            content = [(bullet + " ", {"color": TEAL, "bold": True})] + (
                [(content, {})] if isinstance(content, str) else list(content))
        _runs(p, content, size, color, bold)
    return tb


def box(slide, x, y, w, h, fill=WHITE, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.08,
        line_w=1.0):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    _fill(s, fill, line, line_w)
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    s.text_frame.text = ""
    return s


def label_box(slide, x, y, w, h, title, sub=None, fill=WHITE, line=LINE, tcolor=INK, tsize=15,
              ssize=11.5, scolor=MUTED, radius=0.12, line_w=1.25):
    s = box(slide, x, y, w, h, fill, line, radius=radius, line_w=line_w)
    tf = s.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    for m in ("margin_left", "margin_right"):
        setattr(tf, m, Inches(0.06))
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    _runs(p, title, tsize, tcolor, True)
    if sub:
        p2 = tf.add_paragraph()
        p2.alignment = PP_ALIGN.CENTER
        _runs(p2, sub, ssize, scolor, False)
    return s


def arrow(slide, x1, y1, x2, y2, color=MUTED, w=1.75, head=True, dash=False):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = rgb(color)
    c.line.width = Pt(w)
    ln = c.line._get_or_add_ln()
    if dash:
        d = etree.SubElement(ln, qn("a:prstDash"))
        d.set("val", "dash")
    if head:
        t = etree.SubElement(ln, qn("a:tailEnd"))
        t.set("type", "triangle")
        t.set("w", "med")
        t.set("len", "med")
    return c


def pill(slide, x, y, w, h, txt, fill, color, size=11, bold=True):
    s = box(slide, x, y, w, h, fill, None, radius=0.5)
    tf = s.text_frame
    tf.margin_left = tf.margin_right = Inches(0.04)
    tf.margin_top = tf.margin_bottom = Inches(0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    _runs(p, txt, size, color, bold)
    return s


def card(slide, x, y, w, h, title, items, accent=TEAL, accent_l=TEAL_L, size=13.5, title_size=17,
         bullet="•", space=9):
    box(slide, x, y, w, h, WHITE, LINE)
    box(slide, x, y + 0.12, 0.07, h - 0.24, accent, None, shape=MSO_SHAPE.RECTANGLE)
    text(slide, x + 0.22, y + 0.15, w - 0.35, 0.45, title, size=title_size, bold=True, color=INK)
    text(slide, x + 0.22, y + 0.62, w - 0.35, h - 0.72, items, size=size, color=INK, bullet=bullet,
         space=space)


def notes(slide, txt):
    slide.notes_slide.notes_text_frame.text = txt


def new_slide(title=None, kicker=None, dark=False):
    global _count
    _count += 1
    s = prs.slides.add_slide(BLANK)
    bgshape = s.background.fill
    bgshape.solid()
    bgshape.fore_color.rgb = rgb(NAVY if dark else BG)
    if title:
        box(s, 0.6, 0.55, 0.09, 0.62, TEAL, None, shape=MSO_SHAPE.RECTANGLE)
        if kicker:
            text(s, 0.82, 0.38, 10, 0.35, kicker.upper(), size=11.5, bold=True, color=TEAL)
        text(s, 0.82, 0.62, 11.8, 0.7, title, size=30, bold=True, color=INK)
    if not dark:
        text(s, 0.6, 7.03, 6, 0.3, "Siber Task  ·  AI Hackathon Demo", size=10, color=MUTED)
        text(s, 11.73, 7.03, 1.0, 0.3, f"{_count} / {TOTAL}", size=10, color=MUTED, align=PP_ALIGN.RIGHT)
    return s


# ---------------------------------------------------------------- 1. Kapak
s = new_slide(dark=True)
box(s, 0, 0, 0.28, 7.5, TEAL, None, shape=MSO_SHAPE.RECTANGLE)
text(s, 1.0, 1.55, 11, 0.4, "AI HACKATHON  ·  DEMO", size=14, bold=True, color="5EEAD4")
text(s, 1.0, 2.05, 11, 1.2, "Siber Task", size=66, bold=True, color=WHITE)
text(s, 1.0, 3.35, 10.5, 1.0,
     "Siber Güvenlik Direktörlüğü için task, onay zinciri, etkinlik ve raporlama platformu",
     size=24, color="CBD5E1")
for i, (t, c) in enumerate([("Hiyerarşiye göre kabul akışı", "134E4A"), ("Tek yetki katmanı", "1E3A8A"),
                            ("Silinemez denetim izi", "7F1D1D"), ("AI ajanları için REST + MCP", "4C1D95")]):
    pill(s, 1.0 + i * 2.9, 4.75, 2.7, 0.48, t, c, WHITE, size=12.5)
text(s, 1.0, 6.45, 11, 0.4, "18 Kasım 2026", size=14, color="94A3B8")
notes(s, "Açılış: Siber Task, direktörlüğün günlük işlerini, onay zincirlerini, etkinlik ve yetkinlikleri "
         "tek yerde toplayan kurum içi bir araç. Bugün önce problemi ve çözümü, sonra canlı demoyu göstereceğiz.")

# ---------------------------------------------------------------- 2. Problem
s = new_slide("Bugün işler dağınık ve görünmez", "Problem")
probs = [
    ("İş nerede bekliyor?", "Kim kabul etti, kim reddetti, iş hangi halkada bekliyor: görünmüyor.", ROSE, ROSE_L),
    ("Onay zinciri izlenemiyor", "Ekipler arası taleplerde kimin onaylayacağı ve kimin beklettiği belirsiz.", AMBER, AMBER_L),
    ("Performans ölçülemiyor", "Ekip yükü, kabul bekleme ve blok süreleri, ret nedenleri raporlanamıyor.", VIOLET, VIOLET_L),
    ("Araçlar dağınık", "Görevler, dış eğitim/konferans, sertifikalar ve duyurular farklı yerlerde.", CYAN, CYAN_L),
    ("Ajanlar güvenli erişemiyor", "AI ajanlarının veriye kontrollü ve denetlenebilir erişimi yok.", TEAL, TEAL_L),
]
xs = [0.6, 4.7, 8.8]
for i, (t, d, c, cl) in enumerate(probs):
    x = xs[i % 3] if i < 3 else [2.65, 6.75][i - 3]
    y = 1.65 if i < 3 else 3.85
    box(s, x, y, 3.9, 1.95, WHITE, LINE)
    pill(s, x + 0.25, y + 0.25, 0.5, 0.5, str(i + 1), cl, c, size=16)
    text(s, x + 0.9, y + 0.27, 2.9, 0.5, t, size=17, bold=True)
    text(s, x + 0.25, y + 0.9, 3.45, 0.95, d, size=13.5, color=MUTED)
box(s, 0.6, 6.1, 12.13, 0.7, NAVY, None, radius=0.2)
text(s, 0.8, 6.1, 11.7, 0.7,
     [("Hiyerarşi: ", {"bold": True, "color": "5EEAD4"}),
      ("Direktör → Unit Head → Team Head → Çalışan. Siber güvenlik verisinde yetki sızıntısı kabul edilemez.",
       {"color": WHITE})], size=15, anchor=MSO_ANCHOR.MIDDLE)
notes(s, "Beş temel problem. Özellikle ekipler arası iş taleplerinde onay zincirinin görünmemesi ve "
         "yöneticilerin bekleme sürelerini ölçememesi çıkış noktamız.")

# ---------------------------------------------------------------- 3. Çözüm
s = new_slide("Hiyerarşiyi bilen tek bir iş ve onay platformu", "Çözüm")
text(s, 0.82, 1.38, 11.5, 0.5,
     "Planner/Trello rahatlığında, organizasyon yapısına göre kendi onay zincirini kuran kurum içi web uygulaması.",
     size=16, color=MUTED)
mods = [
    ("Task ve kabul akışı", "Kişiye veya Ekip'e atama, direkt kabul, çok halkalı accept/refuse", TEAL, TEAL_L),
    ("Bekleyen işlerim", "Her rolün üzerindeki tüm onaylar tek panoda", CYAN, CYAN_L),
    ("Etkinlik · Yetkinlik · Duyuru", "İç/dış etkinlik onayı, sertifika takibi, hedefli duyuru", VIOLET, VIOLET_L),
    ("Raporlama", "Çözüm, kabul bekleme ve blok süresi, ret raporu", AMBER, AMBER_L),
    ("Vekalet ve eskalasyon", "Yokluğunda Vekil, 3 iş gününde Unit Head'e eskalasyon", ROSE, ROSE_L),
    ("REST API ve MCP", "AI ajanları kullanıcı adına, varsayılan salt okunur", GREEN, GREEN_L),
]
for i, (t, d, c, cl) in enumerate(mods):
    x = 0.6 + (i % 3) * 4.1
    y = 2.05 + (i // 3) * 1.75
    box(s, x, y, 3.93, 1.55, cl, None)
    text(s, x + 0.25, y + 0.2, 3.5, 0.45, t, size=17, bold=True, color=c)
    text(s, x + 0.25, y + 0.7, 3.5, 0.8, d, size=13.5, color=INK)
box(s, 0.6, 5.75, 12.13, 1.0, NAVY, None, radius=0.15)
text(s, 0.85, 5.8, 11.6, 0.9,
     [[("Temel: ", {"bold": True, "color": "5EEAD4"}),
       ("Tüm yüzeyler (Web, REST, MCP) tek yetki servis katmanından geçer  ·  "
        "Her işlem silinemez denetim izine yazılır", {"color": WHITE})]],
     size=16, anchor=MSO_ANCHOR.MIDDLE)
notes(s, "Altı yetenek alanı, ama hepsi aynı temele oturuyor: tek yetki katmanı ve ekleme-tabanlı denetim izi. "
         "Böylece web, API ve MCP aynı kuralları paylaşıyor.")

# ---------------------------------------------------------------- 4. Organizasyon
s = new_slide("Organizasyon ve roller", "Yetki modeli")
label_box(s, 2.75, 1.5, 3.0, 0.75, "Direktör", "Deniz Demir · tam yetki", NAVY, None, WHITE, scolor="CBD5E1")
units = [(0.6, "Unit Head · Savunma", "Ayşe Kaya", [("TEAM-WAF", "TH: Cem Yıldız"), ("TEAM-SOC", "TH: Cem Yıldız"),
                                                   ("TEAM-PENTEST", "TH yok → UH")]),
         (4.75, "Unit Head · İstihbarat", "Burak Şahin", [("TEAM-CTI", "TH: Ece Arslan"), ("TEAM-OSINT", "TH yok → UH")])]
arrow(s, 4.25, 2.25, 4.25, 2.55, MUTED, head=False)
arrow(s, 2.15, 2.55, 6.3, 2.55, MUTED, head=False)
for ux, ut, un, ekipler in units:
    uw = 3.1 if len(ekipler) == 3 else 3.1
    cx = ux + (3.95 if len(ekipler) == 3 else 2.75) / 2
    arrow(s, cx, 2.55, cx, 2.85, MUTED)
    label_box(s, cx - 1.45, 2.85, 2.9, 0.75, ut, un, TEAL_L, TEAL, tcolor="134E4A", tsize=14)
    n = len(ekipler)
    ew, gap = 1.25, 0.1
    total = n * ew + (n - 1) * gap
    ex0 = cx - total / 2
    arrow(s, cx, 3.6, cx, 3.85, MUTED, head=False)
    arrow(s, ex0 + ew / 2, 3.85, ex0 + total - ew / 2, 3.85, MUTED, head=False)
    for j, (ek, th) in enumerate(ekipler):
        ex = ex0 + j * (ew + gap)
        arrow(s, ex + ew / 2, 3.85, ex + ew / 2, 4.1, MUTED)
        dashed = "yok" in th
        b = label_box(s, ex, 4.1, ew, 0.95, ek, th, WHITE, AMBER if dashed else LINE, tsize=11.5, ssize=10)
        label_box(s, ex, 5.2, ew, 0.55, "Çalışanlar", None, SLATE_L, None, tsize=11, tcolor=MUTED)
text(s, 0.6, 5.95, 7.6, 0.85,
     [[("Çok Ekipli Team Head: ", {"bold": True}), ("Cem Yıldız iki Ekip'i tek kutudan yönetir.  ", {}),
       ("Team Head'siz Ekip: ", {"bold": True, "color": AMBER}), ("Sorumlu yönetici Unit Head olur.", {})]],
     size=12.5, color=INK)
card(s, 8.55, 1.5, 4.18, 4.4, "Kim neyi yönetir?", [
    [("Direktör: ", {"bold": True}), ("her şeyi görür ve düzenler", {})],
    [("Unit Head: ", {"bold": True}), ("kendi Unit'inde üyelik ve Team Head ataması", {})],
    [("Team Head: ", {"bold": True}), ("Ekibine onaysız üye ekler/çıkarır", {})],
    [("Çalışan: ", {"bold": True}), ("yalnızca kendi profili", {})],
    [("Üst yönetici: ", {"bold": True}), ("yetki zincirde yukarı doğru kapsar", {})],
], size=15, space=10)
box(s, 8.55, 6.02, 4.18, 0.8, AMBER_L, None)
text(s, 8.7, 6.05, 3.95, 0.75, "Üyelikler tarih aralıklı tutulur: taşınan Çalışan'ın geçmişi bozulmaz, "
                               "bekleyen onayları yeni Sorumlu yöneticiye geçer.", size=11.5, color="78350F",
     anchor=MSO_ANCHOR.MIDDLE)
notes(s, "Demo verisindeki yapı: iki Unit, beş Ekip. TEAM-PENTEST ve TEAM-OSINT'in Team Head'i yok; bu Ekipler için "
         "Sorumlu yönetici Unit Head. Cem Yıldız iki Ekip'in Team Head'i, birleşik kutuyu onunla göstereceğiz.")

# ---------------------------------------------------------------- 5. Task
s = new_slide("Task: kime, nasıl atanır?", "Task oluşturma")
card(s, 0.6, 1.55, 3.9, 4.6, "Task içeriği", [
    "Başlık, açıklama, öncelik", "Termin ve etiketler", "Harici ticket referansı (link/ID)",
    "Alt task, yorum", "Dosya eki (boyut ve tür sınırı)", "Taslak olarak hazırlayıp sonra gönder",
], CYAN, CYAN_L, size=17, space=11)
card(s, 4.72, 1.55, 3.9, 4.6, "Kime atanabilir?", [
    [("Kendine: ", {"bold": True}), ("Self-assign, otomatik kabul", {})],
    [("Ekip arkadaşına", {"bold": True})],
    [("Başka Ekip veya Unit'e", {"bold": True})],
    [("Kendi yöneticisine", {"bold": True})],
    [("Bir Ekip'e: ", {"bold": True}), ("örn. TEAM-WAF; Ekip kimin yapacağına karar verir", {})],
], TEAL, TEAL_L, size=17, space=11)
card(s, 8.84, 1.55, 3.9, 4.6, "Nasıl takip edilir?", [
    "Pano görünümü (Planner/Trello)", "Liste görünümü ve filtreler", "Geciken Task'lar vurgulanır",
    [("Backlog: ", {"bold": True}), ("durum değil, tarihsiz Task'ların görünümü", {})],
    "Tamamlanan Task aynı tarihçede yeniden açılır",
], VIOLET, VIOLET_L, size=17, space=11)
text(s, 0.6, 6.35, 12.1, 0.5, "Requester = Task'ı açan  ·  Assignee = atanan tek kişi veya tek Ekip", size=13,
     color=MUTED, align=PP_ALIGN.CENTER)
notes(s, "Bir Task kişiye ya da Ekip'e atanır. Atamanın kime yapıldığı, hangi kabul adımlarının gerektiğini belirliyor; "
         "bunu bir sonraki slaytta göreceğiz.")

# ---------------------------------------------------------------- 6. Kabul zinciri
s = new_slide("Kabul zinciri hiyerarşiden üretilir", "Kabul akışı")
rows = [
    ("Self-assign", "—", "Otomatik kabul", GREEN, GREEN_L),
    ("Yönetici → kendi Çalışanı · Unit Head → kendi Unit'i · Direktör → herkes", "—", "Direkt kabul", GREEN, GREEN_L),
    ("Çalışan → aynı Ekip'ten Çalışan", "Karşı Çalışan", "Accept / refuse", CYAN, CYAN_L),
    ("Çalışan → başka Ekip veya Unit'ten Çalışan", "① Çalışan  ② onun Sorumlu yöneticisi", "Accept / refuse", AMBER, AMBER_L),
    ("Çalışan → kendi yöneticisi  ·  Yönetici → Yönetici", "Karşı yönetici", "Accept / refuse", CYAN, CYAN_L),
    ("Yönetici → başka yöneticinin Çalışanı", "① Çalışan  ② onun Sorumlu yöneticisi", "Accept / refuse", AMBER, AMBER_L),
    ("Herhangi biri → Ekip", "Sorumlu yönetici (TH yoksa UH) kabul eder", "Delegasyon", VIOLET, VIOLET_L),
]
tx, ty = 0.6, 1.5
cw = [6.0, 3.85, 2.28]
for j, h in enumerate(["Requester → Assignee", "Kim kabul eder?", "Sonuç"]):
    text(s, tx + sum(cw[:j]) + 0.15, ty, cw[j], 0.4, h, size=12.5, bold=True, color=MUTED)
for i, (a, b, c, col, coll) in enumerate(rows):
    y = ty + 0.45 + i * 0.52
    box(s, tx, y, sum(cw), 0.46, WHITE if i % 2 else "F1F5F9", None, radius=0.15)
    text(s, tx + 0.15, y, cw[0] - 0.2, 0.46, a, size=13.5, anchor=MSO_ANCHOR.MIDDLE)
    text(s, tx + cw[0] + 0.15, y, cw[1] - 0.2, 0.46, b, size=13, color=INK, anchor=MSO_ANCHOR.MIDDLE)
    pill(s, tx + cw[0] + cw[1] + 0.1, y + 0.06, cw[2] - 0.2, 0.34, c, coll, col, size=11.5)
yb = ty + 0.45 + len(rows) * 0.52 + 0.12
box(s, 0.6, yb, 5.95, 1.0, ROSE_L, None)
text(s, 0.8, yb + 0.05, 5.6, 0.9,
     [[("Herhangi bir halka reddederse → Reddedildi. ", {"bold": True, "color": ROSE}),
       ("Ret gerekçesi zorunlu, zincir baştan başlamaz. Requester yeniden atar, düzenleyip gönderir ya da iptal eder.", {})]],
     size=12.5, anchor=MSO_ANCHOR.MIDDLE)
box(s, 6.78, yb, 5.95, 1.0, VIOLET_L, None)
text(s, 6.98, yb + 0.05, 5.6, 0.9,
     [[("Delege edilen Çalışan reddederse → Ekip havuzu. ", {"bold": True, "color": VIOLET}),
       ("Task Reddedildi olmaz; Team Head başka birini seçer. Başka Unit'te karşı Unit Head'e yalnızca bilgi gider.", {})]],
     size=12.5, anchor=MSO_ANCHOR.MIDDLE)
notes(s, "Kabul motorunun kuralları. Yukarıdan aşağı, yetki arttıkça adım azalıyor. Kritik iki kural: zincirdeki "
         "herhangi bir ret Task'ı Reddedildi yapar ama silmez; delegasyon sonrası ret ise Task'ı Ekip havuzuna döndürür.")

# ---------------------------------------------------------------- 7. Durum makinesi
s = new_slide("Durum makinesi", "Task yaşam döngüsü")
states = [("Taslak", SLATE_L, MUTED), ("Kabul Bekliyor", AMBER_L, AMBER), ("Kabul Edildi", CYAN_L, CYAN),
          ("Devam Ediyor", TEAL_L, TEAL), ("Tamamlandı", GREEN_L, GREEN)]
bw, bh, gap, y0 = 2.05, 0.95, 0.47, 2.45
pos = {}
for i, (n, f, c) in enumerate(states):
    x = 0.6 + i * (bw + gap)
    label_box(s, x, y0, bw, bh, n, None, f, c, tcolor=c, tsize=16, line_w=1.75)
    pos[n] = x
    if i:
        arrow(s, x - gap + 0.03, y0 + bh / 2, x - 0.03, y0 + bh / 2, INK)
# Bloklu (Devam Ediyor altında)
bx = pos["Devam Ediyor"]
label_box(s, bx, 4.35, bw, bh, "Bloklu", "neden zorunlu", ROSE_L, ROSE, tcolor=ROSE, tsize=16, line_w=1.75)
arrow(s, bx + 0.65, y0 + bh + 0.03, bx + 0.65, 4.32, INK)
arrow(s, bx + 1.4, 4.32, bx + 1.4, y0 + bh + 0.03, INK)
text(s, bx - 1.25, 3.62, 1.85, 0.4, "blokla", size=11.5, color=MUTED, align=PP_ALIGN.RIGHT)
text(s, bx + 1.5, 3.62, 1.4, 0.4, "devam et", size=11.5, color=MUTED)
# Reddedildi (Kabul Bekliyor altında)
rx = pos["Kabul Bekliyor"]
label_box(s, rx, 4.35, bw, bh, "Reddedildi", "gerekçe zorunlu · silinmez", "FFF1F2", ROSE, tcolor=ROSE,
          tsize=16, ssize=10.5, line_w=1.75)
arrow(s, rx + bw / 2, y0 + bh + 0.03, rx + bw / 2, 4.32, ROSE)
text(s, rx + bw / 2 + 0.08, 3.62, 1.2, 0.4, "ret", size=11.5, color=ROSE)
# Yeniden aç: Tamamlandı → Devam Ediyor (üstten)
tx_ = pos["Tamamlandı"] + bw / 2
dx_ = pos["Devam Ediyor"] + bw / 2
arrow(s, tx_, y0 - 0.03, tx_, 1.95, GREEN, head=False)
arrow(s, tx_, 1.95, dx_, 1.95, GREEN, head=False)
arrow(s, dx_, 1.95, dx_, y0 - 0.03, GREEN)
text(s, dx_ + 0.2, 1.55, 2.6, 0.38, "yeniden aç · aynı tarihçe", size=11.5, color=GREEN, align=PP_ALIGN.CENTER)
# Direkt kabul kısa yolu
ax_ = pos["Taslak"] + bw / 2
kx_ = pos["Kabul Edildi"] + bw / 2
arrow(s, ax_, y0 - 0.03, ax_, 1.95, MUTED, head=False, dash=True)
arrow(s, ax_, 1.95, kx_, 1.95, MUTED, head=False, dash=True)
arrow(s, kx_, 1.95, kx_, y0 - 0.03, MUTED, dash=True)
text(s, ax_ + 0.3, 1.55, 4.4, 0.38, "direkt kabul / self-assign: Kabul Bekliyor atlanır", size=11.5, color=MUTED,
     align=PP_ALIGN.CENTER)
# İptal
label_box(s, pos["Tamamlandı"], 4.35, bw, bh, "İptal", "yalnızca Requester", SLATE_L, MUTED, tcolor=INK, tsize=16,
          line_w=1.75)
text(s, pos["Kabul Edildi"] - 0.1, 4.55, 2.2, 0.6, "Her açık aşamadan\nRequester iptal edebilir", size=11,
     color=MUTED, align=PP_ALIGN.CENTER)
box(s, 0.6, 5.65, 12.13, 1.15, WHITE, LINE)
text(s, 0.85, 5.72, 11.7, 1.05, [
    [("Kabul Bekliyor'da işe başlanamaz.  ", {"bold": True}),
     ("Durumu Assignee ve Üst yöneticileri değiştirir; Requester yalnızca iptal eder; Direktör her şeyi yapar.", {})],
    [("İki ayrı bekleme ölçümü: ", {"bold": True}), ("kabul bekleme süresi ve blok süresi raporlarda ayrı gösterilir.", {})],
], size=13.5, anchor=MSO_ANCHOR.MIDDLE)
notes(s, "Ana yol soldan sağa. Direkt kabulde Kabul Bekliyor atlanır. Bloklu için neden zorunlu, böylece blok süresi "
         "raporlanabiliyor. Tamamlanan Task yeni kayıt açmadan aynı tarihçede yeniden açılıyor.")

# ---------------------------------------------------------------- 8. Görünürlük & Bekleyen işlerim
s = new_slide("Kim neyi görür? Kimin üzerinde ne bekliyor?", "Görünürlük ve Bekleyen işlerim")
card(s, 0.6, 1.55, 5.95, 5.2, "Görünürlük kuralları", [
    [("Çalışan: ", {"bold": True}), ("açtığı, kendisine atanan ve Ekibi'ne atanan Task'lar", {})],
    [("Kabul bekleyen Task: ", {"bold": True}), ("hedef Çalışan ve yöneticileri hemen görür, Ekip arkadaşları görmez", {})],
    [("Team Head / Unit Head: ", {"bold": True}), ("altındaki Çalışanların ilişkili olduğu tüm Task'lar", {})],
    [("Direktör: ", {"bold": True}), ("her şey", {})],
    [("AI ajanı: ", {"bold": True}), ("asla kullanıcının göremediğini göremez", {})],
], ROSE, ROSE_L, size=17.5, space=14)
card(s, 6.78, 1.55, 5.95, 5.2, "Bekleyen işlerim panosu", [
    [("Çalışan: ", {"bold": True}), ("kabul bekleyen Task'lar ve etkinlik davetleri", {})],
    [("Yönetici, bunlara ek olarak: ", {"bold": True}), ("Ekip onayları, etkinlik onayları, Vekil olarak tuttukları, eskale edilenler", {})],
    [("Sıralama: ", {"bold": True}), ("termin ve bekleme yaşına göre", {})],
    [("Çok Ekipli Team Head: ", {"bold": True}), ("tek birleşik kutu, Ekip etiketleri ve filtreler", {})],
    "Aynı bileşen; içerik yetki katmanından beslenir",
], CYAN, CYAN_L, size=17.5, space=14)
notes(s, "Görünürlük tamamen yetki katmanında çözülüyor. Bekleyen işlerim, giriş sonrası açılan ilk sayfa: herkes "
         "üzerinde ne beklediğini tek yerde görüyor.")

# ---------------------------------------------------------------- 9. Vekalet & Eskalasyon
s = new_slide("Hiçbir onay takılı kalmaz", "Vekalet ve eskalasyon")
card(s, 0.6, 1.55, 5.95, 5.2, "Vekalet", [
    [("Kim Vekil olabilir? ", {"bold": True}), ("Kendi Ekibi'nden bir Çalışan veya Direktörlük'teki başka bir Yönetici", {})],
    [("Kim olamaz? ", {"bold": True}), ("Başka Ekip'in Çalışanı", {})],
    [("Süre: ", {"bold": True}), ("tarih aralığıyla tanımlanır, bitince kendiliğinden sona erer", {})],
    [("Kendi talebini onaylayamaz: ", {"bold": True}), ("talep bir üst yöneticiye düşer", {})],
    [("Şeffaflık: ", {"bold": True}), ("kararlar “X adına Y tarafından” diye kaydedilir", {})],
], VIOLET, VIOLET_L, size=16.5, space=14)
box(s, 6.78, 1.55, 5.95, 5.2, WHITE, LINE)
text(s, 7.0, 1.7, 5.5, 0.45, "Eskalasyon", size=17, bold=True)
# timeline
ty2 = 2.95
arrow(s, 7.2, ty2, 12.3, ty2, INK, w=2.25)
for x, t, sub, c in [(7.3, "Talep", "onay bekliyor", CYAN), (9.6, "3 iş günü", "ayarlanabilir", AMBER),
                     (11.7, "Unit Head", "eskale edilir", ROSE)]:
    pill(s, x - 0.13, ty2 - 0.13, 0.26, 0.26, "", c, c)
    text(s, x - 0.8, ty2 + 0.25, 1.6, 0.35, t, size=14, bold=True, color=c, align=PP_ALIGN.CENTER)
    text(s, x - 0.8, ty2 + 0.58, 1.6, 0.35, sub, size=11.5, color=MUTED, align=PP_ALIGN.CENTER)
text(s, 7.0, 4.15, 5.5, 2.5, [
    "Task kabulü ve etkinlik onayı aynı sayaç ve kuralı kullanır",
    "Etkinlik 3 iş gününden yakınsa eskalasyon etkinlikten bir gün öncesine çekilir",
    "Eskalasyon bildirim üretir ve Bekleyen işlerim'de görünür",
], size=16.5, bullet="•", space=14)
notes(s, "Vekalet ve eskalasyon veri modelinde baştan var. Vekil kendi ilişkili talebini onaylayamıyor; "
         "kararlar 'X adına Y tarafından' olarak denetim izine düşüyor.")

# ---------------------------------------------------------------- 10. Etkinlik, Yetkinlik, Duyuru
s = new_slide("Etkinlik, Yetkinlik ve Duyuru", "Aynı yetki modeli, üç modül")
card(s, 0.6, 1.55, 3.9, 4.15, "Etkinlik", [
    [("İç etkinlik: ", {"bold": True}), ("davet ve katılıyorum / katılmıyorum yanıtı", {})],
    [("Dış katılım: ", {"bold": True}), ("konferans/eğitim, Sorumlu yönetici onayı", {})],
    [("Dış konuşmacı: ", {"bold": True}), ("konuşmacı, kurum, konu, tarih; onaylı", {})],
], VIOLET, VIOLET_L, size=16, space=12)
card(s, 4.72, 1.55, 3.9, 4.15, "Yetkinlik", [
    "Sertifika ve eğitim kayıtları", "Bitiş tarihi ve bitmeden hatırlatma",
    "Yönetici Ekibinin yetkinlik ve etkinlik geçmişini görür",
], TEAL, TEAL_L, size=16, space=12)
card(s, 8.84, 1.55, 3.9, 4.15, "Duyuru", [
    "Yönetici yayınlar", "Hedef: Ekip, Unit veya tüm Direktörlük",
    "Hedef kitleye yeni duyuru bildirimi",
], CYAN, CYAN_L, size=16, space=12)
box(s, 0.6, 5.9, 12.13, 0.9, AMBER_L, None)
text(s, 0.85, 5.9, 11.7, 0.9,
     [[("Bildirim olayları: ", {"bold": True, "color": AMBER}),
       ("yeni atama · kabul/ret · blok · termin yaklaşma/geçme · eskalasyon · sertifika bitişi · etkinlik daveti · "
        "yeni duyuru. Uygulama içi, kullanıcı bazında açılıp kapatılır.", {})]],
     size=13.5, anchor=MSO_ANCHOR.MIDDLE)
notes(s, "Etkinlik tek varlık, tipi iç / dış katılım / dış konuşmacı. Dış etkinlik onayı Task kabulüyle aynı "
         "3 iş günü kuralını kullanıyor.")

# ---------------------------------------------------------------- 11. Raporlama
s = new_slide("Zaman nerede kayboluyor?", "Raporlama")
mets = [("Açık / kapalı oranı", "Ekip ve Çalışan bazında", TEAL, TEAL_L),
        ("Ortalama çözüm süresi", "oluşturma → tamamlanma", CYAN, CYAN_L),
        ("Kabul bekleme süresi", "zincirde geçen zaman", AMBER, AMBER_L),
        ("Blok süresi", "Bloklu'da geçen zaman", ROSE, ROSE_L),
        ("Ret raporu", "oran, gerekçe dağılımı, Ekip'ten Ekip'e ret akışı", VIOLET, VIOLET_L),
        ("Geciken Task sayısı", "termini geçmiş işler", GREEN, GREEN_L)]
for i, (t, d, c, cl) in enumerate(mets):
    x = 0.6 + (i % 3) * 4.1
    y = 1.55 + (i // 3) * 1.6
    box(s, x, y, 3.93, 1.42, cl, None)
    text(s, x + 0.25, y + 0.2, 3.5, 0.45, t, size=17, bold=True, color=c)
    text(s, x + 0.25, y + 0.7, 3.5, 0.65, d, size=13.5, color=INK)
box(s, 0.6, 4.9, 12.13, 1.9, WHITE, LINE)
text(s, 0.85, 5.0, 5.7, 1.75, [
    [("Kapsam: ", {"bold": True}), ("Çalışan kendi raporunu, Yönetici kendi alanını, Direktör tüm Unit'leri görür", {})],
    [("Çalışan sıralaması ", {"bold": True}), ("yalnızca yöneticilere açık", {})],
], size=15, bullet="•", space=10)
text(s, 6.75, 5.0, 5.8, 1.75, [
    [("Filtre: ", {"bold": True}), ("tarih aralığı, Ekip, Unit", {})],
    [("Tarihsel doğruluk: ", {"bold": True}),
     ("geçmiş, olayın gerçekleştiği tarihteki organizasyon yapısına göre hesaplanır (ADR-0002)", {})],
], size=15, bullet="•", space=10)
notes(s, "Kabul bekleme ve blok süresini ayrı tutmamızın sebebi, zamanın onay zincirinde mi yoksa işin kendisinde mi "
         "kaybolduğunu ayırmak. Bir Çalışan taşındığında eski Ekip'in geçmiş raporu değişmez.")

# ---------------------------------------------------------------- 12. AI ajanları
s = new_slide("AI ajanları: güvenli, sınırlı, izlenebilir", "REST API ve MCP")
label_box(s, 0.8, 1.75, 2.3, 0.85, "AI Ajanı", "kullanıcı adına token", SLATE_L, MUTED, tsize=15)
label_box(s, 0.6, 3.25, 1.6, 0.8, "REST API", "Express", GREEN_L, GREEN, tcolor=GREEN, tsize=14)
label_box(s, 2.4, 3.25, 1.6, 0.8, "MCP", "resmi TS SDK", GREEN_L, GREEN, tcolor=GREEN, tsize=14)
arrow(s, 1.55, 2.62, 1.4, 3.22, INK)
arrow(s, 2.35, 2.62, 3.2, 3.22, INK)
label_box(s, 0.6, 4.65, 3.4, 0.85, "Yetki servis katmanı", "kapsam kontrolü · görünürlük", ROSE_L, ROSE,
          tcolor=ROSE, tsize=15)
arrow(s, 1.4, 4.07, 1.4, 4.62, INK)
arrow(s, 3.2, 4.07, 3.2, 4.62, INK)
label_box(s, 0.6, 6.0, 1.6, 0.75, "Veri", None, VIOLET_L, VIOLET, tcolor=VIOLET, tsize=14)
label_box(s, 2.4, 6.0, 1.6, 0.75, "Denetim izi", "ajan işaretli", VIOLET_L, VIOLET, tcolor=VIOLET, tsize=13,
          ssize=10)
arrow(s, 1.4, 5.52, 1.4, 5.97, INK)
arrow(s, 3.2, 5.52, 3.2, 5.97, ROSE)
principles = [
    ("Kullanıcı adına çalışır", "Ajan, token sahibinin göremediği hiçbir veriyi göremez."),
    ("Ayrı okuma ve yazma kapsamı", "Varsayılan salt okunur. Demoda yazma kapsamı var ama kapalı gelir."),
    ("Her ajan işlemi işaretlenir", "Ajanın okumaları dahil tüm işlemleri denetim izine ajan bayrağıyla yazılır."),
    ("İnce adaptörler", "REST ve MCP iş kuralı içermez; ikisi de aynı servis katmanını çağırır."),
    ("Aynı yetenekler", "Task, Etkinlik, Yetkinlik, Duyuru ve raporlar her iki yüzeyde."),
]
for i, (t, d) in enumerate(principles):
    y = 1.6 + i * 1.03
    pill(s, 4.75, y + 0.08, 0.45, 0.45, str(i + 1), GREEN_L, GREEN, size=15)
    text(s, 5.4, y, 7.3, 0.4, t, size=17, bold=True)
    text(s, 5.4, y + 0.4, 7.3, 0.55, d, size=13.5, color=MUTED)
notes(s, "Spec'in en önemli güvenlik kararlarından biri: ajanlar erişimi asla genişletmez. Token kullanıcı adına, "
         "okuma ve yazma kapsamı ayrı, yazma varsayılan kapalı. Her ajan işlemi denetimde ayrıca işaretleniyor.")

# ---------------------------------------------------------------- 13. Mimari
s = new_slide("Mimari: her yol tek yetki katmanından geçer", "Mimari")
img = HERE / "assets" / "mimari.png"
pic_h = 5.25
pic = s.shapes.add_picture(str(img), Inches(0.6), Inches(1.5), height=Inches(pic_h))
pic.line.color.rgb = rgb(LINE)
pic_w = pic.width / 914400
rx = 0.6 + pic_w + 0.3
text(s, rx, 1.55, 12.73 - rx, 5.2, [
    [("Adaptörler ince: ", {"bold": True}), ("Web, REST ve MCP yalnızca isteği çözer ve servis katmanını çağırır.", {})],
    [("Yetki katmanı: ", {"bold": True}), ("kimlik, rol, görünürlük, Sorumlu/Üst yönetici, Vekil ve ajan kapsamı tek yerde.", {})],
    [("Tek transaction: ", {"bold": True}), ("her yazma, denetim kaydıyla birlikte atomik işlenir.", {})],
    [("Kabul motoru: ", {"bold": True}), ("zinciri üretir ve ilerletir; eskalasyon sayacı süre aşımlarını taşır.", {})],
], size=15, bullet="•", space=14)
notes(s, "Kullanıcı Web'den, ajan REST veya MCP'den gelir; her iki yol da aynı yetki katmanına girer. Yetki katmanı "
         "yazma işlemini tek transaction içinde denetim kaydıyla birlikte PostgreSQL'e yazar.")

# ---------------------------------------------------------------- 14. Kararlar & teknoloji
s = new_slide("Mimari kararlar, teknoloji ve test", "Nasıl inşa ettik?")
card(s, 0.6, 1.55, 5.95, 2.45, "ADR-0001 · Tek yetki servis katmanı", [
    "Web, REST ve MCP aynı katmanı çağırır; kurallar tek yerde yazılır ve test edilir",
    "Yüzey başına ayrı kontrol = ayrışan kurallar ve yetki sızıntısı riski",
], ROSE, ROSE_L, size=15, title_size=16)
card(s, 6.78, 1.55, 5.95, 2.45, "ADR-0002 · Eklemeli denetim izi, tarihsel yapı", [
    "Denetim kaydı DB trigger ile korunur: silme ve değiştirme yok, arşiv; 5 yıl saklama",
    "Üyelik ve yöneticilik tarih aralıklı; raporlar olay tarihindeki yapıyla",
], AMBER, AMBER_L, size=15, title_size=16)
text(s, 0.6, 4.25, 6, 0.4, "Teknoloji yığını", size=16, bold=True)
chips = ["TypeScript", "Node.js + Express 5", "PostgreSQL", "Prisma 6", "React 19 + Vite 7", "Vitest 3",
         "MCP TypeScript SDK", "Mock giriş → Entra ID/OIDC hazır"]
cx_, cy_ = 0.6, 4.75
for c in chips:
    w = 0.25 + len(c) * 0.105
    if cx_ + w > 6.6:
        cx_, cy_ = 0.6, cy_ + 0.55
    pill(s, cx_, cy_, w, 0.42, c, SLATE_L, INK, size=12, bold=False)
    cx_ += w + 0.12
card(s, 6.78, 4.25, 5.95, 2.55, "Test stratejisi", [
    "Tek seam: servis katmanı (kullanıcı kimliği + işlem)",
    "Gerçek PostgreSQL'e karşı, mock kullanıcılı küçük Direktörlük fixture'ı",
    "Yalnızca dış davranış: kim ne görür, işlem kime düşer, hangi geçiş izinli",
], TEAL, TEAL_L, size=15, title_size=16, space=11)
notes(s, "İki temel karar ADR olarak kayıtlı. Testler arayüzden değil, servis katmanından ve gerçek bir PostgreSQL'e karşı "
         "yazılıyor; böylece yetki kuralları doğrudan doğrulanıyor.")

# ---------------------------------------------------------------- 15. Uygulama durumu
s = new_slide("Uygulama durumu", "Nerede duruyoruz?")
tickets = [
    ("01", "İskelet, yetki katmanı, denetim izi", "ok"), ("02", "Organizasyon ve rol yönetimi", "ok"),
    ("03", "Task oluşturma, direkt kabul, görünürlük", "ok"), ("04", "Durum makinesi", "ok"),
    ("05", "Accept/refuse zinciri", "ok"), ("06", "Ekibe atama ve delegasyon", "plan"),
    ("07", "Alt task, yorum, ek, Backlog", "plan"), ("08", "Bildirim ve Bekleyen işlerim", "part"),
    ("09", "Vekalet ve eskalasyon", "plan"), ("10", "İç etkinlik, duyuru, yetkinlik", "ok"),
    ("11", "Dış etkinlik onayı, dış konuşmacı", "plan"), ("12", "Raporlama", "part"),
    ("13", "REST API ve MCP: Task", "plan"), ("14", "API ve MCP: etkinlik, yetkinlik, rapor", "plan"),
    ("15", "Uçtan uca demo doğrulama", "plan"),
]
style = {"ok": (GREEN, GREEN_L, "Tamamlandı"), "part": (AMBER, AMBER_L, "Kısmen"), "plan": (MUTED, SLATE_L, "Sırada")}
for i, (n, t, st) in enumerate(tickets):
    col, row = i % 3, i // 3
    x, y = 0.6 + col * 4.1, 1.5 + row * 0.92
    c, cl, lab = style[st]
    box(s, x, y, 3.93, 0.8, WHITE, LINE)
    pill(s, x + 0.15, y + 0.17, 0.55, 0.46, n, cl, c, size=13)
    text(s, x + 0.8, y + 0.05, 2.0, 0.7, t, size=12.5, anchor=MSO_ANCHOR.MIDDLE)
    pill(s, x + 2.82, y + 0.24, 0.98, 0.32, lab, cl, c, size=10.5)
text(s, 0.6, 6.15, 12.1, 0.7, [
    [("Kısmen: ", {"bold": True, "color": AMBER}),
     ("08'de bildirim tercihleri ve termin bildirimleri, 12'de tarih aralığı filtresi ve olay tarihli yapı açık.  ", {}),
     ("Durum: 18 Kasım 2026, feat/dashboard-gelistirme.", {"color": MUTED})]], size=12)
notes(s, "15 ticket'ın 6'sı tamamlandı, 2'si kısmen. Demoda tamamlanan akışları canlı göstereceğiz; kalanlar yol haritasında.")

# ---------------------------------------------------------------- 16. Demo akışı
s = new_slide("Canlı demo akışı", "Demo")
steps = [
    ("Giriş ve organizasyon", "Mock giriş ile rol seçimi; Deniz Demir (Direktör) ile yapıyı göster"),
    ("Ekipler arası Task", "Fatma Çelik (WAF) → Kerem Özdemir (CTI, başka Unit) için Task açar: Kabul Bekliyor"),
    ("İki halkalı kabul", "Kerem Bekleyen işlerim'den kabul eder, ardından Ece Arslan (TH CTI) onaylar"),
    ("Ret senaryosu", "Gerekçe zorunlu; Task Reddedildi, Requester yeniden atar ya da iptal eder"),
    ("İş takibi", "Devam Ediyor → Bloklu (neden) → Tamamlandı; pano ve durum tarihçesi"),
    ("Yönetici görünümü", "Cem Yıldız (WAF + SOC): birleşik Bekleyen işlerim ve direkt kabul ile atama"),
    ("Rapor", "Ayşe Kaya (UH Savunma): açık/kapalı, kabul bekleme ve blok süresi, ret raporu"),
    ("Etkinlik ve denetim", "İç etkinlik daveti, duyuru, bildirimler ve denetim izi kayıtları"),
]
for i, (t, d) in enumerate(steps):
    col, row = i // 4, i % 4
    x, y = 0.6 + col * 6.18, 1.55 + row * 1.3
    box(s, x, y, 5.95, 1.15, WHITE, LINE)
    pill(s, x + 0.2, y + 0.3, 0.55, 0.55, str(i + 1), TEAL, WHITE, size=17)
    text(s, x + 0.95, y + 0.12, 4.85, 0.4, t, size=16, bold=True)
    text(s, x + 0.95, y + 0.5, 4.85, 0.62, d, size=12.5, color=MUTED)
notes(s, "Sunum sırası: önce Direktör ile organizasyon, sonra Fatma'dan Kerem'e ekipler arası Task ve iki halkalı kabul. "
         "Ardından ret, durum akışı, çok Ekipli Team Head'in kutusu ve Unit Head rapor ekranı. "
         "Uygulama: npm run dev → http://localhost:5173 (seed verisi her açılışta yeniden yüklenir).")

# ---------------------------------------------------------------- 17. Yol haritası
s = new_slide("Yol haritası", "Sırada ne var?")
card(s, 0.6, 1.55, 5.95, 5.2, "Demo turunu tamamlayanlar", [
    "06 · Ekibe atama, delegasyon ve havuza dönüş",
    "07 · Alt task, yorum, dosya eki ve Backlog",
    "09 · Vekalet ve eskalasyon",
    "11 · Dış etkinlik onayı ve dış konuşmacı",
    "13–14 · REST API ve MCP sunucusu",
    "15 · Uçtan uca demo doğrulama ve zengin seed",
], TEAL, TEAL_L, size=18, space=14)
card(s, 6.78, 1.55, 5.95, 5.2, "Demo sonrası", [
    "Entra ID / OIDC ile gerçek SSO",
    "E-posta, Teams ve Slack bildirimleri",
    "Tekrarlayan task ve tekrar şablonları",
    "CSV dışa aktarım",
    "Harici ticket / SIEM / ITSM entegrasyonu",
    "Ajan yazma kapsamının kontrollü açılması",
], VIOLET, VIOLET_L, size=18, space=14)
notes(s, "Sol sütun spec'teki kalan ticket'lar; sağ sütun spec'te bilinçli olarak kapsam dışı bırakılan, demo sonrasına "
         "planlanan başlıklar.")

# ---------------------------------------------------------------- 18. Kapanış
s = new_slide(dark=True)
box(s, 0, 0, 0.28, 7.5, TEAL, None, shape=MSO_SHAPE.RECTANGLE)
text(s, 1.0, 2.2, 11, 1.2, "Teşekkürler", size=60, bold=True, color=WHITE)
text(s, 1.0, 3.45, 11, 0.8, "Sorular?", size=30, color="5EEAD4")
text(s, 1.0, 4.6, 11, 1.2, [
    "Siber Task · tek yetki katmanı · hiyerarşiye göre kabul akışı · silinemez denetim izi",
], size=16, color="94A3B8")
notes(s, "Kapanış ve soru-cevap.")

assert _count == TOTAL, _count
prs.save(OUT)
print(f"OK {OUT} ({_count} slayt)")
