"""Generate three additional synthetic Whitfield records.

04  MRI/MRV radiology report      born-digital, negation-rich impression
05  Neuro-ophthalmology follow-up born-digital, diagnosis + causation rich
06  Urgent-care fax               image-only scan, degraded for OCR stress

All names, providers, identifiers fictional.
"""
import io, math, random
import fitz
from PIL import Image, ImageFilter, ImageEnhance

random.seed(7)
W, H = 612, 792  # US Letter, points
MARGIN = 54

def new_page(doc):
    return doc.new_page(width=W, height=H)

def header(page, facility, sub, right):
    page.insert_text((MARGIN, 50), facility, fontsize=13, fontname="hebo")
    page.insert_text((MARGIN, 64), sub, fontsize=8.5, fontname="helv", color=(0.3,0.3,0.3))
    page.insert_text((W-MARGIN-180, 50), right, fontsize=8.5, fontname="helv", color=(0.3,0.3,0.3))
    page.draw_line((MARGIN, 74), (W-MARGIN, 74), color=(0.15,0.29,0.45), width=1.2)

def block(page, y, title):
    page.insert_text((MARGIN, y), title.upper(), fontsize=8.5, fontname="hebo", color=(0.15,0.29,0.45))
    page.draw_line((MARGIN, y+4), (W-MARGIN, y+4), color=(0.8,0.84,0.88), width=0.6)
    return y + 18

def para(page, y, text, size=9.5, font="helv", lh=13.5, indent=0):
    rect = fitz.Rect(MARGIN+indent, y-10, W-MARGIN, H-MARGIN)
    used = page.insert_textbox(rect, text, fontsize=size, fontname=font, lineheight=1.32)
    # insert_textbox returns leftover space; compute lines used
    lines = max(1, math.ceil(fitz.get_text_length(text, fontname=font, fontsize=size) /
                             (W - 2*MARGIN - indent)))
    # crude but adequate: count wrapped lines via splitting
    return y + lh * (text.count("\n") + lines)

def lines(page, y, rows, size=9.5, font="helv", lh=13.5, indent=0):
    for r in rows:
        page.insert_text((MARGIN+indent, y), r, fontsize=size, fontname=font)
        y += lh
    return y

# ─────────────────────────────── Doc 04: MRI/MRV report ──────────────────
d4 = fitz.open()
p = new_page(d4)
header(p, "Springfield Imaging Center", "Department of Neuroradiology — 4410 Concord Pkwy, Springfield",
       "Report ID: SIC-2022-88417")
y = 92
y = lines(p, y, [
    "PATIENT:  WHITFIELD, DANA L.        DOB: 03/14/1991      MRN: SIC-77320",
    "EXAM:     MRI BRAIN W/WO CONTRAST (CPT 70551) + MRV HEAD    DATE: 12/02/2022",
    "REFERRER: P. NATARAJAN, MD — Springfield Neurology Associates",
], size=9, font="cour", lh=13)
y += 8
y = block(p, y, "Clinical history")
y = lines(p, y, [
    "31-year-old female with two months of progressive headaches and transient",
    "visual obscurations. Fundoscopic exam 11/21/2022 documented bilateral",
    "papilledema. Patient denies pulsatile tinnitus. Presents without vision",
    "loss at time of exam. Evaluate for secondary causes of intracranial",
    "hypertension prior to lumbar puncture.",
])
y += 8
y = block(p, y, "Technique")
y = lines(p, y, [
    "Multiplanar multisequence MRI brain performed before and after 7 mL",
    "gadobutrol. 2D time-of-flight MRV of the head performed without contrast.",
])
y += 8
y = block(p, y, "Findings")
y = lines(p, y, [
    "Brain parenchyma: No acute infarct, hemorrhage, mass, or mass effect.",
    "Ventricles: Normal in size and configuration. No hydrocephalus.",
    "Sella: Partially empty sella noted.",
    "Orbits: Mild flattening of the posterior globes bilaterally with",
    "  distension and tortuosity of the optic nerve sheath complexes,",
    "  findings that can be seen with elevated intracranial pressure.",
    "Venous system (MRV): The dural venous sinuses are patent. No evidence",
    "  of dural venous sinus thrombosis or focal high-grade stenosis.",
])
p.insert_text((MARGIN, H-58), "Page 1 of 2 — Springfield Imaging Center — CONFIDENTIAL", fontsize=7.5, color=(0.4,0.4,0.4))

p = new_page(d4)
header(p, "Springfield Imaging Center", "Report continuation — WHITFIELD, DANA L. — 12/02/2022",
       "Report ID: SIC-2022-88417")
