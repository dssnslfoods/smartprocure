# Handoff — Smart Procurement (สำหรับ AI เลขาส่วนตัว)

> เอกสารนี้ให้ AI agent ที่ทำหน้าที่ "เลขาส่วนตัว" เข้าใจระบบ Smart Procurement
> เพื่อช่วยเจ้าของ (arpaket@gmail.com) ดูแล/สั่งงาน/ตอบคำถามเกี่ยวกับระบบได้
> อัปเดตล่าสุด: 18 มิ.ย. 2026 (พ.ศ. 2569)

---

## 1. ระบบนี้คืออะไร

**Smart Procurement** = ระบบจัดซื้อจัดจ้างแบบ **multi-tenant** (รองรับหลายบริษัทในระบบเดียว)
สำหรับธุรกิจอาหาร — ครอบคลุมตั้งแต่จัดการผู้จัดจำหน่าย, แค็ตตาล็อกราคา, ขอใบเสนอราคา (RFQ),
ประมูล (e-Bidding) ไปจนถึงมอบงาน (Award) และอนุมัติ

- **เว็บใช้งานจริง (Live):** https://smartprocurement-2026.web.app
- **โค้ด (GitHub):** `github.com:dssnslfoods/smartprocure` (branch หลัก `main`)
- **โฟลเดอร์ในเครื่อง:** `/Users/golf/Desktop/Projects/smartprocure`

---

## 2. Tech Stack & โครงสร้าง

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui |
| Backend / DB | Supabase (PostgreSQL + RLS + Auth + Storage) |
| Hosting | Firebase Hosting — project `smartprocurement-2026` |
| i18n | ภาษาไทย/อังกฤษ (สลับด้วยปุ่ม EN/ไทย ในไซด์บาร์) |

- Supabase project ref: `gqhtejfkcezaymrwlgry`
- การเข้าถึง DB/Supabase ทำผ่าน Supabase MCP หรือ service role key ใน `.env` (อย่าเผยแพร่ key)

---

## 3. ผู้ใช้ & สิทธิ์ (Roles)

6 บทบาท: `super_admin` · `admin` · `procurement_officer` · `approver` · `executive` · `supplier`

- **เจ้าของระบบ (Super Admin):** `arpaket@gmail.com` — เห็นทุก tenant, จัดการ tenants/users ได้
- **Admin ของบริษัท:** 5 บัญชี (`@nslfoods.com` + `arnon@def2design.com`) — ดูแล tenant ที่สังกัด
- การเป็น admin ของหลาย tenant ได้ → ตอน login จะมีหน้าให้เลือกบริษัทก่อนเข้า

> หมายเหตุ: AI **ดูหรือเปลี่ยนรหัสผ่านในรูปข้อความไม่ได้** (Supabase เก็บแบบ hash) ทำได้แค่ "ตั้งใหม่"
> Super Admin สามารถ assign admin ให้แต่ละ tenant ได้ที่ **Super Admin → All Users → Assign as Admin**

---

## 4. บริษัท (Tenants) & ข้อมูลปัจจุบัน

มี 2 tenants: **NSL Foods PLC** และ **Pro Natural Foods Co., Ltd.**

ข้อมูลส่วนใหญ่อยู่ใน **Pro Natural Foods** (snapshot ล่าสุด):

| ข้อมูล | จำนวน |
|---|---|
| ผู้จัดจำหน่าย (Suppliers) | 108 |
| เล่ม Catalog (Price Lists) | 17 |
| รายการในแค็ตตาล็อก (Items) | 1,622 |
| RFQ (ตัวอย่างทดสอบ) | 4 |
| Awards (ตัวอย่างทดสอบ) | 2 (AWD-2569-001, AWD-2569-002) |
| ผู้ใช้ทั้งหมด | 7 |

> ข้อมูล RFQ/Awards เป็น **ตัวอย่างทดสอบ** ล้างได้ที่ Admin Settings → ระบบ (ดูข้อ 7)

---

## 5. โครงสร้างเมนู (Side Menu) — 11 โมดูล

| กลุ่ม | เมนู | ประเภทข้อมูล |
|---|---|---|
| **แผงควบคุม** | Dashboard | — |
| **ผู้จัดจำหน่าย** | Supplier Approvals · Suppliers · Vendor Risk · นำเข้าข้อมูล | Master Data |
| **ราคา** | Price Lists (Master Catalog) | Master Data |
| **จัดซื้อ** | RFQ · e-Bidding · Final Quotations · Awards | **Transaction Data** |
| **รายงาน** | Reports | — |
| **ระบบ** (footer) | Admin Settings · เปลี่ยนภาษา | ตั้งค่า |
| **Super Admin** | Tenants · All Users · Global Settings | เฉพาะ super_admin |

**สำคัญ:** "Master Data" (Suppliers, Catalog) = ข้อมูลถาวร · "Transaction Data" (กลุ่มจัดซื้อ) = ข้อมูลธุรกรรมที่ล้างได้

---

## 6. Workflow หลัก: เสนอราคา → ประกาศผู้ชนะ

