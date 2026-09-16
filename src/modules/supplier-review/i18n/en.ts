export const en = {
  spr: {
    title: 'Supplier Review',
    dashboard: 'Review Dashboard',
    campaign: 'Review Campaign',
    newReview: 'New Review',
    reviewForm: 'Review Form',
    history: 'Review History',
    config: 'Review Config',
    asl: 'Approved Supplier List (Review)',
    reports: 'Reports',

    status: {
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      REVIEWED: 'Reviewed',
      APPROVED: 'Approved',
      RETURNED: 'Returned',
    },

    grade: {
      A: 'Grade A — Approved',
      B: 'Grade B — Approved',
      C: 'Grade C — Conditionally Approved',
      D: 'Grade D — Suspended',
    },

    tabs: {
      supplierInfo: 'Supplier Info',
      performance: 'Performance Data',
      scoring: 'Scoring',
      knockouts: 'Knockout Checks',
      outcome: 'Outcome & Actions',
      attachments: 'Attachments',
      signoff: 'Sign-off',
    },

    kpi: {
      rejectRate: 'Reject Rate',
      ncrCount: 'NCR Count',
      ncrCritical: 'Critical NCR',
      capaIssued: 'CAPA Issued',
      capaClosed: 'CAPA Closed',
      capaOverdue: 'CAPA Overdue',
      onTimeDelivery: 'On-Time Delivery',
      docAccuracy: 'Document Accuracy',
      certStatus: 'Certification Status',
      certExpiry: 'Certificate Expiry',
      brcGrade: 'BRC Grade',
      lotsReceived: 'Lots Received',
      lotsRejected: 'Lots Rejected',
      complaints: 'Complaints',
    },

    knockout: {
      title: 'Knockout Checks',
      passed: 'Passed',
      failed: 'Failed',
      certExpired: 'Certification expired/not verified',
      questionnaire3yr: 'Questionnaire > 3 years',
      traceabilityOverdue: 'Traceability overdue',
      criticalIncident: 'Critical incident (open CAPA)',
      outsourcedNoApproval: 'Outsourced processor — no customer approval',
    },

    action: {
      capa: 'CAPA',
      improvement: 'Improvement',
      reissueQuestionnaire: 'Reissue Questionnaire',
      traceabilityVerify: 'Traceability Verification',
      other: 'Other',
    },

    dashboard_cards: {
      due60: 'Due in 60 days',
      due30: 'Due in 30 days',
      due7: 'Due in 7 days',
      overdue: 'Overdue',
      completed: 'Completed',
      planned: 'Planned',
      compliance: 'Compliance',
      suspended: 'Suspended',
      conditional: 'Conditional',
    },

    config_section: {
      frequency: 'Review Frequency',
      criteria: 'Criteria & Weights',
      knockoutRules: 'Knockout Rules',
      gradeThresholds: 'Grade Thresholds',
      safetyWeightWarning: 'BRCGS Clause 3.5.1.3: Safety & Quality criteria must be ≥ 60%',
    },

    messages: {
      reviewLocked: 'This review is locked. Create a revision to make changes.',
      cannotApproveSelf: 'Reviewer cannot approve their own review.',
      knockoutOverride: 'Knockout rule failed — outcome cannot be "Approved".',
      safetyWeightBlock: 'Cannot save: Safety & Quality weight must be ≥ 60% (Clause 3.5.1.3)',
      reviewApproved: 'Review approved successfully.',
      reviewSubmitted: 'Review submitted for approval.',
      reviewReturned: 'Review returned with comments.',
      revisionCreated: 'New revision created.',
      campaignGenerated: 'Review campaign generated.',
      frequencyWarning: 'Review frequency > 12 months — justification required.',
    },
  },
};
