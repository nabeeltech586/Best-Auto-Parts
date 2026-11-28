'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Shield,
  Truck,
  MapPin,
  AlertCircle,
  Plus,
  Search,
  ArrowRight,
  MessageCircle,
  CreditCard,
  CheckCircle2,
  Clock,
  Trash2,
  Edit,
  ExternalLink,
  RefreshCw,
  X,
  Phone,
  FileCheck2,
  Coins,
  Calendar,
} from 'lucide-react';
import {
  buildServiceCaseWhatsAppMessage,
  formatDisplayDate,
  getKolkataTodayDateString,
} from '@/lib/services/service-cases';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type {
  ServiceCase,
  ServiceType,
  ServiceStage,
  ServicePaymentStatus,
} from '@/types/services';

const SERVICE_TYPES: { id: ServiceType; label: string; icon: typeof FileText; color: string; badge: string }[] = [
  {
    id: 'ITR',
    label: 'ITR Filing',
    icon: FileText,
    color: 'emerald',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  {
    id: 'Vehicle Insurance',
    label: 'Vehicle Insurance',
    icon: Shield,
    color: 'sky',
    badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
  },
  {
    id: 'RTO Road Tax',
    label: 'RTO Road Tax',
    icon: Truck,
    color: 'indigo',
    badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  },
  {
    id: 'State Border Tax',
    label: 'State Border Tax',
    icon: MapPin,
    color: 'amber',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
  {
    id: 'E-Challan',
    label: 'E-Challan Settlement',
    icon: AlertCircle,
    color: 'rose',
    badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  },
];

const STAGES: { id: ServiceStage; title: string; subtitle: string; tone: string }[] = [
  {
    id: 'NEW_INQUIRY',
    title: 'New Inquiry / Docs Pending',
    subtitle: 'Customer contacted, awaiting RC/PAN',
    tone: 'border-amber-500/30 bg-amber-500/5',
  },
  {
    id: 'PORTAL_CHECK',
    title: 'Portal Check & Quote',
    subtitle: 'Checking Vahan / Tax portal for dues',
    tone: 'border-sky-500/30 bg-sky-500/5',
  },
  {
    id: 'PAYMENT_PENDING',
    title: 'Payment Pending',
    subtitle: 'Quote shared, awaiting payment',
    tone: 'border-purple-500/30 bg-purple-500/5',
  },
  {
    id: 'PROCESSING',
    title: 'Processing / Filing',
    subtitle: 'Filing on portal / policy generation',
    tone: 'border-blue-500/30 bg-blue-500/5',
  },
  {
    id: 'COMPLETED',
    title: 'Completed & Delivered',
    subtitle: 'Receipt / Policy sent on WhatsApp',
    tone: 'border-emerald-500/30 bg-emerald-500/5',
  },
];

const STAGE_TRANSITION: Record<ServiceStage, ServiceStage | null> = {
  NEW_INQUIRY: 'PORTAL_CHECK',
  PORTAL_CHECK: 'PAYMENT_PENDING',
  PAYMENT_PENDING: 'PROCESSING',
  PROCESSING: 'COMPLETED',
  COMPLETED: null,
};

export function OnlineServicesBoard() {
  const [cases, setCases] = useState<ServiceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [activeCase, setActiveCase] = useState<ServiceCase | null>(null);
  const [feeCase, setFeeCase] = useState<ServiceCase | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formType, setFormType] = useState<ServiceType>('Vehicle Insurance');
  const [formRef, setFormRef] = useState('');
  const [formGovtFee, setFormGovtFee] = useState<number | ''>(0);
  const [formServiceCharge, setFormServiceCharge] = useState<number | ''>(50);
  const [formPaymentDate, setFormPaymentDate] = useState<string>('');
  const [formReceiptNumber, setFormReceiptNumber] = useState<string>('');
  const [formStatus, setFormStatus] = useState<ServicePaymentStatus>('UNPAID');
  const [formStage, setFormStage] = useState<ServiceStage>('NEW_INQUIRY');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load cases
  const loadCases = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/services/cases', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases || []);
      }
    } catch (err) {
      console.error('Failed to load service cases:', err);
      toast.error('Could not load service cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // Open create modal with optional default stage
  const openCreateModal = (defaultStage?: ServiceStage) => {
    const today = getKolkataTodayDateString();
    setFormName('');
    setFormPhone('');
    setFormType('Vehicle Insurance');
    setFormRef('');
    setFormGovtFee(0);
    setFormServiceCharge(50);
    setFormPaymentDate(today);
    setFormReceiptNumber('');
    setFormStatus('UNPAID');
    setFormStage(defaultStage || 'NEW_INQUIRY');
    setFormNotes('');
    setCreateModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (sc: ServiceCase) => {
    setActiveCase(sc);
    setFormName(sc.customer_name);
    setFormPhone(sc.phone);
    setFormType(sc.service_type);
    setFormRef(sc.vehicle_or_ref);
    setFormGovtFee(sc.govt_fee ?? 0);
    setFormServiceCharge(sc.service_charge ?? sc.fee_amount ?? 50);
    setFormPaymentDate(
      sc.payment_date || (sc.created_at ? sc.created_at.slice(0, 10) : getKolkataTodayDateString())
    );
    setFormReceiptNumber(sc.receipt_number || '');
    setFormStatus(sc.payment_status);
    setFormStage(sc.stage);
    setFormNotes(sc.notes || '');
    setEditModalOpen(true);
  };

  // Open fee & date quick modal
  const openFeeModal = (sc: ServiceCase) => {
    setFeeCase(sc);
    setFormGovtFee(sc.govt_fee ?? 0);
    setFormServiceCharge(sc.service_charge ?? sc.fee_amount ?? 50);
    setFormPaymentDate(
      sc.payment_date || (sc.created_at ? sc.created_at.slice(0, 10) : getKolkataTodayDateString())
    );
    setFormReceiptNumber(sc.receipt_number || '');
    setFormStatus(sc.payment_status);
    setFeeModalOpen(true);
  };

  // Quick save fee & date modal
  const handleFeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeCase) return;

    setSubmitting(true);
    const govt = Number(formGovtFee) || 0;
    const srv = Number(formServiceCharge) || 0;
    const total = govt + srv;

    try {
      const res = await fetch(`/api/services/cases/${feeCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          govt_fee: govt,
          service_charge: srv,
          fee_amount: total,
          payment_date: formPaymentDate || null,
          receipt_number: formReceiptNumber.trim() || null,
          payment_status: formStatus,
        }),
      });

      if (!res.ok) throw new Error('Failed to update fees');

      const data = await res.json();
      setCases((prev) => prev.map((c) => (c.id === feeCase.id ? data.case : c)));
      setFeeModalOpen(false);
      toast.success('Fees and payment date updated!');
    } catch {
      toast.error('Failed to update fees');
    } finally {
      setSubmitting(false);
    }
  };

  // Save new case
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      toast.error('Customer name and phone number are required');
      return;
    }

    setSubmitting(true);
    const govt = Number(formGovtFee) || 0;
    const srv = Number(formServiceCharge) || 0;
    const total = govt + srv;

    try {
      const res = await fetch('/api/services/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: formName,
          phone: formPhone,
          service_type: formType,
          vehicle_or_ref: formRef,
          govt_fee: govt,
          service_charge: srv,
          fee_amount: total,
          payment_date: formPaymentDate || null,
          receipt_number: formReceiptNumber.trim() || null,
          payment_status: formStatus,
          stage: formStage,
          notes: formNotes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create case');
      }

      const data = await res.json();
      setCases((prev) => [data.case, ...prev]);
      setCreateModalOpen(false);
      toast.success(`Service case for ${formName} created!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating case';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Update existing case
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase) return;

    setSubmitting(true);
    const govt = Number(formGovtFee) || 0;
    const srv = Number(formServiceCharge) || 0;
    const total = govt + srv;

    try {
      const res = await fetch(`/api/services/cases/${activeCase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: formName,
          phone: formPhone,
          service_type: formType,
          vehicle_or_ref: formRef,
          govt_fee: govt,
          service_charge: srv,
          fee_amount: total,
          payment_date: formPaymentDate || null,
          receipt_number: formReceiptNumber.trim() || null,
          payment_status: formStatus,
          stage: formStage,
          notes: formNotes,
        }),
      });

      if (!res.ok) throw new Error('Failed to update case');

      const data = await res.json();
      setCases((prev) => prev.map((c) => (c.id === activeCase.id ? data.case : c)));
      setEditModalOpen(false);
      toast.success('Service case updated');
    } catch {
      toast.error('Failed to update case');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete case
  const handleDeleteCase = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service case?')) return;
    try {
      const res = await fetch(`/api/services/cases/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCases((prev) => prev.filter((c) => c.id !== id));
        setEditModalOpen(false);
        toast.success('Service case deleted');
      }
    } catch {
      toast.error('Failed to delete service case');
    }
  };

  // Move to next stage
  const handleMoveNext = async (sc: ServiceCase) => {
    const next = STAGE_TRANSITION[sc.stage];
    if (!next) return;

    try {
      const res = await fetch(`/api/services/cases/${sc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: next }),
      });
      if (res.ok) {
        const nextStageObj = STAGES.find((s) => s.id === next);
        setCases((prev) =>
          prev.map((c) => (c.id === sc.id ? { ...c, stage: next } : c))
        );
        toast.success(`Moved to "${nextStageObj?.title}"`);
      }
    } catch {
      toast.error('Failed to update stage');
    }
  };

  // Toggle or mark payment status
  const handleTogglePayment = async (sc: ServiceCase) => {
    const nextStatus: ServicePaymentStatus = sc.payment_status === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      const res = await fetch(`/api/services/cases/${sc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: nextStatus }),
      });
      if (res.ok) {
        setCases((prev) =>
          prev.map((c) => (c.id === sc.id ? { ...c, payment_status: nextStatus } : c))
        );
        toast.success(`Payment status marked as ${nextStatus}`);
      }
    } catch {
      toast.error('Failed to update payment status');
    }
  };

  // Quick WhatsApp action
  const handleOpenWhatsApp = (sc: ServiceCase) => {
    const cleanPhone = sc.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const message = buildServiceCaseWhatsAppMessage(sc);
    const link = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
    window.open(link, '_blank');
  };

  // Filtered cases
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchesSearch =
        c.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        c.vehicle_or_ref.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType =
        selectedType === 'All' ||
        c.service_type.toLowerCase() === selectedType.toLowerCase() ||
        (selectedType === 'Insurance' && c.service_type === 'Vehicle Insurance') ||
        (selectedType === 'Road Tax' && c.service_type === 'RTO Road Tax') ||
        (selectedType === 'Border Tax' && c.service_type === 'State Border Tax') ||
        (selectedType === 'E-Challan' && c.service_type === 'E-Challan');

      return matchesSearch && matchesType;
    });
  }, [cases, searchQuery, selectedType]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const active = cases.filter((c) => c.stage !== 'COMPLETED').length;
    const portalPending = cases.filter(
      (c) => c.stage === 'PORTAL_CHECK' || c.stage === 'NEW_INQUIRY'
    ).length;

    // Service Earnings (₹): Total service charges earned on PAID cases
    const serviceEarnings = cases
      .filter((c) => c.payment_status === 'PAID')
      .reduce((sum, c) => sum + (c.service_charge ?? c.fee_amount ?? 0), 0);

    // Unpaid Fees (₹): Pending collection (both service charge + govt fee if unpaid)
    const unpaidFees = cases
      .filter((c) => c.payment_status === 'UNPAID')
      .reduce(
        (sum, c) => sum + (c.service_charge ?? c.fee_amount ?? 0) + (c.govt_fee || 0),
        0
      );

    const completed = cases.filter((c) => c.stage === 'COMPLETED').length;

    return { active, portalPending, serviceEarnings, unpaidFees, completed };
  }, [cases]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-900/90 via-indigo-900/80 to-slate-900 p-6 text-white shadow-xl dark:border-blue-400/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-500/20 px-2.5 py-1 text-xs font-semibold text-blue-200">
                Official Desk
              </span>
              <span className="text-xs text-blue-300/80">Kailashpur, Saharanpur • +91 96347 22174</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Online Services — ITR, Insurance & RTO Desk
            </h1>
            <p className="text-sm text-blue-200/80">
              Manage Vehicle Insurance, Annual ITR Filing, RTO Road Tax, State Border Tax & E-Challan settlements.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadCases}
              disabled={loading}
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>

            <Button
              onClick={() => openCreateModal()}
              className="bg-blue-600 font-semibold text-white shadow-lg hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Plus className="mr-1.5 size-4" />
              New Service Case
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Top 5 Colorful KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Active Cases */}
        <Card className="border-sky-500/20 bg-sky-500/5 p-4 dark:border-sky-500/30 dark:bg-sky-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-sky-700 dark:text-sky-300">Active Cases</span>
            <span className="rounded-lg bg-sky-500/15 p-1.5 text-sky-600 dark:text-sky-400">
              <FileCheck2 className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-sky-950 dark:text-sky-100">{kpis.active}</p>
          <span className="text-[11px] text-muted-foreground">Inquiries in pipeline</span>
        </Card>

        {/* Portal Check Pending */}
        <Card className="border-purple-500/20 bg-purple-500/5 p-4 dark:border-purple-500/30 dark:bg-purple-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Portal Check Pending</span>
            <span className="rounded-lg bg-purple-500/15 p-1.5 text-purple-600 dark:text-purple-400">
              <Clock className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-950 dark:text-purple-100">{kpis.portalPending}</p>
          <span className="text-[11px] text-muted-foreground">Awaiting check or docs</span>
        </Card>

        {/* Service Earnings (₹) */}
        <Card className="border-emerald-500/20 bg-emerald-500/5 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Service Earnings (₹)</span>
            <span className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-600 dark:text-emerald-400">
              <Coins className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-950 dark:text-emerald-100">
            ₹{kpis.serviceEarnings.toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-muted-foreground">Best Auto Parts fees earned</span>
        </Card>

        {/* Unpaid Fees (₹) */}
        <Card className="border-amber-500/20 bg-amber-500/5 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Unpaid Fees (₹)</span>
            <span className="rounded-lg bg-amber-500/15 p-1.5 text-amber-600 dark:text-amber-400">
              <CreditCard className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-950 dark:text-amber-100">
            ₹{kpis.unpaidFees.toLocaleString('en-IN')}
          </p>
          <span className="text-[11px] text-muted-foreground">Pending customer collection</span>
        </Card>

        {/* Completed Cases */}
        <Card className="border-blue-500/20 bg-blue-500/5 p-4 dark:border-blue-500/30 dark:bg-blue-950/20 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Completed Cases</span>
            <span className="rounded-lg bg-blue-500/15 p-1.5 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-950 dark:text-blue-100">{kpis.completed}</p>
          <span className="text-[11px] text-muted-foreground">Successfully filed / delivered</span>
        </Card>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, phone, or vehicle number..."
            className="pl-9 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', 'ITR', 'Insurance', 'Road Tax', 'Border Tax', 'E-Challan'].map((filter) => {
            const active = selectedType.toLowerCase() === filter.toLowerCase();
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setSelectedType(filter)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                    : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {filter}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 5-Column Kanban Board */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {STAGES.map((col) => {
          const colCases = filteredCases.filter((c) => c.stage === col.id);

          return (
            <div
              key={col.id}
              className="flex flex-col rounded-xl border border-border bg-card/60 p-3 shadow-sm dark:bg-card/40"
            >
              {/* Column Header */}
              <div className="flex items-start justify-between pb-3 border-b border-border/80">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
                    <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                      {colCases.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{col.subtitle}</p>
                </div>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openCreateModal(col.id)}
                  title={`Add case to ${col.title}`}
                  className="size-6 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>

              {/* Cards Container */}
              <div className="mt-3 flex-1 space-y-3 min-h-[300px]">
                {colCases.length === 0 ? (
                  <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-center">
                    <p className="text-xs text-muted-foreground">0 cases</p>
                    <button
                      onClick={() => openCreateModal(col.id)}
                      className="mt-1.5 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      + Add Case
                    </button>
                  </div>
                ) : (
                  colCases.map((sc) => {
                    const typeMeta =
                      SERVICE_TYPES.find((t) => t.id === sc.service_type) || SERVICE_TYPES[0];
                    const ServiceIcon = typeMeta.icon;
                    const canMoveNext = STAGE_TRANSITION[sc.stage] !== null;

                    return (
                      <Card
                        key={sc.id}
                        className="group relative overflow-hidden border border-border bg-card p-3.5 transition-all hover:border-blue-500/40 hover:shadow-md"
                      >
                        {/* Top: Service Badge & Fee */}
                        <div className="flex items-start justify-between gap-1">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                              typeMeta.badge
                            )}
                          >
                            <ServiceIcon className="size-3" />
                            {sc.service_type}
                          </span>

                          <div className="text-right leading-tight">
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              Service: ₹{(sc.service_charge ?? sc.fee_amount ?? 0).toLocaleString('en-IN')}
                            </span>
                            {sc.govt_fee && sc.govt_fee > 0 ? (
                              <div className="text-[11px] font-semibold text-foreground/80">
                                Total: ₹{((sc.govt_fee || 0) + (sc.service_charge ?? sc.fee_amount ?? 0)).toLocaleString('en-IN')}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Customer Info */}
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between">
                            <h4
                              onClick={() => openEditModal(sc)}
                              className="cursor-pointer font-semibold text-foreground hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              {sc.customer_name}
                            </h4>
                            <button
                              onClick={() => openEditModal(sc)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                            >
                              <Edit className="size-3.5" />
                            </button>
                          </div>

                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="size-3" />
                            <span>{sc.phone}</span>
                          </div>

                          {sc.vehicle_or_ref ? (
                            <div className="mt-1.5 flex items-center gap-1">
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
                                {sc.vehicle_or_ref}
                              </span>
                            </div>
                          ) : null}

                          {/* Govt Fee, Service Charge, Date & Receipt Badges */}
                          <div className="mt-2.5 rounded-lg border border-border/60 bg-muted/30 p-2 space-y-1 text-[11px]">
                            {sc.govt_fee && sc.govt_fee > 0 ? (
                              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                                <span className="flex items-center gap-1">
                                  <span>🏛️</span>
                                  <span className="font-medium">Govt Fee Paid:</span>
                                </span>
                                <span className="font-semibold text-foreground">₹{sc.govt_fee.toLocaleString('en-IN')}</span>
                              </div>
                            ) : null}

                            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                              <span className="flex items-center gap-1">
                                <span>💼</span>
                                <span className="font-medium">Service Charge:</span>
                              </span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                ₹{(sc.service_charge ?? sc.fee_amount ?? 0).toLocaleString('en-IN')}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 pt-0.5 border-t border-border/40">
                              <span className="flex items-center gap-1">
                                <span>📅</span>
                                <span className="font-medium">Date:</span>
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-medium text-foreground">
                                  {formatDisplayDate(sc.payment_date || sc.created_at)}
                                </span>
                                {sc.receipt_number ? (
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                                    #{sc.receipt_number}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {sc.notes ? (
                            <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">
                              {sc.notes}
                            </p>
                          ) : null}
                        </div>

                        {/* Payment Status Pill */}
                        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                          <button
                            type="button"
                            onClick={() => handleTogglePayment(sc)}
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                              sc.payment_status === 'PAID'
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
                            )}
                          >
                            {sc.payment_status === 'PAID' ? '● PAID' : '○ UNPAID (Click to Mark)'}
                          </button>

                          <span className="text-[10px] text-muted-foreground">
                            {formatDisplayDate(sc.payment_date || sc.created_at)}
                          </span>
                        </div>

                        {/* Quick Actions Bar */}
                        <div className="mt-3 flex items-center justify-between gap-1 pt-1">
                          {/* WhatsApp Free ₹0 */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenWhatsApp(sc)}
                            title="Send free WhatsApp status update"
                            className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                          >
                            <MessageCircle className="mr-1 size-3" />
                            WhatsApp
                          </Button>

                          {/* Compact ₹ Fee & Date */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openFeeModal(sc)}
                            title="Add / Edit Govt Fee, Service Charge, Receipt No & Date"
                            className="h-7 border-indigo-500/30 bg-indigo-50/50 px-2 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                          >
                            ₹ Fee & Date
                          </Button>

                          {/* Move Next */}
                          {canMoveNext ? (
                            <Button
                              size="sm"
                              onClick={() => handleMoveNext(sc)}
                              className="h-7 bg-blue-600 px-2 text-[11px] text-white hover:bg-blue-500 dark:bg-blue-500"
                            >
                              Move Next
                              <ArrowRight className="ml-1 size-3" />
                            </Button>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="mr-1 size-3.5" />
                              Delivered
                            </span>
                          )}
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Create Service Case Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>+ New Online Service Case</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="cust_name">Customer Full Name *</Label>
              <Input
                id="cust_name"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Aslam Khan / Nabeel Pathan"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="cust_phone">Customer Phone (WhatsApp) *</Label>
              <Input
                id="cust_phone"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="e.g. 9634722174"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Service Desk Category *</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {SERVICE_TYPES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setFormType(st.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border p-2 text-left text-xs font-medium transition-all',
                      formType === st.id
                        ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-100'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <st.icon className="size-3.5" />
                    <span className="truncate">{st.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="cust_ref">Vehicle Reg No. / PAN Reference</Label>
              <Input
                id="cust_ref"
                value={formRef}
                onChange={(e) => setFormRef(e.target.value.toUpperCase())}
                placeholder="e.g. UP11AY1234 or PAN Ref"
                className="mt-1 font-mono uppercase"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Never enter raw 12-digit Aadhaar numbers. Use Vehicle Reg or PAN ref only.
              </p>
            </div>

            {/* Structured Fee & Date Inputs */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Coins className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Fees & Government Portal Charges</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cust_govt_fee" className="text-xs">Govt / Portal Fee Paid (₹)</Label>
                  <Input
                    id="cust_govt_fee"
                    type="number"
                    min="0"
                    value={formGovtFee}
                    onChange={(e) => setFormGovtFee(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="mt-1 text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="cust_service_charge" className="text-xs">Service Charge (₹) *</Label>
                  <Input
                    id="cust_service_charge"
                    type="number"
                    min="0"
                    value={formServiceCharge}
                    onChange={(e) => setFormServiceCharge(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="50"
                    className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded bg-muted/50 px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">Total Customer Amount:</span>
                <span className="font-bold text-foreground">
                  ₹{((Number(formGovtFee) || 0) + (Number(formServiceCharge) || 0)).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label htmlFor="cust_payment_date" className="text-xs flex items-center gap-1">
                    <Calendar className="size-3" />
                    <span>Payment / Receipt Date</span>
                  </Label>
                  <Input
                    id="cust_payment_date"
                    type="date"
                    value={formPaymentDate}
                    onChange={(e) => setFormPaymentDate(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="cust_receipt_no" className="text-xs">Receipt / Challan No.</Label>
                  <Input
                    id="cust_receipt_no"
                    value={formReceiptNumber}
                    onChange={(e) => setFormReceiptNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. UPRTE26110003488"
                    className="mt-1 text-xs font-mono uppercase"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cust_payment">Payment Status</Label>
                <select
                  id="cust_payment"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as ServicePaymentStatus)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="UNPAID">UNPAID</option>
                  <option value="PAID">PAID</option>
                </select>
              </div>

              <div>
                <Label htmlFor="cust_stage">Initial Stage</Label>
                <select
                  id="cust_stage"
                  value={formStage}
                  onChange={(e) => setFormStage(e.target.value as ServiceStage)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="cust_notes">Notes & Case Remarks</Label>
              <Textarea
                id="cust_notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="e.g. RC photo received, 3rd party quote ₹840 given"
                rows={2}
                className="mt-1 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-blue-600 text-white">
                {submitting ? 'Creating...' : 'Create Service Case'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. Edit Service Case Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Edit Service Case</DialogTitle>
              {activeCase ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteCase(activeCase.id)}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                >
                  <Trash2 className="size-3.5 mr-1" />
                  Delete
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div>
              <Label>Customer Name</Label>
              <Input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Customer Phone</Label>
              <Input
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Service Type</Label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as ServiceType)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
                >
                  {SERVICE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Vehicle Reg / Ref</Label>
                <Input
                  value={formRef}
                  onChange={(e) => setFormRef(e.target.value.toUpperCase())}
                  className="mt-1 font-mono uppercase"
                />
              </div>
            </div>

            {/* Structured Fee & Date Inputs */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Coins className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Fees & Government Portal Charges</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Govt / Portal Fee Paid (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formGovtFee}
                    onChange={(e) => setFormGovtFee(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="mt-1 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Service Charge (₹) *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formServiceCharge}
                    onChange={(e) => setFormServiceCharge(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="50"
                    className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded bg-muted/50 px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">Total Customer Amount:</span>
                <span className="font-bold text-foreground">
                  ₹{((Number(formGovtFee) || 0) + (Number(formServiceCharge) || 0)).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="size-3" />
                    <span>Payment / Receipt Date</span>
                  </Label>
                  <Input
                    type="date"
                    value={formPaymentDate}
                    onChange={(e) => setFormPaymentDate(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs">Receipt / Challan No.</Label>
                  <Input
                    value={formReceiptNumber}
                    onChange={(e) => setFormReceiptNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. UPRTE26110003488"
                    className="mt-1 text-xs font-mono uppercase"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Status</Label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as ServicePaymentStatus)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
                >
                  <option value="UNPAID">UNPAID</option>
                  <option value="PAID">PAID</option>
                </select>
              </div>

              <div>
                <Label>Kanban Stage</Label>
                <select
                  value={formStage}
                  onChange={(e) => setFormStage(e.target.value as ServiceStage)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label>Notes & Remarks</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
                className="mt-1 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-blue-600 text-white">
                {submitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 7. Manage Fees & Receipt Date Quick Modal */}
      <Dialog open={feeModalOpen} onOpenChange={setFeeModalOpen}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="size-5 text-indigo-600 dark:text-indigo-400" />
              <span>₹ Manage Fees & Receipt Date</span>
            </DialogTitle>
          </DialogHeader>

          {feeCase ? (
            <form onSubmit={handleFeeSubmit} className="space-y-4 pt-1">
              <div className="rounded-lg border border-border/80 bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{feeCase.customer_name}</span>
                  <span className="rounded bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground border">
                    {feeCase.service_type}
                  </span>
                </div>
                {feeCase.vehicle_or_ref ? (
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    Ref: {feeCase.vehicle_or_ref}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fee_govt" className="text-xs">Govt / Portal Fee (₹)</Label>
                  <Input
                    id="fee_govt"
                    type="number"
                    min="0"
                    value={formGovtFee}
                    onChange={(e) => setFormGovtFee(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="mt-1 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Vahan/Rajkosh/Challan</p>
                </div>

                <div>
                  <Label htmlFor="fee_srv" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Service Charge (₹) *
                  </Label>
                  <Input
                    id="fee_srv"
                    type="number"
                    min="0"
                    value={formServiceCharge}
                    onChange={(e) => setFormServiceCharge(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="50"
                    className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Best Auto Parts fee</p>
                </div>
              </div>

              {/* Total Calculation Strip */}
              <div className="flex items-center justify-between rounded-lg bg-indigo-50/70 p-3 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/40">
                <div className="text-xs text-indigo-900 dark:text-indigo-200">
                  <span>Govt Fee: ₹{Number(formGovtFee) || 0}</span>
                  <span className="mx-1.5">+</span>
                  <span>Service: ₹{Number(formServiceCharge) || 0}</span>
                </div>
                <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                  Total: ₹{((Number(formGovtFee) || 0) + (Number(formServiceCharge) || 0)).toLocaleString('en-IN')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fee_date" className="text-xs flex items-center gap-1">
                    <Calendar className="size-3" />
                    <span>Payment Date</span>
                  </Label>
                  <Input
                    id="fee_date"
                    type="date"
                    value={formPaymentDate}
                    onChange={(e) => setFormPaymentDate(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="fee_receipt" className="text-xs">Receipt / Challan No.</Label>
                  <Input
                    id="fee_receipt"
                    value={formReceiptNumber}
                    onChange={(e) => setFormReceiptNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. UPRTE26110003488"
                    className="mt-1 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="fee_status" className="text-xs">Payment Collection Status</Label>
                <select
                  id="fee_status"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as ServicePaymentStatus)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
                >
                  <option value="UNPAID">○ UNPAID (Collection Pending)</option>
                  <option value="PAID">● PAID (Payment Received)</option>
                </select>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setFeeModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="bg-indigo-600 text-white hover:bg-indigo-500">
                  {submitting ? 'Saving...' : 'Save Fee & Date'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
