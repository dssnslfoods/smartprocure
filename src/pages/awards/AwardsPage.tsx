import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, CheckCircle2, XCircle, Eye, Trophy, Clock, ShieldAlert, Download, Printer, Calculator, SendHorizontal, ListChecks, RotateCcw, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AwardSelectionSummary from '@/components/AwardSelectionSummary';
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import RiskBadge from '@/components/RiskBadge';
import type { RiskLevel } from '@/types/procurement';
import { useTranslation } from '@/i18n';

const lifecycleConfig: Record<string, { color: string; label: string }> = {
  pending_approval: { color: 'bg-amber-500/10 text-amber-600', label: 'รออนุมัติ' },
  approved:         { color: 'bg-emerald-500/10 text-emerald-600', label: 'อนุมัติแล้ว · รอส่งบัญชี' },
  rejected:         { color: 'bg-destructive/10 text-destructive', label: 'ไม่อนุมัติ' },
  po_issued:        { color: 'bg-blue-500/10 text-blue-600', label: 'ส่งบัญชีแล้ว' },
  completed:        { color: 'bg-emerald-700/10 text-emerald-700', label: 'เสร็จสิ้น' },
  cancelled:        { color: 'bg-muted text-muted-foreground', label: 'ยกเลิก' },
};

const legacyStatusConfig: Record<string, { color: string; label: string }> = {
  pending:  { color: 'bg-amber-500/10 text-amber-600', label: 'Pending Approval' },
  approved: { color: 'bg-emerald-500/10 text-emerald-600', label: 'Approved' },
  rejected: { color: 'bg-destructive/10 text-destructive', label: 'Rejected' },
  revise:   { color: 'bg-blue-500/10 text-blue-600', label: 'Needs Revision' },
};