y = 92
y = block(p, y, "Impression")
y = lines(p, y, [
    "1. No intracranial mass, hemorrhage, or venous sinus thrombosis.",
    "2. Partially empty sella, posterior globe flattening, and optic nerve",
    "   sheath distension: constellation compatible with idiopathic",
    "   intracranial hypertension in the appropriate clinical setting.",
    "3. Recommend correlation with lumbar puncture opening pressure.",
])
y += 10
y = block(p, y, "Electronically signed")
y = lines(p, y, [
    "R. Vasquez, MD — Neuroradiology            Signed: 12/02/2022 16:41",
    "Transcribed: 12/02/2022 16:12   Dictated: 12/02/2022 15:58",
], size=9, font="cour", lh=13)
p.insert_text((MARGIN, H-58), "Page 2 of 2 — Springfield Imaging Center — CONFIDENTIAL", fontsize=7.5, color=(0.4,0.4,0.4))
d4.save("fixtures/records/mock_record_04_mri_mrv_radiology.pdf")
print("doc 04 written:", d4.page_count, "pages")

# ─────────────────── Doc 05: Neuro-ophthalmology follow-up ───────────────
d5 = fitz.open()
p = new_page(d5)
header(p, "Northgate Eye Specialists", "Neuro-Ophthalmology Service — 2210 Northgate Blvd, Suite 300",
       "Encounter: NE-2023-01447")
y = 92
y = lines(p, y, [
    "PATIENT:  WHITFIELD, DANA L.      DOB: 03/14/1991     MRN: NES-30916",
    "VISIT:    FOLLOW-UP CONSULT       DATE: 01/20/2023    PROVIDER: C. OKAFOR, MD",
], size=9, font="cour", lh=13)
y += 8
y = block(p, y, "Interval history")
y = lines(p, y, [
    "Returns six weeks after diagnosis of idiopathic intracranial hypertension",
    "(G93.2), confirmed by lumbar puncture on 12/16/2022 with opening pressure",
    "of 32 cm H2O. Acetazolamide 500 mg PO BID started 12/16/2022 and has been",
    "tolerated aside from mild paresthesias. Depo-Provera (medroxyprogesterone",
    "acetate) was discontinued as of 01/05/2023 given the temporal relationship",
    "between injectable contraceptive exposure and symptom onset; treating",
    "providers agree the agent is best regarded as a contributing factor and",
    "should be discontinued permanently.",
])
y += 8
y = block(p, y, "Current symptoms")
y = lines(p, y, [
    "Headaches are markedly improved: two mild episodes in the past month",
    "versus daily headaches in November. Denies pulsatile tinnitus. No",
    "transient visual obscurations since early January. Reports vision is",
    "subjectively back to baseline.",
])
y += 8
y = block(p, y, "Examination")
y = lines(p, y, [
    "VA 20/20 OD, 20/20 OS. Pupils equal, no RAPD. Color plates 14/14 OU.",
    "Fundus: optic disc edema improving; Frisen grade 1 OU (previously",
    "grade 3 OD, grade 2 OS on 11/21/2022). No hemorrhages.",
])
p.insert_text((MARGIN, H-58), "Page 1 of 3 — Northgate Eye Specialists — CONFIDENTIAL", fontsize=7.5, color=(0.4,0.4,0.4))

p = new_page(d5)
header(p, "Northgate Eye Specialists", "Humphrey Visual Field 24-2 SITA-Fast — WHITFIELD, DANA L.",
       "Test date: 01/20/2023")
y = 92
y = block(p, y, "Visual field summary")
y = lines(p, y, [
    "            RIGHT EYE (OD)            LEFT EYE (OS)",
    "  MD:         -2.8 dB                    -2.1 dB",
    "  PSD:         2.9 dB                     2.4 dB",
    "  VFI:          94%                        96%",
    "  Reliability: FL 1/13  FP 2%  FN 1%     FL 0/13  FP 1%  FN 2%",
], size=9, font="cour", lh=14)
y += 8
y = block(p, y, "Interpretation")
y = lines(p, y, [
    "Enlarged blind spot OU, improved from 12/16/2022 baseline (MD -5.4 / -4.6).",
    "No new focal defects. Findings consistent with resolving papilledema.",
])
p.insert_text((MARGIN, H-58), "Page 2 of 3 — Northgate Eye Specialists — CONFIDENTIAL", fontsize=7.5, color=(0.4,0.4,0.4))

p = new_page(d5)
header(p, "Northgate Eye Specialists", "OCT RNFL Analysis + Plan — WHITFIELD, DANA L.",
       "Test date: 01/20/2023")
