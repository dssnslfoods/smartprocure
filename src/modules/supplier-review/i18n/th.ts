export const th = {
  spr: {
    title: 'ทบทวนผู้จัดจำหน่าย',
    dashboard: 'แผงควบคุมการทบทวน',
    campaign: 'แคมเปญทบทวนประจำปี',
    newReview: 'สร้างการทบทวนใหม่',
    reviewForm: 'แบบฟอร์มทบทวน',
    history: 'ประวัติการทบทวน',
    config: 'ตั้งค่าการทบทวน',
    asl: 'รายชื่อผู้จัดจำหน่ายที่ได้รับอนุมัติ',
    reports: 'รายงาน',

    status: {
      DRAFT: 'ร่าง',
      SUBMITTED: 'ส่งแล้ว',
      REVIEWED: 'ตรวจแล้ว',
      APPROVED: 'อนุมัติ',
      RETURNED: 'ส่งกลับ',
    },

    grade: {
      A: 'เกรด A — อนุมัติ',
      B: 'เกรด B — อนุมัติ',
      C: 'เกรด C — อนุมัติแบบมีเงื่อนไข',
      D: 'เกรด D — ระงับ',
    },

    tabs: {
      supplierInfo: 'ข้อมูลผู้จัดจำหน่าย',
      performance: 'ข้อมูลประสิทธิภาพ',
      scoring: 'ให้คะแนน',
      knockouts: 'ตรวจสอบ Knockout',
      outcome: 'ผลลัพธ์ & แผนปฏิบัติ',
      attachments: 'เอกสารแนบ',
      signoff: 'ลงนาม',
    },

    kpi: {
      rejectRate: 'อัตราการปฏิเสธ',
      ncrCount: 'จำนวน NCR',
      ncrCritical: 'NCR ร้ายแรง',
      capaIssued: 'CAPA ที่ออก',
      capaClosed: 'CAPA ที่ปิด',
      capaOverdue: 'CAPA เกินกำหนด',
      onTimeDelivery: 'ส่งมอบตรงเวลา',
      docAccuracy: 'ความถูกต้องเอกสาร',
      certStatus: 'สถานะใบรับรอง',
      certExpiry: 'วันหมดอายุใบรับรอง',
      brcGrade: 'เกรด BRC',
      lotsReceived: 'ล็อตรับเข้า',
      lotsRejected: 'ล็อตปฏิเสธ',
      complaints: 'ข้อร้องเรียน',
    },

    knockout: {
      title: 'ตรวจสอบ Knockout',
      passed: 'ผ่าน',
      failed: 'ไม่ผ่าน',
      certExpired: 'ใบรับรองหมดอายุ / ไม่ได้ตรวจสอบ',
      questionnaire3yr: 'แบบสอบถามเกิน 3 ปี',
      traceabilityOverdue: 'Traceability เกินกำหนด',
      criticalIncident: 'เหตุร้ายแรง (CAPA เปิดอยู่)',
      outsourcedNoApproval: 'ผู้รับจ้าง — ไม่มีอนุมัติจากลูกค้า',
    },

    action: {
      capa: 'CAPA',
      improvement: 'ปรับปรุง',
      reissueQuestionnaire: 'ออกแบบสอบถามใหม่',
      traceabilityVerify: 'ตรวจสอบ Traceability',
      other: 'อื่นๆ',
    },

    dashboard_cards: {
      due60: 'ครบกำหนดใน 60 วัน',
      due30: 'ครบกำหนดใน 30 วัน',
      due7: 'ครบกำหนดใน 7 วัน',
      overdue: 'เกินกำหนด',
      completed: 'เสร็จสิ้น',
      planned: 'ตามแผน',
      compliance: 'ความสอดคล้อง',
      suspended: 'ถูกระงับ',
      conditional: 'มีเงื่อนไข',
    },

    config_section: {
      frequency: 'ความถี่การทบทวน',
      criteria: 'เกณฑ์ & น้ำหนัก',
      knockoutRules: 'กฎ Knockout',
      gradeThresholds: 'เกณฑ์ระดับ',
      safetyWeightWarning: 'BRCGS ข้อ 3.5.1.3: น้ำหนักเกณฑ์ Safety & Quality ต้อง ≥ 60%',
    },

    messages: {
      reviewLocked: 'การทบทวนนี้ถูกล็อค ต้องสร้าง Revision ใหม่เพื่อแก้ไข',
      cannotApproveSelf: 'ผู้ทบทวนไม่สามารถอนุมัติตนเองได้',
      knockoutOverride: 'กฎ Knockout ไม่ผ่าน — ผลลัพธ์ไม่สามารถเป็น "อนุมัติ" ได้',
      safetyWeightBlock: 'บันทึกไม่ได้: น้ำหนัก Safety & Quality ต้อง ≥ 60% (ข้อ 3.5.1.3)',
      reviewApproved: 'อนุมัติการทบทวนเรียบร้อย',
      reviewSubmitted: 'ส่งการทบทวนเพื่อขออนุมัติแล้ว',
      reviewReturned: 'ส่งกลับพร้อมความคิดเห็น',
      revisionCreated: 'สร้าง Revision ใหม่แล้ว',
      campaignGenerated: 'สร้างแคมเปญทบทวนแล้ว',
      frequencyWarning: 'ความถี่ทบทวน > 12 เดือน — ต้องมีเหตุผลประกอบ',
    },
  },
};