export default function AwardsPage() {
  const [loadingStats, setLoadingStats] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendingApproval: 0, approved: 0, poReady: 0 });
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [criteriaAward, setCriteriaAward] = useState<any>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [handoffAwards, setHandoffAwards] = useState<any[]>([]);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<any>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbacking, setRollbacking] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetchStats = async () => {
    setLoadingStats(true);
    const [
      { count: total },
      { count: pendingApproval },
      { count: approved },
      { count: poReady }
    ] = await Promise.all([
      supabase.from('awards').select('*', { count: 'exact', head: true }),
      supabase.from('awards').select('*', { count: 'exact', head: true }).or('status.eq.pending,award_lifecycle_status.eq.pending_approval'),
      supabase.from('awards').select('*', { count: 'exact', head: true }).or('status.eq.approved,award_lifecycle_status.eq.approved'),
      supabase.from('awards').select('*', { count: 'exact', head: true }).or('ready_for_po.eq.true,award_lifecycle_status.eq.po_issued'),
    ]);
    setStats({
      total: total || 0,
      pendingApproval: pendingApproval || 0,
      approved: approved || 0,
      poReady: poReady || 0,
    });
    setLoadingStats(false);
  };

  useEffect(() => { fetchStats(); }, []);

  const pagination = useSupabasePagination<any>({
    tableName: 'awards',
    select: '*, suppliers(company_name, risk_level), rfqs(title, rfq_number)',
    pageSize: 200,
  });

  const handleStatusChange = async (id: string, status: string) => {
    if (status === 'rejected') {
      const award = pagination.items.find((a: any) => a.id === id);
      if (!award) return;
      const rfqId = award.rfq_id;
      try {
        if (rfqId) {
          await supabase.from('quotations').update({ is_recommended_winner: false }).eq('rfq_id', rfqId);
          const { data: currentRfq } = await supabase.from('rfqs').select('notes').eq('id', rfqId).single();
          const ts = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
          const reason = decisionReason.trim() || 'ไม่อนุมัติ';
          const entry = `[Rollback ${ts}] ไม่อนุมัติ: ${reason} (ผู้ชนะเดิม: ${award.suppliers?.company_name || '—'})`;
          const prevNotes = (currentRfq?.notes || '').replace(/^\[Rollback\].*$/m, '').trim();
          const merged = prevNotes ? `${entry}\n${prevNotes}` : entry;
          await supabase.from('rfqs').update({
            status: 'evaluation' as any,
            notes: merged,
            updated_at: new Date().toISOString(),
          }).eq('id', rfqId);
        }
        await supabase.from('awards').delete().eq('id', id);
        toast({ title: 'ไม่อนุมัติ Award', description: 'RFQ กลับสู่สถานะ Evaluation — สามารถเลือกผู้ชนะใหม่ได้' });
        setDecisionReason('');
        fetchStats();
        pagination.refresh();
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
      return;
    }

    const updates: any = { status, updated_at: new Date().toISOString() };
    if (decisionReason) updates.decision_reason = decisionReason;
    if (status === 'approved') {
      updates.ready_for_po = true;
      updates.award_lifecycle_status = 'approved';
    }

    const { error } = await supabase.from('awards').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Award ${status}` });
      setDecisionReason('');
      fetchStats();
      pagination.refresh();
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget || !rollbackReason.trim()) return;
    setRollbacking(true);
    const rfqId = rollbackTarget.rfq_id;
    try {
      if (rfqId) {
        await supabase.from('quotations').update({ is_recommended_winner: false }).eq('rfq_id', rfqId);
        const { data: currentRfq } = await supabase.from('rfqs').select('notes').eq('id', rfqId).single();
        const ts = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        const entry = `[Rollback ${ts}] ${rollbackReason.trim()} (ผู้ชนะเดิม: ${rollbackTarget.suppliers?.company_name || '—'})`;
        const prevNotes = (currentRfq?.notes || '').replace(/^\[Rollback\].*$/m, '').trim();
        const merged = prevNotes ? `${entry}\n${prevNotes}` : entry;
        await supabase.from('rfqs').update({
          status: 'evaluation' as any,
          notes: merged,
          updated_at: new Date().toISOString(),
        }).eq('id', rfqId);
      }
      await supabase.from('awards').delete().eq('id', rollbackTarget.id);
      toast({ title: 'Rollback สำเร็จ', description: 'RFQ กลับสู่สถานะ Evaluation — สามารถเลือกผู้ชนะใหม่ได้ที่ Bid Comparison' });
      setRollbackTarget(null);
      setRollbackReason('');
      fetchStats();
      pagination.refresh();
    } catch (err: any) {
      toast({ title: 'Rollback ไม่สำเร็จ', description: err.message, variant: 'destructive' });
    }
    setRollbacking(false);
  };

  // ===== Accounting Handoff (PO export) =====
  const fetchHandoff = useCallback(async () => {
    setHandoffLoading(true);
    const { data } = await supabase
      .from('awards')
      .select('*, suppliers(company_name, tax_id), rfqs(title, rfq_number)')
      .or('status.eq.approved,award_lifecycle_status.eq.approved,award_lifecycle_status.eq.po_issued')
      .order('awarded_at', { ascending: false });
    if (data) setHandoffAwards(data);
    setHandoffLoading(false);
  }, []);

  const pendingHandoff = handoffAwards.filter(a => a.award_lifecycle_status !== 'po_issued' && a.award_lifecycle_status !== 'completed');
  const doneHandoff = handoffAwards.filter(a => a.award_lifecycle_status === 'po_issued' || a.award_lifecycle_status === 'completed');

  const printHandoff = () => {
    const rows = handoffAwards;
    if (rows.length === 0) { toast({ title: 'ไม่มีข้อมูลให้พิมพ์', variant: 'destructive' }); return; }
    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalAmt = rows.reduce((s, a) => s + (a.final_amount ?? a.amount ?? 0), 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PO Handoff Report</title>
<style>
  @page { size: landscape; margin: 15mm; }
  body { font-family: 'Sarabun', sans-serif; font-size: 11px; color: #1a1a1a; }
  .header { text-align: center; margin-bottom: 16px; }
  .header h1 { font-size: 18px; margin: 0; }
  .header p { color: #666; margin: 4px 0 0; font-size: 12px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e3a5f; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  th.r { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) { background: #f8f9fb; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-done { background: #dbeafe; color: #1e40af; }
  .footer { margin-top: 16px; display: flex; justify-content: space-between; font-size: 11px; border-top: 2px solid #1e3a5f; padding-top: 8px; }
  .footer strong { color: #1e3a5f; }
  .total-row td { font-weight: 700; border-top: 2px solid #1e3a5f; background: #f0f4f8; }
</style></head><body>
<div class="header"><h1>รายงานส่งฝ่ายบัญชี (PO Handoff Report)</h1><p>Smart Procurement — NSL Foods PLC</p></div>
<div class="meta"><span>วันที่พิมพ์: ${today}</span><span>จำนวน ${rows.length} รายการ</span></div>
<table><thead><tr>
  <th>#</th><th>Award No</th><th>ผู้ขาย (Supplier)</th><th>เลขผู้เสียภาษี</th>
  <th>RFQ</th><th class="r">จำนวนเงิน (THB)</th><th>วันที่อนุมัติ</th><th>สถานะ</th>
</tr></thead><tbody>
${rows.map((a, i) => {
  const amt = a.final_amount ?? a.amount ?? 0;
  const handed = a.award_lifecycle_status === 'po_issued' || a.award_lifecycle_status === 'completed';
  return `<tr>
    <td>${i + 1}</td>
    <td>${a.award_no || '—'}</td>
    <td>${a.suppliers?.company_name || '—'}</td>
    <td>${a.suppliers?.tax_id || '—'}</td>
    <td>${a.rfqs?.title || '—'}<br><small style="color:#888">${a.rfqs?.rfq_number || ''}</small></td>
    <td class="r">${amt ? Number(amt).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '—'}</td>
    <td>${(a.awarded_at || a.created_at) ? new Date(a.awarded_at || a.created_at).toLocaleDateString('th-TH') : '—'}</td>
    <td><span class="badge ${handed ? 'badge-done' : 'badge-pending'}">${handed ? 'ส่งบัญชีแล้ว' : 'รอส่งบัญชี'}</span></td>
  </tr>`;
}).join('')}
<tr class="total-row"><td colspan="5" style="text-align:right">รวมทั้งสิ้น</td><td class="r">${totalAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td><td colspan="2"></td></tr>
</tbody></table>
<div class="footer"><span>รอส่งบัญชี: <strong>${pendingHandoff.length}</strong> · ส่งแล้ว: <strong>${doneHandoff.length}</strong></span><span>Smart Procurement © ${new Date().getFullYear()}</span></div>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const exportHandoffExcel = async () => {
    const rows = handoffAwards;
    if (rows.length === 0) { toast({ title: 'ไม่มีข้อมูลให้ส่งออก', variant: 'destructive' }); return; }
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Smart Procurement';
    wb.created = new Date();
    const ws = wb.addWorksheet('PO Handoff', {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
    });

    // Title row
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'รายงานส่งฝ่ายบัญชี (PO Handoff Report)';
    titleCell.font = { name: 'Sarabun', size: 16, bold: true, color: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Subtitle
    ws.mergeCells('A2:H2');
    const subCell = ws.getCell('A2');
    subCell.value = `Smart Procurement — NSL Foods PLC · วันที่ ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} · ${rows.length} รายการ`;
    subCell.font = { name: 'Sarabun', size: 10, color: { argb: 'FF888888' } };
    subCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 20;

    // Header row
    const headers = ['#', 'Award No', 'ผู้ขาย (Supplier)', 'เลขผู้เสียภาษี', 'RFQ', 'จำนวนเงิน (THB)', 'วันที่อนุมัติ', 'สถานะ'];
    const headerRow = ws.addRow(headers);
    headerRow.height = 24;
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Sarabun', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { horizontal: colNumber === 6 ? 'right' : 'left', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1E3A5F' } } };
    });

    // Data rows
    rows.forEach((a, i) => {
      const amt = a.final_amount ?? a.amount ?? 0;
      const handed = a.award_lifecycle_status === 'po_issued' || a.award_lifecycle_status === 'completed';
      const row = ws.addRow([
        i + 1,
        a.award_no || '—',
        a.suppliers?.company_name || '—',
        a.suppliers?.tax_id || '—',
        `${a.rfqs?.title || '—'} (${a.rfqs?.rfq_number || ''})`,
        amt || 0,
        (a.awarded_at || a.created_at) ? new Date(a.awarded_at || a.created_at).toLocaleDateString('th-TH') : '—',
        handed ? 'ส่งบัญชีแล้ว' : 'รอส่งบัญชี',
      ]);
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Sarabun', size: 10 };
        cell.alignment = { horizontal: colNumber === 6 ? 'right' : 'left', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } } };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FB' } };
      });
      // Format amount column
      const amtCell = row.getCell(6);
      if (amt) { amtCell.numFmt = '#,##0.00'; amtCell.font = { name: 'Sarabun', size: 10, bold: true }; }
      // Color status badge
      const statusCell = row.getCell(8);
      statusCell.font = { name: 'Sarabun', size: 9, bold: true, color: { argb: handed ? 'FF1E40AF' : 'FF92400E' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: handed ? 'FFDBEAFE' : 'FFFEF3C7' } };
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Total row
    const totalAmt = rows.reduce((s, a) => s + (a.final_amount ?? a.amount ?? 0), 0);
    const totalRow = ws.addRow(['', '', '', '', 'รวมทั้งสิ้น', totalAmt, '', '']);
    totalRow.height = 26;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Sarabun', size: 11, bold: true, color: { argb: 'FF1E3A5F' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FF1E3A5F' } } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
      if (colNumber === 5) cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (colNumber === 6) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
    });

    // Column widths
    ws.columns = [
      { width: 5 }, { width: 18 }, { width: 30 }, { width: 18 },
      { width: 35 }, { width: 18 }, { width: 16 }, { width: 15 },
    ];

    // Footer
    ws.addRow([]);
    const footerRow = ws.addRow([`รอส่งบัญชี: ${pendingHandoff.length} · ส่งแล้ว: ${doneHandoff.length} · รวม: ${rows.length}`, '', '', '', '', '', '', `Smart Procurement © ${new Date().getFullYear()}`]);
    footerRow.getCell(1).font = { name: 'Sarabun', size: 9, color: { argb: 'FF888888' } };
    footerRow.getCell(8).font = { name: 'Sarabun', size: 9, color: { argb: 'FF888888' } };
    footerRow.getCell(8).alignment = { horizontal: 'right' };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PO_Handoff_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: '✓ ส่งออก Excel แล้ว', description: `${rows.length} รายการ — ไฟล์ .xlsx พร้อมส่งฝ่ายบัญชี` });
  };

  const markHandedOver = async (id: string) => {
    const { error } = await supabase.from('awards')
      .update({ award_lifecycle_status: 'po_issued', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✓ ทำเครื่องหมายส่งบัญชีแล้ว' });
      fetchHandoff();
      fetchStats();
    }
  };

  const getStatusDisplay = (a: any) => {
    const lifecycle = a.award_lifecycle_status;
    if (lifecycle && lifecycleConfig[lifecycle]) return lifecycleConfig[lifecycle];
    return legacyStatusConfig[a.status] || legacyStatusConfig.pending;
  };

  const canApprove = hasRole('admin') || hasRole('approver');

  const searchLower = search.toLowerCase().trim();
  const filteredItems = searchLower
    ? pagination.items.filter((a: any) => {
        const awardNo = a.award_no || a.award_number || '';
        const supplier = a.suppliers?.company_name || '';
        const rfqTitle = a.rfqs?.title || '';
        const rfqNumber = a.rfqs?.rfq_number || '';
        const displayAmount = a.final_amount ?? a.amount;
        const amount = displayAmount ? `${a.currency || 'THB'} ${Number(displayAmount).toLocaleString()}` : '';
        const risk = a.suppliers?.risk_level || '';
        const status = getStatusDisplay(a).label;
        const date = (a.awarded_at || a.created_at) ? new Date(a.awarded_at || a.created_at).toLocaleDateString() : '';
        const recommendation = a.recommendation || '';
        const combined = `${awardNo} ${supplier} ${rfqTitle} ${rfqNumber} ${amount} ${risk} ${status} ${date} ${recommendation}`.toLowerCase();
        return combined.includes(searchLower);
      })
    : pagination.items;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('awards.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('awards.subtitle')}</p>
      </div>

      {/* Guide */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50">
        <button onClick={() => setGuideOpen(!guideOpen)} className="w-full flex items-center justify-between px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-sm font-medium text-blue-800">
            <HelpCircle className="w-4 h-4" />คำแนะนำการใช้งาน
          </span>
          {guideOpen ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />}
        </button>
        {guideOpen && (
          <div className="px-4 pb-4 space-y-3 text-sm text-blue-900">
            <div>
              <p className="font-semibold mb-1">ขั้นตอนการทำงาน</p>
              <ol className="list-decimal pl-5 space-y-1 text-xs">
                <li>เมื่อฝ่ายจัดซื้อเลือกผู้ชนะจาก <strong>Bid Comparison</strong> ระบบจะสร้าง Award อัตโนมัติ (สถานะ "รออนุมัติ")</li>
                <li>ผู้มีอำนาจตรวจสอบรายละเอียดและ <strong>อนุมัติ</strong> หรือ <strong>ปฏิเสธ</strong></li>
                <li>เมื่ออนุมัติแล้ว Award จะอยู่ในแท็บ <strong>"ส่งฝ่ายบัญชี (PO)"</strong> เพื่อออกใบสั่งซื้อ</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold mb-1">ปุ่มในคอลัมน์ Actions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <span className="flex items-center gap-2"><Eye className="w-3.5 h-3.5 text-muted-foreground" /> ดูรายละเอียด Award</span>
                <span className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-muted-foreground" /> ดูเกณฑ์ที่ใช้คัดเลือกผู้ชนะ</span>
                <span className="flex items-center gap-2"><Trophy className="w-3.5 h-3.5 text-muted-foreground" /> ไปที่หน้า RFQ ต้นทาง</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> อนุมัติ Award</span>
                <span className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-red-500" /> ปฏิเสธ — ลบ Award และส่ง RFQ กลับไปเลือกผู้ชนะใหม่</span>
                <span className="flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /> Rollback — ยกเลิกผู้ชนะ ส่ง RFQ กลับ Evaluation</span>
              </div>
            </div>
            <div>
              <p className="font-semibold mb-1">หมายเหตุ</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><strong>ปฏิเสธ</strong> และ <strong>Rollback</strong> ให้ผลเหมือนกัน — ลบ Award และส่ง RFQ กลับสถานะ Evaluation เพื่อเลือกผู้ชนะใหม่ ต่างกันที่ปฏิเสธใช้จากหน้ารายละเอียด ส่วน Rollback ใช้จากตาราง</li>
                <li>หากผู้ชนะถูกเลือก<strong>นอกเกณฑ์คะแนน</strong> ระบบจะแสดงป้ายเตือนในหน้าเกณฑ์การคัดเลือก พร้อมเหตุผลประกอบ</li>
                <li>ทุกการ Rollback จะถูกบันทึกไว้ในประวัติของ RFQ เพื่อการตรวจสอบย้อนหลัง</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <Tabs defaultValue="all" className="space-y-4" onValueChange={(v) => v === 'handoff' && fetchHandoff()}>
        <TabsList>
          <TabsTrigger value="all"><Trophy className="w-4 h-4 mr-1" />รายการมอบงาน</TabsTrigger>
          <TabsTrigger value="handoff"><Calculator className="w-4 h-4 mr-1" />ส่งฝ่ายบัญชี (PO)</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('awards.totalAwards')}</p>
            <p className="text-2xl font-bold">{loadingStats ? '...' : stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <p className="text-xs text-muted-foreground">{t('awards.pendingApproval')}</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{loadingStats ? '...' : stats.pendingApproval}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <p className="text-xs text-muted-foreground">{t('awards.approved')}</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{loadingStats ? '...' : stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-blue-500" />
              <p className="text-xs text-muted-foreground">{t('awards.poReady')}</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{loadingStats ? '...' : stats.poReady}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="ค้นหา (ผู้ขาย, RFQ, จำนวนเงิน, สถานะ, วันที่...)" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.awardNo')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.supplier')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.rfq')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{t('awards.finalAmount')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">{t('awards.risk')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('common.status')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.awardedDate')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pagination.loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{search ? 'ไม่พบผลลัพธ์ที่ค้นหา' : t('awards.noAwards')}</td></tr>
                ) : (
                  filteredItems.map(a => {
                    const sc = getStatusDisplay(a);
                    const displayAmount = a.final_amount ?? a.amount;
                    const riskLevel = a.suppliers?.risk_level as RiskLevel;
                    const isHighRisk = riskLevel === 'high' || riskLevel === 'critical';
                    return (
                      <tr key={a.id} className={`border-b hover:bg-muted/30 ${isHighRisk ? 'bg-orange-50/30' : ''}`}>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {a.award_no || a.award_number || '—'}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {isHighRisk && <ShieldAlert className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                            <span className="font-medium">{a.suppliers?.company_name || '—'}</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          <div>{a.rfqs?.title || '—'}</div>
                          <div className="text-muted-foreground/70">{a.rfqs?.rfq_number}</div>
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {displayAmount ? `${a.currency || 'THB'} ${Number(displayAmount).toLocaleString()}` : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <RiskBadge level={riskLevel} />
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className={sc.color}>{sc.label}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {(a.awarded_at || a.created_at) ? new Date(a.awarded_at || a.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <Tooltip><TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => { setSelected(a); setDetailOpen(true); }}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger><TooltipContent>ดูรายละเอียด</TooltipContent></Tooltip>
                            {a.selection_snapshot && (
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setCriteriaAward(a)}>
                                  <ListChecks className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger><TooltipContent>เกณฑ์การคัดเลือก</TooltipContent></Tooltip>
                            )}
                            {a.rfq_id && (
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/rfq/${a.rfq_id}`)}>
                                  <Trophy className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger><TooltipContent>ไปที่ RFQ</TooltipContent></Tooltip>
                            )}
                            {canApprove && (a.status === 'pending' || a.award_lifecycle_status === 'pending_approval') && (
                              <>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="outline" size="sm" className="text-emerald-600" onClick={() => handleStatusChange(a.id, 'approved')}>
                                    <CheckCircle2 className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>อนุมัติ</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleStatusChange(a.id, 'rejected')}>
                                    <XCircle className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>ปฏิเสธ</TooltipContent></Tooltip>
                              </>
                            )}
                            {canApprove && a.award_lifecycle_status !== 'po_issued' && a.award_lifecycle_status !== 'completed' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-600" onClick={() => { setRollbackTarget(a); setRollbackReason(''); }}>
                                    <RotateCcw className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-[220px]">
                                  <p className="font-medium text-xs">Rollback การคัดเลือก</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">ย้อนกลับไปเลือกผู้ชนะใหม่ — RFQ จะกลับสู่สถานะ Evaluation และลบ Award นี้</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls {...pagination} />
        </CardContent>
      </Card>
        </TabsContent>

        {/* ===== Accounting Handoff Tab ===== */}
        <TabsContent value="handoff" className="space-y-4">
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-primary" /> รายงานส่งฝ่ายบัญชี (PO Handoff)
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  รายการที่อนุมัติแล้ว — ส่งออกให้ฝ่ายบัญชีนำไปออกใบสั่งซื้อ (PO) ในระบบบัญชีต่อไป
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={printHandoff}>
                  <Printer className="w-4 h-4 mr-1" /> พิมพ์
                </Button>
                <Button onClick={exportHandoffExcel}>
                  <Download className="w-4 h-4 mr-1" /> ส่งออก Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Award No</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">ผู้ขาย</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">RFQ</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">จำนวนเงิน</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">เงื่อนไข</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">วันที่อนุมัติ</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">สถานะ</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {handoffLoading ? (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">กำลังโหลด...</td></tr>
                    ) : handoffAwards.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">ยังไม่มีรายการที่อนุมัติแล้ว</td></tr>
                    ) : (
                      handoffAwards.map(a => {
                        const handed = a.award_lifecycle_status === 'po_issued' || a.award_lifecycle_status === 'completed';
                        const amt = a.final_amount ?? a.amount;
                        const cur = a.currency || 'THB';
                        const terms = [a.payment_terms, a.delivery_terms].filter(Boolean).join(' · ');
                        return (
                          <tr key={a.id} className={`border-b hover:bg-muted/30 ${handed ? 'opacity-60' : ''}`}>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{a.award_no || a.award_number || '—'}</td>
                            <td className="p-3 font-medium">{a.suppliers?.company_name || '—'}</td>
                            <td className="p-3 text-muted-foreground text-xs">
                              <div>{a.rfqs?.title || '—'}</div>
                              <div className="text-muted-foreground/70">{a.rfqs?.rfq_number}</div>
                            </td>
                            <td className="p-3 text-right font-semibold tabular-nums">{amt ? `${cur} ${Number(amt).toLocaleString()}` : '—'}</td>
                            <td className="p-3 text-muted-foreground text-xs max-w-[160px]">{terms || '—'}</td>
                            <td className="p-3 text-muted-foreground text-xs">{(a.awarded_at || a.created_at) ? new Date(a.awarded_at || a.created_at).toLocaleDateString('th-TH') : '—'}</td>
                            <td className="p-3">
                              {handed ? (
                                <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">ส่งบัญชีแล้ว</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">รอส่งบัญชี</Badge>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {!handed && canApprove && (
                                <Button variant="outline" size="sm" onClick={() => markHandedOver(a.id)}>
                                  <SendHorizontal className="w-3 h-3 mr-1" /> ทำเครื่องหมายส่งแล้ว
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {handoffAwards.length > 0 && (
                <div className="p-3 border-t text-xs text-muted-foreground flex gap-4">
                  <span>รอส่งบัญชี: <strong className="text-amber-600">{pendingHandoff.length}</strong></span>
                  <span>ส่งแล้ว: <strong className="text-blue-600">{doneHandoff.length}</strong></span>
                  <span>รวม: <strong>{handoffAwards.length}</strong></span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!criteriaAward} onOpenChange={o => !o && setCriteriaAward(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>เกณฑ์ที่ใช้คัดเลือกผู้ชนะ</DialogTitle>
            {criteriaAward && (
              <p className="text-sm text-muted-foreground">
                {criteriaAward.rfqs?.rfq_number} · {criteriaAward.rfqs?.title}
              </p>
            )}
          </DialogHeader>
          {criteriaAward?.selection_snapshot
            ? <AwardSelectionSummary snap={criteriaAward.selection_snapshot} isOverride={criteriaAward.is_override_selection} selectionReason={criteriaAward.selection_reason} />
            : <p className="text-sm text-muted-foreground py-6 text-center">ไม่มีข้อมูลเกณฑ์การคัดเลือก (เป็น award ที่สร้างก่อนเปิดใช้ฟีเจอร์นี้)</p>}
        </DialogContent>
      </Dialog>

      {/* Rollback confirmation dialog */}
      <Dialog open={!!rollbackTarget} onOpenChange={o => { if (!o) { setRollbackTarget(null); setRollbackReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rollback การคัดเลือกผู้ชนะ</DialogTitle>
          </DialogHeader>
          {rollbackTarget && (
            <div className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-1">
                <p className="font-medium">{rollbackTarget.suppliers?.company_name} — {rollbackTarget.rfqs?.title}</p>
                <p className="text-xs">เมื่อ Rollback แล้ว:</p>
                <ul className="text-xs list-disc pl-4 space-y-0.5">
                  <li>ยกเลิกผู้ชนะที่เลือกไว้</li>
                  <li>ลบ Award นี้</li>
                  <li>RFQ กลับสู่สถานะ Evaluation</li>
                  <li>สามารถเลือกผู้ชนะใหม่ได้ที่ Bid Comparison</li>
                </ul>
              </div>
              <div className="space-y-1">
                <Label>เหตุผลที่ Rollback *</Label>
                <Textarea rows={3} value={rollbackReason} onChange={e => setRollbackReason(e.target.value)}
                  placeholder="เช่น เลือกผู้ชนะผิดราย, ต้องการทบทวนคะแนนใหม่, supplier แจ้งถอนตัว..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRollbackTarget(null)}>ยกเลิก</Button>
                <Button variant="destructive" onClick={handleRollback}
                  disabled={!rollbackReason.trim() || rollbacking}>
                  {rollbacking ? 'กำลัง Rollback...' : 'ยืนยัน Rollback'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('awards.details')}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <DetailRow label={t('awards.awardNo')} value={selected.award_no || selected.award_number} />
              <DetailRow label={t('awards.supplier')} value={selected.suppliers?.company_name} />
              <DetailRow label={t('awards.rfq')} value={`${selected.rfqs?.rfq_number} · ${selected.rfqs?.title}`} />
              <DetailRow label={t('awards.finalAmount')} value={(() => { const cur = selected.currency || 'THB'; const amt = selected.final_amount ?? selected.amount; return amt != null ? `${cur} ${Number(amt).toLocaleString()}` : null; })()} />
              <DetailRow label={t('common.status')} value={getStatusDisplay(selected).label} />
              <DetailRow label={t('awards.awardReason')} value={selected.award_reason} />
              <DetailRow label={t('awards.recommendation')} value={selected.recommendation} />
              <DetailRow label={t('awards.decisionReason')} value={selected.decision_reason} />
              <DetailRow label={t('awards.awardedAt')} value={selected.awarded_at ? new Date(selected.awarded_at).toLocaleString() : null} />
              <DetailRow label={t('awards.created')} value={selected.created_at ? new Date(selected.created_at).toLocaleString() : null} />

              {canApprove && (selected.status === 'pending' || selected.award_lifecycle_status === 'pending_approval') && (
                <div className="pt-3 space-y-2 border-t">
                  <Label>Decision Reason</Label>
                  <Textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Reason for your decision..." rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { handleStatusChange(selected.id, 'approved'); setDetailOpen(false); }}>
                      {t('awards.approve')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { handleStatusChange(selected.id, 'rejected'); setDetailOpen(false); }}>
                      {t('awards.reject')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value || '—'}</span>
    </div>
  );
}