y = 92
y = block(p, y, "OCT retinal nerve fiber layer")
y = lines(p, y, [
    "  Average RNFL:   OD 128 um (prev 186)     OS 119 um (prev 171)",
    "  Superior:       OD 156 um                OS 149 um",
    "  Inferior:       OD 161 um                OS 152 um",
    "  Interpretation: optic disc edema resolving bilaterally.",
], size=9, font="cour", lh=14)
y += 8
y = block(p, y, "Assessment and plan")
y = lines(p, y, [
    "1. Idiopathic intracranial hypertension (G93.2) — clinically improving on",
    "   acetazolamide 500 mg BID. Continue current dose; recheck in 8 weeks.",
    "2. Papilledema, bilateral (H47.10) — Frisen grade 1 OU, improving.",
    "3. Contraception counseling deferred to gynecology; injectable",
    "   medroxyprogesterone remains contraindicated in this patient.",
    "4. Return precautions reviewed for headache or new visual symptoms.",
])
y += 8
y = lines(p, y, ["Electronically signed: C. Okafor, MD — 01/20/2023 15:22"], size=9, font="cour")
p.insert_text((MARGIN, H-58), "Page 3 of 3 — Northgate Eye Specialists — CONFIDENTIAL", fontsize=7.5, color=(0.4,0.4,0.4))
d5.save("fixtures/records/mock_record_05_neuro_ophthalmology_followup.pdf")
print("doc 05 written:", d5.page_count, "pages")

# ─────────────────── Doc 06: Urgent-care fax (scanned) ────────────────────
d6 = fitz.open()
p = new_page(d6)
header(p, "Riverbend Urgent Care", "After-Hours Clinic — 88 Riverbend Rd — FAX TRANSMITTAL",
       "Fax: 09/30/2022 21:47")
y = 92
y = lines(p, y, [
    "PATIENT: WHITFIELD, DANA L.    DOB: 03/14/1991    ACCT: RUC-55201",
    "VISIT:   09/30/2022 19:05      PROVIDER: T. MALLOY, PA-C",
], size=9, font="cour", lh=13)
y += 8
y = block(p, y, "Chief complaint / HPI")
y = lines(p, y, [
    "Severe headache x 5 days, throbbing, worse when lying flat and with",
    "bending. Episodes of blurred vision lasting seconds when standing.",
    "Reports headache unrelieved by ibuprofen 400 mg at home. LMP notes",
    "patient receives depo provera injection for contraception; last",
    "injection 07/19/2022 per patient. Denies fever, denies neck stiffness,",
    "denies trauma.",
])
y += 8
y = block(p, y, "Medications given in clinic")
y = lines(p, y, [
    "  SUMATRIPTAN 6 MG SUBCUTANEOUS x1        LOT SM2209  2005",
    "  IBUPROFEN 600 MG PO x1                  LOT IB4410  2010",
], size=10, font="cour", lh=15)
y += 6
y = block(p, y, "Course")
y = lines(p, y, [
    "Partial relief of headache after sumatriptan. Neuro exam grossly intact.",
    "Visual acuity screen 20/25 OU. Discharged ambulatory in stable condition.",
])
p.insert_text((MARGIN, H-58), "RIVERBEND URGENT CARE — PAGE 1 OF 2", fontsize=7.5, color=(0.35,0.35,0.35))

p = new_page(d6)
header(p, "Riverbend Urgent Care", "Discharge instructions — WHITFIELD, DANA L. — 09/30/2022",
       "Fax: 09/30/2022 21:47")
y = 92
y = block(p, y, "Discharge instructions")
y = lines(p, y, [
    "1. IBUPROFEN 600 mg by mouth every 8 hours with food as needed x 3 days.",
    "2. Return immediately for worsening headache, repeated blurred vision,",
    "   vision loss, weakness, or confusion.",
    "3. Follow up with primary care within one week. Discuss recurrent",
    "   headaches and contraceptive management (depo provera) with PCP.",
    "4. Referral placed: ophthalmology evaluation for visual symptoms.",
])
y += 8
y = block(p, y, "Signature")
y = lines(p, y, [
    "T. MALLOY, PA-C            Countersigned: H. BRENNAN, MD  10/01/2022",
], size=9, font="cour")
p.insert_text((MARGIN, H-58), "RIVERBEND URGENT CARE — PAGE 2 OF 2", fontsize=7.5, color=(0.35,0.35,0.35))

# rasterize + degrade → image-only scan
scan = fitz.open()
for i in range(d6.page_count):
    pm = d6[i].get_pixmap(dpi=170)
    img = Image.frombytes("RGB", (pm.width, pm.height), pm.samples).convert("L")
    img = img.rotate(random.uniform(-0.8, 0.8), expand=False, fillcolor=245)
    img = img.resize((int(img.width*0.62), int(img.height*0.62)))       # ~105 dpi
    img = img.filter(ImageFilter.GaussianBlur(0.55))
    px = img.load()
    for _ in range(int(img.width*img.height*0.012)):                    # salt & pepper
        x, y2 = random.randrange(img.width), random.randrange(img.height)
        px[x, y2] = random.choice((30, 40, 215, 230))
    img = ImageEnhance.Contrast(img).enhance(0.82)
    img = ImageEnhance.Brightness(img).enhance(1.05)
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=48)
    pg = scan.new_page(width=W, height=H)
    pg.insert_image(fitz.Rect(0, 0, W, H), stream=buf.getvalue())
scan.save("fixtures/records/mock_record_06_urgent_care_fax_scanned.pdf")
print("doc 06 written (scanned):", scan.page_count, "pages")