```
1. เผยแพร่ RFQ (จัดซื้อ)            → status: published
2. ผู้ขายเสนอราคา / e-Bidding       → quotations / bid_entries
3. ประเมิน & ให้คะแนน (จัดซื้อ)     → status: evaluation, จัดอันดับ
4. สร้าง Final Quotation (จัดซื้อ)  → status: pending
5. คัดเลือกผู้ชนะ (3 ปุ่มต่อเนื่อง):
      เลือกเป็นผู้ชนะ → ยืนยันพร้อม PO → สร้างใบมอบงาน
6. อนุมัติใบมอบงาน (ผู้อนุมัติ)      → approved / rejected
7. ประกาศผู้ชนะ & ออก PO            → awarded → po_issued → completed
```

- ระบบออกเลข **Award No. อัตโนมัติ** รูปแบบ `AWD-{ปีพ.ศ.}-{NNN}` ต่อ tenant
- กันการสร้าง award ซ้ำจากใบเสนอราคาเดียวกัน (unique constraint)
- ผู้อนุมัติ = role `admin` หรือ `approver`

---

## 7. งานที่เจ้าของมักสั่ง (Common Tasks)

| งาน | ทำที่ไหน / อย่างไร |
|---|---|
| **นำเข้า Supplier จาก Excel** | เมนู ผู้จัดจำหน่าย → นำเข้าข้อมูล (มี template + ตรวจ validate) |
| **นำเข้า/ส่งออก Catalog (Excel)** | Price Lists → ปุ่ม "นำเข้า Excel" / "Export Excel" |
| **ย้าย/จัดการข้อมูลข้าม tenant** | ผ่าน Super Admin หรือสั่ง Claude Code ทำผ่าน SQL |
| **ล้างข้อมูลทดสอบก่อนใช้จริง** | Admin Settings → แท็บ "ระบบ" → "ล้างข้อมูล Transaction" (พิมพ์ "ล้างข้อมูล" ยืนยัน) — ลบเฉพาะ RFQ/Bidding/Quotation/Award **ไม่แตะ** Supplier/Catalog |
| **assign admin ดูแล tenant** | Super Admin → All Users → "Assign as Admin" → เลือก tenant |
| **สร้างผู้ใช้ / รีเซ็ตรหัสผ่าน** | Admin Settings → Users |
| **ตั้งค่าอีเมลแจ้งเตือน / รอบ pricelist** | Admin Settings → Email / Pricelist |

---

## 8. การแก้ไขโค้ด & Deploy (workflow มาตรฐาน)

งานที่ต้องแก้โค้ด/ฐานข้อมูล ให้สั่งผ่าน **Claude Code** (CLI ในโฟลเดอร์โปรเจกต์)
เจ้าของใช้ workflow นี้ทุกครั้ง:

```
1. สร้าง feature branch จาก main
2. แก้โค้ด → commit
3. git merge --no-ff เข้า main
4. npm run build
5. firebase deploy --only hosting
6. git push origin main
7. ลบ feature branch ที่ merge แล้ว (อัตโนมัติ ไม่ต้องถาม)
```

- DB schema เปลี่ยนผ่าน Supabase migration (เก็บใน `supabase/migrations/`)
- เปลี่ยนแล้วต้อง deploy เว็บถึงจะเห็นผล (เว็บเป็น static build)

---

## 9. ข้อควรระวัง (Gotchas)

- **Multi-tenant isolation:** ข้อมูลแยกตาม `tenant_id` — ระวังอย่าให้ข้อมูลข้าม tenant
  - ⚠️ มีช่องโหว่ RLS ที่ยังไม่แก้: ตาราง `supplier_certificates`, `supplier_risk_assessments`,
    `award_approvals`, `rfq_evaluations` เปิดกว้างเกินไป (user ข้าม tenant อ่าน/แก้ได้) — ควรแก้ถ้าจะใช้ production จริงหลาย tenant
  - ⚠️ Storage bucket `supplier-documents`/`supplier-certificates` เปิด public listing
- **ลบข้อมูลถาวร:** การลบ/ล้างข้อมูลกู้คืนไม่ได้ — ยืนยันก่อนเสมอ
- **ปี:** ระบบใช้ปี พ.ศ. ในเลขเอกสาร (เช่น AWD-2569 = ค.ศ. 2026)
- **Lint:** มี lint warning (`no-explicit-any`) เยอะ แต่ไม่กระทบการทำงาน (build/types ผ่าน)

---

## 10. สรุปสำหรับเลขา

เมื่อเจ้าของถามถึง "ระบบ" หรือ "ระบบจัดซื้อ" = หมายถึง Smart Procurement นี้
- งาน **ใช้งาน/ดูข้อมูล/ตั้งค่า** → ชี้ไปที่เมนูในเว็บ (ข้อ 5, 7)
- งาน **แก้โค้ด/ฐานข้อมูล/deploy** → สั่งผ่าน Claude Code ตาม workflow ข้อ 8
- งาน **ถามภาพรวม/สถานะข้อมูล** → ใช้ข้อมูลในเอกสารนี้ หรือ query Supabase (project `gqhtejfkcezaymrwlgry`)
- เรื่อง **ความปลอดภัย/รหัสผ่าน** → ทำผ่าน Super Admin/Admin Settings เท่านั้น ไม่เปิดเผย key/รหัส
