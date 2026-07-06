import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  HelpCircle, Search, LayoutDashboard, Building2, ClipboardCheck, FileBadge,
  FileText, Send, Scale, Gavel, Award, BarChart3, Settings, Briefcase,
  CircleHelp, ShieldAlert, Info,
} from 'lucide-react';

type Block = { heading?: string; points: string[] };
type Section = {
  id: string;
  icon: React.ElementType;
  title: string;
  roles: string[];       // roles that should see this section
  intro?: string;
  blocks: Block[];
};

const ALL = ['admin', 'procurement_officer', 'approver', 'executive', 'supplier'];
const STAFF = ['admin', 'procurement_officer', 'approver', 'executive'];

const SECTIONS: Section[] = [
  {
    id: 'overview',
    icon: Info,
    title: 'ภาพรวมระบบ & บทบาทผู้ใช้',
    roles: ALL,
    intro: 'Smart Procurement คือระบบจัดซื้อครบวงจร ตั้งแต่จัดการผู้จัดจำหน่าย ประเมินความเสี่ยงตามมาตรฐาน BRCGS ขอราคา (RFQ) ประมูล (e-Bidding) เปรียบเทียบ จนถึงมอบงาน (Award)',
    blocks: [
      {
        heading: 'บทบาทผู้ใช้ (Roles)',
        points: [
          'Admin — ผู้ดูแลระบบ จัดการผู้ใช้ ตั้งค่า และเข้าถึงได้ทุกเมนู',
          'Procurement Officer — เจ้าหน้าที่จัดซื้อ สร้าง RFQ ประมูล เปรียบเทียบราคา จัดการผู้จัดจำหน่าย',
          'Approver — ผู้อนุมัติ พิจารณาอนุมัติการมอบงานและผู้จัดจำหน่าย',
          'Executive — ผู้บริหาร ดูรายงานและภาพรวม',
          'Supplier — ผู้จัดจำหน่าย เข้าพอร์ทัลเพื่อกรอกข้อมูล อัปโหลดเอกสาร ส่งใบเสนอราคา และร่วมประมูล',
        ],
      },
      {
        heading: 'การเข้าใช้งานทั่วไป',
        points: [
          'เมนูด้านซ้ายจะแสดงเฉพาะรายการที่บทบาทของคุณมีสิทธิ์เข้าถึง',
          'สลับภาษาไทย/อังกฤษได้ที่ปุ่มภาษาด้านล่างเมนู',
          'ย่อ/ขยายเมนูด้วยปุ่มลูกศรมุมล่างซ้าย',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'แผงควบคุม (Dashboard)',
    roles: ALL,
    blocks: [
      {
        points: [
          'สรุปตัวเลขสำคัญ: จำนวนผู้จัดจำหน่าย, RFQ ที่เปิดอยู่, รอตรวจใบเสนอราคา, รอมอบงาน',
          'การ์ดความเสี่ยง: ผู้จัดจำหน่ายเสี่ยงสูง/วิกฤต และการมอบงานให้รายที่มีความเสี่ยง',
          'การ์ด "Expired Certificates" — รวมใบรับรอง (supplier_certificates) และเอกสารประเมิน BRCGS ที่หมดอายุ คลิกเพื่อดูรายการทั้งหมด พร้อมป้ายบอกแหล่ง (ใบรับรอง / BRCGS)',
          'มูลค่าประหยัด (ส่วนลด) และเวลาเฉลี่ยของรอบ RFQ',
          'ฟีดกิจกรรมล่าสุดแบบเรียลไทม์',
        ],
      },
    ],
  },
  {
    id: 'suppliers',
    icon: Building2,
    title: 'ผู้จัดจำหน่าย (Suppliers)',
    roles: STAFF,
    intro: 'จัดการข้อมูลผู้จัดจำหน่าย ตั้งแต่ลงทะเบียน อนุมัติ เอกสาร จนถึงการประเมินความเสี่ยง',
    blocks: [
      {
        heading: 'สถานะและการอนุมัติ',
        points: [
          'วงจรสถานะ: draft → submitted → review → approved / rejected',
          'Admin/Approver เปลี่ยนสถานะได้จากหน้า Supplier Detail',
          'เมนู "อนุมัติผู้จัดจำหน่าย" รวมรายการที่รอพิจารณา',
          'เมื่อเพิ่มอีเมลให้ผู้จัดจำหน่าย ระบบจะสร้างบัญชีเข้าใช้งาน (auth) ให้อัตโนมัติ',
        ],
      },
      {
        heading: 'แท็บในหน้าผู้จัดจำหน่าย',
        points: [
          'Information — ข้อมูลบริษัท ที่อยู่ ผู้ติดต่อ',
          'เอกสารบริษัท — checklist เอกสารจดทะเบียน (หนังสือรับรองบริษัท, ภพ.20, Book Bank ฯลฯ) มีช่องอัปโหลดรายข้อ',
          'ประเมิน BRCGS — ประเมินความเสี่ยง/คุณภาพตามมาตรฐาน พร้อมอัปโหลดใบรับรองรายหัวข้อ',
          'ESG Profile — ข้อมูลด้านสิ่งแวดล้อม สังคม ธรรมาภิบาล',
        ],
      },
      {
        heading: 'นำเข้าข้อมูลจำนวนมาก',
        points: [
          'เมนู "นำเข้าข้อมูล" รองรับการนำเข้าผู้จัดจำหน่ายจากไฟล์ Excel',
          'ระบบจับคู่คอลัมน์ด้วยชื่อหัวคอลัมน์ ไม่ต้องเรียงลำดับตายตัว',
        ],
      },
    ],
  },
  {
    id: 'company-docs',
    icon: FileText,
    title: 'เอกสารบริษัท (Company Documents)',
    roles: ALL,
    intro: 'รายการเอกสารจดทะเบียน/กฎหมายที่ขอจากผู้จัดจำหน่าย เป็น checklist มีช่องอัปโหลดรายข้อ',
    blocks: [
      {
        heading: 'การใช้งาน',
        points: [
          'แต่ละรายการเอกสารแสดงสถานะ ✓ มีแล้ว / ○ ยังขาด และป้าย "บังคับ" หรือ "ถ้ามี"',
          'กด "แนบไฟล์" เพื่ออัปโหลดเข้าแต่ละช่อง ดู/ลบไฟล์ได้ในที่เดียว',
          'เอกสารที่กำหนดว่า "มีวันหมดอายุ" จะให้กรอกวันหมดอายุ และแจ้งเตือนเมื่อใกล้/เกินกำหนด',
          'แถบสรุปด้านบนบอกว่ายังขาดเอกสารบังคับกี่รายการ',
          'มีหมวด "เอกสารอื่นๆ" สำหรับไฟล์ที่ไม่อยู่ในรายการมาตรฐาน',
        ],
      },
      {
        heading: 'ตั้งค่ารายการเอกสาร (Admin)',
        points: [
          'ไปที่ การตั้งค่า → แท็บ "เอกสารบริษัท"',
          'เพิ่ม/แก้ไข/ลบรายการเอกสาร, สลับบังคับ-ถ้ามี, เปิด-ปิดใช้งาน, จัดลำดับด้วยลูกศรขึ้น-ลง',
          'ตั้ง "มีวันหมดอายุ" สำหรับเอกสารที่ต้องต่ออายุ เช่น หนังสือรับรองบริษัท',
        ],
      },
    ],
  },
  {
    id: 'brcgs',
    icon: ClipboardCheck,
    title: 'ประเมิน BRCGS (Supplier Assessment)',
    roles: ALL,
    intro: 'ประเมินผู้จัดจำหน่ายตามมาตรฐาน BRCGS โดยระบบให้คะแนนอัตโนมัติจากหลักฐานให้มากที่สุด',
    blocks: [
      {
        heading: 'ประเภทผู้จัดจำหน่าย',
        points: [
          'เลือกประเภท (RM/Primary PK, Secondary PK, Service, Chemical food/non-food, Equipment food/non-food)',
          'แต่ละประเภทมีหัวข้อและช่วงคะแนนเกรด (A/B/C/D) ต่างกัน',
        ],
      },
      {
        heading: 'การให้คะแนน 4 แบบ',
        points: [
          '🔵 Auto จากใบรับรอง — จับคู่จากใบรับรองที่อัปโหลด (GFSI, ISO22000, HACCP ฯลฯ) + ตรวจวันหมดอายุ',
          '🟣 Auto จากเอกสาร — เช่น Spec/TDS, COA, Test report, MSDS',
          '🟡 Auto จากใบเสนอราคา (ตอน RFQ) — ราคา/การส่งมอบ/เครดิตเทอม คิดอัตโนมัติตอนเปรียบเทียบราคา',
          '⚪ ประเมินเอง — เช่น Audit score, Product risk assessment (เจ้าหน้าที่เลือกครั้งเดียว ระบบจำไว้)',
        ],
      },
      {
        heading: 'อัปโหลดหลักฐานรายหัวข้อ + AI ตรวจสอบ',
        points: [
          'แต่ละหัวข้อมีปุ่ม "แนบไฟล์" อัปโหลดใบรับรอง/เอกสารเข้าข้อนั้นโดยตรง',
          'AI จะตรวจว่าเอกสารตรงกับข้อประเมิน, เป็นของบริษัทนี้จริง, และอ่านวันหมดอายุให้อัตโนมัติ',
          'ถ้าไม่ผ่านการตรวจ ผู้จัดจำหน่ายจะอัปโหลดไม่ได้ (เจ้าหน้าที่มีสิทธิ์ override)',
          'เอกสารหมดอายุจะถูกตัดคะแนนออกและแจ้งเตือนบน Dashboard',
          'หัวข้อที่ยังประเมินไม่ได้ (เช่นรอใบเสนอราคา) จะถูกตัดออกจากคะแนนเต็มชั่วคราวเพื่อความยุติธรรม',
        ],
      },
    ],
  },
  {
    id: 'pricelists',
    icon: FileText,
    title: 'รายการราคา / Catalog (Price Lists)',
    roles: ['admin', 'procurement_officer', 'supplier'],
    blocks: [
      {
        points: [
          'Catalog แยกตามหมวด (วัตถุดิบ/บรรจุภัณฑ์/บริการ/อื่นๆ) จัดซื้อดูแลรายการ ผู้จัดจำหน่ายเสนอราคา',
          'นำเข้ารายการราคาจำนวนมากผ่านไฟล์ Excel ได้',
          'มีรอบการอัปเดตราคา (ตั้งค่าได้) — ระบบเตือนเมื่อใกล้/เกินรอบ',
          'ดูประวัติราคาย้อนหลัง (Quotation History) เพื่อเทียบแนวโน้ม',
        ],
      },
    ],
  },
  {
    id: 'rfq',
    icon: Send,
    title: 'ใบขอราคา (RFQ)',
    roles: ['admin', 'procurement_officer', 'supplier'],
    intro: 'กระบวนการขอราคาจากผู้จัดจำหน่ายหลายราย พร้อมเกณฑ์ทางเทคนิค',
    blocks: [
      {
        heading: 'สร้างและเชิญ',
        points: [
          'สร้าง RFQ ระบุรายการสินค้า/บริการ และผู้จัดจำหน่ายที่เชิญ',
          'กำหนด Technical Criteria (เกณฑ์ทางเทคนิค) สำหรับให้คะแนนด้านคุณภาพ',
          'ทำสำเนา RFQ (Duplicate) ได้ — ระบบจะไม่คัดลอกประวัติ Rollback มาด้วย',
        ],
      },
      {
        heading: 'ใบเสนอราคา',
        points: [
          'ผู้จัดจำหน่ายส่งใบเสนอราคาผ่านระบบ',
          'ป้องกันการส่งซ้ำ — 1 ผู้จัดจำหน่ายต่อ 1 RFQ ส่งได้ครั้งเดียว (ทั้งระดับ UI และฐานข้อมูล)',
          'ระบุ Technical score ตามเกณฑ์ที่กำหนด',
        ],
      },
    ],
  },
  {
    id: 'comparison',
    icon: Scale,
    title: 'เปรียบเทียบราคา (Bid Comparison)',
    roles: STAFF,
    intro: 'เปรียบเทียบใบเสนอราคาแบบ 3 มิติ แล้วคิด Final Score',
    blocks: [
      {
        heading: 'สูตรคะแนน',
        points: [
          'Final Score = Commercial × น้ำหนัก + Technical × น้ำหนัก + Risk × น้ำหนัก (ตั้งค่าน้ำหนักได้ รวม 100%)',
          'Commercial — ราคา + Lead Time + Payment Term',
          'Technical — จาก Technical checklist',
          'Risk — เกรด BRCGS (A/B/C/D) จากการประเมินผู้จัดจำหน่าย',
        ],
      },
      {
        points: [
          'คอลัมน์ Risk แสดงเกรด BRCGS พร้อมคะแนน เช่น "A · 98/125"',
          'คะแนนด้านการแข่งขัน (ราคา/ส่งมอบ/เครดิต) คิดอัตโนมัติจากใบเสนอราคาในรอบนี้',
        ],
      },
    ],
  },
  {
    id: 'ebidding',
    icon: Gavel,
    title: 'การประมูล (e-Bidding)',
    roles: ['admin', 'procurement_officer', 'supplier'],
    blocks: [
      {
        points: [
          'ประมูลราคาแบบเรียลไทม์ — ผู้เข้าร่วมทุกรายเห็นราคาต่ำสุดปัจจุบันทันที',
          'ขณะพิมพ์ราคา ระบบเทียบให้เห็นว่าต่ำ/สูงกว่าราคาต่ำสุดเท่าไร',
          'ผู้จัดจำหน่ายเห็นชื่อบริษัทตัวเองอัตโนมัติ ไม่ต้องเลือกจาก dropdown',
          'รูปแบบการประมูลเป็นรอบเดียว (single round)',
        ],
      },
    ],
  },
  {
    id: 'awards',
    icon: Award,
    title: 'การมอบงาน (Awards)',
    roles: STAFF,
    blocks: [
      {
        points: [
          'สร้างการมอบงานจากผู้ชนะการเปรียบเทียบ/ประมูล',
          'วงจรอนุมัติ: pending → อนุมัติ/ปฏิเสธ โดย Approver',
          'ระบบเตือนเมื่อมอบงานให้ผู้จัดจำหน่ายที่มีความเสี่ยงสูง/วิกฤต',
        ],
      },
    ],
  },
  {
    id: 'reports',
    icon: BarChart3,
    title: 'รายงาน (Reports)',
    roles: ['admin', 'procurement_officer', 'executive'],
    blocks: [
      {
        points: [
          'สรุปภาพรวมการจัดซื้อ มูลค่า และประสิทธิภาพ',
          'ใช้ประกอบการตัดสินใจของผู้บริหาร',
        ],
      },
    ],
  },
  {
    id: 'admin',
    icon: Settings,
    title: 'การตั้งค่าระบบ (Admin Settings)',
    roles: ['admin'],
    intro: 'สำหรับ Admin เท่านั้น เข้าที่เมนู "การตั้งค่า" ด้านล่างเมนู',
    blocks: [
      {
        points: [
          'Users — สร้างผู้ใช้ กำหนดบทบาท เปิด/ปิดใช้งาน รีเซ็ตรหัสผ่าน',
          'Roles — ดูบทบาทในระบบ',
          'Email — ตั้งค่า SMTP และเทมเพลตอีเมลแจ้งเตือน (อนุมัติ/ปฏิเสธผู้จัดจำหน่าย)',
          'เอกสารบริษัท — กำหนดรายการเอกสารที่ขอจากผู้จัดจำหน่าย',
          'Pricelist — รอบการอัปเดตราคาและระยะเวลายืนราคา',
          'Config — น้ำหนักการให้คะแนน (Commercial/Technical/Risk) รวม 100%',
          'ระบบ — ล้างข้อมูล Transaction ทดสอบก่อนเริ่มใช้งานจริง (ไม่ลบ Master Data)',
        ],
      },
    ],
  },
  {
    id: 'portal',
    icon: Briefcase,
    title: 'พอร์ทัลผู้จัดจำหน่าย (Supplier Portal)',
    roles: ['supplier'],
    intro: 'สำหรับผู้จัดจำหน่าย จัดการข้อมูลและเอกสารของบริษัทท่านเอง',
    blocks: [
      {
        points: [
          'ข้อมูลบริษัท — แก้ไขข้อมูลติดต่อ ที่อยู่ ให้เป็นปัจจุบัน',
          'ผู้ติดต่อ — เพิ่ม/แก้ไขผู้ติดต่อของบริษัท',
          'เอกสาร — อัปโหลดเอกสารบริษัทตาม checklist ที่ระบบกำหนด (ดูว่ายังขาดอะไร)',
          'เอกสารประเมิน BRCGS — อัปโหลดใบรับรอง/เอกสารรายหัวข้อ ระบบ AI ตรวจสอบและให้คะแนนอัตโนมัติ',
          'ส่งใบเสนอราคาใน RFQ และร่วมประมูล e-Bidding',
        ],
      },
    ],
  },
  {
    id: 'faq',
    icon: CircleHelp,
    title: 'คำถามที่พบบ่อย (FAQ)',
    roles: ALL,
    blocks: [
      {
        points: [
          'อัปโหลดไฟล์ไม่สำเร็จ? — ตรวจชนิดไฟล์ (PDF/รูปภาพ/Office) และขนาดไฟล์ ระบบแปลงชื่อไฟล์ภาษาไทยให้อัตโนมัติแล้ว',
          'AI อ่านเอกสารไม่ได้? — รองรับ PDF/รูปภาพเท่านั้น ไฟล์ Word/Excel อัปโหลดได้แต่ไม่มีตรวจอัตโนมัติ',
          'คะแนน BRCGS ยังไม่ครบ? — หัวข้อ Competition จะได้คะแนนตอนเปรียบเทียบราคาใน RFQ',
          'ทำไมส่งใบเสนอราคาซ้ำไม่ได้? — ระบบอนุญาต 1 ใบต่อ 1 ผู้จัดจำหน่ายต่อ RFQ',
          'ใบรับรองหมดอายุจะเป็นอย่างไร? — ถูกตัดคะแนนและแจ้งเตือนบน Dashboard จนกว่าจะอัปโหลดฉบับใหม่',
        ],
      },
    ],
  },
];

export default function Help() {
  const { roles } = useAuth();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const byRole = SECTIONS.filter(s => s.roles.some(r => roles.includes(r as any)) || roles.length === 0);
    const q = query.trim().toLowerCase();
    if (!q) return byRole;
    return byRole.filter(s => {
      const hay = [s.title, s.intro ?? '', ...s.blocks.flatMap(b => [b.heading ?? '', ...b.points])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [roles, query]);

  const openValues = query.trim() ? visible.map(s => s.id) : undefined;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <HelpCircle className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">คู่มือการใช้งาน</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            อธิบายการใช้งานทุกส่วนของระบบ Smart Procurement — แสดงเฉพาะหัวข้อที่เกี่ยวกับบทบาทของคุณ
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="ค้นหาในคู่มือ เช่น BRCGS, ใบเสนอราคา, หมดอายุ..."
          className="pl-9"
        />
      </div>

      {/* Sections */}
      {visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">ไม่พบหัวข้อที่ตรงกับ "{query}"</CardContent></Card>
      ) : (
        <Accordion type="multiple" value={openValues} className="space-y-2">
          {visible.map(s => (
            <AccordionItem key={s.id} value={s.id} className="border rounded-lg bg-card px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="flex items-center gap-3 text-left">
                  <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <s.icon className="w-4 h-4 text-primary" />
                  </span>
                  <span className="font-semibold text-sm">{s.title}</span>
                  {s.roles.length < ALL.length && (
                    <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
                      {s.roles.includes('supplier') && s.roles.length === 1 ? 'ผู้จัดจำหน่าย'
                        : s.roles.includes('admin') && s.roles.length === 1 ? 'Admin'
                        : 'เจ้าหน้าที่'}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {s.intro && <p className="text-sm text-muted-foreground mb-3 ml-11">{s.intro}</p>}
                <div className="space-y-4 ml-11">
                  {s.blocks.map((b, i) => (
                    <div key={i}>
                      {b.heading && <p className="text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">{b.heading}</p>}
                      <ul className="space-y-1.5">
                        {b.points.map((p, j) => (
                          <li key={j} className="text-sm text-muted-foreground flex gap-2">
                            <span className="text-primary/50 mt-1.5 w-1 h-1 rounded-full bg-current shrink-0" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Footer note */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            หากพบปัญหาการใช้งานที่ไม่ได้อยู่ในคู่มือ กรุณาติดต่อผู้ดูแลระบบ (Admin) ขององค์กรของท่าน
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
