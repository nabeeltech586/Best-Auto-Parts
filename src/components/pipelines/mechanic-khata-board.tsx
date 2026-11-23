'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Wrench,
  IndianRupee,
  TrendingUp,
  ShieldCheck,
  Plus,
  RefreshCw,
  Search,
  MessageCircle,
  Copy,
  CheckCircle2,
  Award,
  Loader2,
  Phone,
  Store,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';
import type {
  MechanicContact,
  MechanicKhataStage,
  MechanicLoyaltyTier,
} from '@/types/inventory';

interface MechanicKhataMetrics {
  totalMechanics: number;
  totalPendingBalance: number;
  totalMonthlyVolume: number;
  activeKhataCount: number;
  settledCount: number;
}

const KHATA_STAGES: {
  key: MechanicKhataStage;
  name: string;
  badgeClass: string;
  headerBorder: string;
}[] = [
  {
    key: 'Active Clear',
    name: 'Active Clear',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    headerBorder: 'border-emerald-500',
  },
  {
    key: 'Running Monthly Khata',
    name: 'Running Monthly Khata',
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    headerBorder: 'border-blue-500',
  },
  {
    key: 'Payment Due',
    name: 'Payment Due',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    headerBorder: 'border-amber-500',
  },
  {
    key: 'Gold & VIP Partners',
    name: 'Gold & VIP Partners',
    badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
    headerBorder: 'border-purple-500',
  },
  {
    key: 'Settled This Month',
    name: 'Settled This Month',
    badgeClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
    headerBorder: 'border-teal-500',
  },
];

export function MechanicKhataBoard() {
  const [mechanics, setMechanics] = useState<MechanicContact[]>([]);
  const [metrics, setMetrics] = useState<MechanicKhataMetrics>({
    totalMechanics: 0,
    totalPendingBalance: 0,
    totalMonthlyVolume: 0,
    activeKhataCount: 0,
    settledCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog States
  const [udhaarMechanic, setUdhaarMechanic] = useState<MechanicContact | null>(null);
  const [udhaarAmount, setUdhaarAmount] = useState('');
  const [udhaarDesc, setUdhaarDesc] = useState('');
  const [submittingUdhaar, setSubmittingUdhaar] = useState(false);

  const [settleMechanic, setSettleMechanic] = useState<MechanicContact | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMode, setSettleMode] = useState<'UPI' | 'Cash' | 'Bank Transfer' | 'Cheque'>('UPI');
  const [settleRef, setSettleRef] = useState('');
  const [submittingSettle, setSubmittingSettle] = useState(false);

  const [statementData, setStatementData] = useState<{
    mechanic: MechanicContact;
    statementText: string;
    paymentLink?: string;
  } | null>(null);
  const [generatingStatement, setGeneratingStatement] = useState(false);

  // New Mechanic Dialog
  const [newMechanicOpen, setNewMechanicOpen] = useState(false);
  const [newMechName, setNewMechName] = useState('');
  const [newMechPhone, setNewMechPhone] = useState('');
  const [newMechCompany, setNewMechCompany] = useState('');
  const [submittingNewMech, setSubmittingNewMech] = useState(false);

  const fetchMechanics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/mechanics/khata?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load mechanics ledger');

      const data = await res.json();
      setMechanics(data.mechanics || []);
      if (data.metrics) setMetrics(data.metrics);
    } catch {
      toast.error('Failed to load Mechanic Khata records');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchMechanics();
  }, [fetchMechanics]);

  // Handle Submit Udhaar
  const handleSaveUdhaar = async () => {
    if (!udhaarMechanic) return;
    const amt = Number(udhaarAmount);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid credit / Udhaar amount');
      return;
    }

    setSubmittingUdhaar(true);
    try {
      const res = await fetch('/api/mechanics/khata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: udhaarMechanic.id,
          entry_type: 'credit_udhaar',
          amount: amt,
          description: udhaarDesc.trim() || 'Spare Parts Credit (Udhaar)',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record Udhaar');

      toast.success(data.message || `Recorded ${formatCurrency(amt)} Udhaar for ${udhaarMechanic.name}`);
      setUdhaarMechanic(null);
      setUdhaarAmount('');
      setUdhaarDesc('');
      fetchMechanics();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error recording Udhaar');
    } finally {
      setSubmittingUdhaar(false);
    }
  };

  // Handle Submit Settlement
  const handleSaveSettle = async () => {
    if (!settleMechanic) return;
    const amt = Number(settleAmount);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    setSubmittingSettle(true);
    try {
      const res = await fetch('/api/mechanics/khata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: settleMechanic.id,
          entry_type: 'debit_payment',
          amount: amt,
          payment_mode: settleMode,
          reference_id: settleRef.trim() || null,
          description: `Khata Settlement via ${settleMode}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record settlement');

      toast.success(data.message || `Recorded ${formatCurrency(amt)} payment for ${settleMechanic.name}`);
      setSettleMechanic(null);
      setSettleAmount('');
      setSettleRef('');
      fetchMechanics();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error recording settlement');
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Handle WhatsApp Hisab Statement
  const handleWhatsAppHisab = async (mechanic: MechanicContact) => {
    setGeneratingStatement(true);
    try {
      const res = await fetch('/api/mechanics/khata/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: mechanic.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate statement');

      setStatementData({
        mechanic,
        statementText: data.statementText,
        paymentLink: data.paymentLink,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error generating Hisab statement');
    } finally {
      setGeneratingStatement(false);
    }
  };

  // Handle Add New Mechanic Partner
  const handleCreateMechanic = async () => {
    if (!newMechName.trim() || !newMechPhone.trim()) {
      toast.error('Mechanic Name and WhatsApp number are required');
      return;
    }

    setSubmittingNewMech(true);
    try {
      // First, create or ensure contact with Wholesale / Mechanic tag
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMechName.trim(),
          phone: newMechPhone.trim(),
          company: newMechCompany.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(data.error || 'Failed to create mechanic contact');
      }

      toast.success(`Workshop partner ${newMechName} added to Mechanic Khata board!`);
      setNewMechanicOpen(false);
      setNewMechName('');
      setNewMechPhone('');
      setNewMechCompany('');
      fetchMechanics();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creating mechanic partner');
    } finally {
      setSubmittingNewMech(false);
    }
  };

  const getTierBadge = (tier: MechanicLoyaltyTier) => {
    switch (tier) {
      case 'VIP':
        return (
          <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 text-[10px] gap-1 font-bold">
            <Award className="size-3" /> VIP Partner
          </Badge>
        );
      case 'Gold':
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-semibold">
            <Award className="size-3" /> Gold Partner
          </Badge>
        );
      case 'Silver':
        return (
          <Badge className="bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30 text-[10px] gap-1 font-medium">
            Silver Partner
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] gap-1 font-medium">
            Trade Partner
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active Trade Partners</span>
              <div className="rounded-lg p-1.5 bg-primary/10 text-primary">
                <Wrench className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {metrics.totalMechanics}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Workshops & local mechanics
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Total Udhaar Pending</span>
              <div className="rounded-lg p-1.5 bg-rose-500/10 text-rose-500">
                <IndianRupee className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 truncate">
              {formatCurrency(metrics.totalPendingBalance)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {metrics.activeKhataCount} mechanics with balance
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Monthly Trade Volume</span>
              <div className="rounded-lg p-1.5 bg-emerald-500/10 text-emerald-500">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {formatCurrency(metrics.totalMonthlyVolume)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Combined 30-day purchases
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">100% Settled Accounts</span>
              <div className="rounded-lg p-1.5 bg-teal-500/10 text-teal-500">
                <ShieldCheck className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-teal-600 dark:text-teal-400">
              {metrics.settledCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Zero balance / clear Khata</p>
          </CardContent>
        </Card>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workshop, mechanic, or phone..."
            className="pl-8 text-xs bg-muted/40 border-border"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMechanics}
            disabled={loading}
            className="text-xs gap-1.5 border-border"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setNewMechanicOpen(true)}
            className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Add Workshop Partner
          </Button>
        </div>
      </div>

      {/* Kanban Board with 5 Stages */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-xs text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          Loading Mechanic Khata & Loyalty Board...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 items-start overflow-x-auto pb-4">
          {KHATA_STAGES.map((col) => {
            const stageMechanics = mechanics.filter((m) => {
              if (col.key === 'Active Clear') {
                return m.khata_stage === 'Active Clear' || (m.pending_balance === 0 && m.loyalty_tier === 'Partner');
              }
              if (col.key === 'Gold & VIP Partners') {
                return m.loyalty_tier === 'Gold' || m.loyalty_tier === 'VIP' || m.khata_stage === 'Gold & VIP Partners';
              }
              return m.khata_stage === col.key;
            });

            return (
              <div
                key={col.key}
                className="flex flex-col rounded-xl border border-border bg-card/50 p-3 min-w-[260px] space-y-3"
              >
                {/* Column Header */}
                <div className={`border-l-4 ${col.headerBorder} pl-2 flex items-center justify-between`}>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">{col.name}</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {stageMechanics.length} {stageMechanics.length === 1 ? 'mechanic' : 'mechanics'}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-mono', col.badgeClass)}>
                    {stageMechanics.length}
                  </Badge>
                </div>

                {/* Cards Container */}
                <div className="space-y-2.5">
                  {stageMechanics.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/80 p-4 text-center text-[11px] text-muted-foreground italic">
                      No mechanics in this stage
                    </div>
                  ) : (
                    stageMechanics.map((mechanic) => {
                      const hasDue = mechanic.pending_balance > 0;
                      return (
                        <Card
                          key={mechanic.id}
                          className="border-border bg-card shadow-sm hover:shadow transition-shadow"
                        >
                          <CardContent className="p-3 space-y-2.5">
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <h4 className="text-xs font-bold text-foreground leading-tight">
                                  {mechanic.name}
                                </h4>
                                {mechanic.company && (
                                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                    <Store className="size-3" />
                                    <span>{mechanic.company}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mt-0.5">
                                  <Phone className="size-2.5" />
                                  <span>{mechanic.phone}</span>
                                </div>
                              </div>
                              {getTierBadge(mechanic.loyalty_tier)}
                            </div>

                            {/* Financial Stats */}
                            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-2 text-[11px]">
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Monthly Vol.</span>
                                <span className="font-mono font-semibold text-foreground">
                                  {formatCurrency(mechanic.monthly_purchases)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-muted-foreground block">Balance Due</span>
                                <span
                                  className={cn(
                                    'font-mono font-bold',
                                    hasDue
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  )}
                                >
                                  {formatCurrency(mechanic.pending_balance)}
                                </span>
                              </div>
                            </div>

                            {/* 3 Interactive Action Buttons */}
                            <div className="grid grid-cols-3 gap-1 pt-0.5">
                              {/* 1. + Udhaar */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setUdhaarMechanic(mechanic);
                                  setUdhaarAmount('');
                                  setUdhaarDesc('');
                                }}
                                className="h-7 text-[11px] px-1 border-border text-foreground hover:bg-muted font-medium"
                                title="Add Credit Udhaar purchase"
                              >
                                <Plus className="size-3 mr-0.5 text-primary" />
                                Udhaar
                              </Button>

                              {/* 2. Settle */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSettleMechanic(mechanic);
                                  setSettleAmount(mechanic.pending_balance > 0 ? String(mechanic.pending_balance) : '');
                                  setSettleRef('');
                                  setSettleMode('UPI');
                                }}
                                className="h-7 text-[11px] px-1 border-border text-foreground hover:bg-muted font-medium"
                                title="Record payment & settle balance"
                              >
                                <CheckCircle2 className="size-3 mr-0.5 text-emerald-600" />
                                Settle
                              </Button>

                              {/* 3. WhatsApp Hisab */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleWhatsAppHisab(mechanic)}
                                disabled={generatingStatement}
                                className="h-7 text-[11px] px-1 border-border text-foreground hover:bg-muted font-medium"
                                title="Send English statement + PhonePe link"
                              >
                                <MessageCircle className="size-3 mr-0.5 text-emerald-500" />
                                Hisab
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: + Udhaar (Credit Purchase) */}
      {udhaarMechanic && (
        <Dialog open={Boolean(udhaarMechanic)} onOpenChange={(v) => !v && setUdhaarMechanic(null)}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Add Credit Purchase (Udhaar)
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Record parts taken on credit for {udhaarMechanic.name}.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mechanic / Workshop:</span>
                  <span className="font-semibold text-foreground">{udhaarMechanic.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mobile:</span>
                  <span className="font-mono text-foreground">{udhaarMechanic.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Balance:</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrency(udhaarMechanic.pending_balance)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Credit Amount (₹) *</Label>
                <div className="relative mt-1">
                  <IndianRupee className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={udhaarAmount}
                    onChange={(e) => setUdhaarAmount(e.target.value)}
                    placeholder="e.g. 1450"
                    className="pl-8 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Parts Description / Memo</Label>
                <Input
                  value={udhaarDesc}
                  onChange={(e) => setUdhaarDesc(e.target.value)}
                  placeholder="e.g. Hero Splendor Chain Sprocket Kit + Engine Oil"
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUdhaarMechanic(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveUdhaar}
                disabled={submittingUdhaar || !udhaarAmount || Number(udhaarAmount) <= 0}
                className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submittingUdhaar ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Add to Khata
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 2: Settle Khata (Record Payment) */}
      {settleMechanic && (
        <Dialog open={Boolean(settleMechanic)} onOpenChange={(v) => !v && setSettleMechanic(null)}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Settle Mechanic Khata
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Record payment received from {settleMechanic.name}.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mechanic / Workshop:</span>
                  <span className="font-semibold text-foreground">{settleMechanic.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Pending Udhaar:</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrency(settleMechanic.pending_balance)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Payment Received (₹) *</Label>
                <div className="relative mt-1">
                  <IndianRupee className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="e.g. 2000"
                    className="pl-8 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Payment Mode</Label>
                <select
                  value={settleMode}
                  onChange={(e) => setSettleMode(e.target.value as 'UPI' | 'Cash' | 'Bank Transfer' | 'Cheque')}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                >
                  <option value="UPI">UPI (GooglePay / PhonePe / Paytm)</option>
                  <option value="Cash">Cash in Hand</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS / NEFT)</option>
                  <option value="Cheque">Bank Cheque</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Ref ID / UTR (Optional)</Label>
                <Input
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  placeholder="e.g. UPI Ref / Cash receipt"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettleMechanic(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSettle}
                disabled={submittingSettle || !settleAmount || Number(settleAmount) <= 0}
                className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submittingSettle ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Confirm Settlement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 3: WhatsApp Hisab & Statement */}
      {statementData && (
        <Dialog open={Boolean(statementData)} onOpenChange={(v) => !v && setStatementData(null)}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Mechanic Khata Hisab Statement
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    English Khata statement + PhonePe payment link for {statementData.mechanic.name}.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed text-foreground">
                {statementData.statementText}
              </div>

              {statementData.paymentLink && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                  <span className="font-medium">PhonePe UPI Payment Link Created</span>
                  <Badge className="bg-emerald-600 text-white text-[10px]">READY</Badge>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(statementData.statementText);
                  toast.success('Khata statement copied to clipboard!');
                }}
                className="text-xs gap-1.5 border-border"
              >
                <Copy className="size-3.5" />
                Copy Statement
              </Button>

              <a
                href={`https://wa.me/${statementData.mechanic.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  statementData.statementText
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ size: 'sm' }),
                  'text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white'
                )}
              >
                <MessageCircle className="size-3.5" />
                Send via WhatsApp
              </a>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 4: Add New Workshop Partner */}
      <Dialog open={newMechanicOpen} onOpenChange={setNewMechanicOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  New Workshop Partner
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Add a mechanic or workshop to Best Auto Parts Khata ledger.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs">Mechanic / Partner Name *</Label>
              <Input
                value={newMechName}
                onChange={(e) => setNewMechName(e.target.value)}
                placeholder="e.g. Aslam Bhai"
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">WhatsApp / Mobile Number *</Label>
              <Input
                value={newMechPhone}
                onChange={(e) => setNewMechPhone(e.target.value)}
                placeholder="e.g. +91 98971 23456"
                className="mt-1 text-xs font-mono"
              />
            </div>

            <div>
              <Label className="text-xs">Workshop / Garage Name (Optional)</Label>
              <Input
                value={newMechCompany}
                onChange={(e) => setNewMechCompany(e.target.value)}
                placeholder="e.g. Aslam Auto Service, Kailashpur"
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewMechanicOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateMechanic}
              disabled={submittingNewMech || !newMechName.trim() || !newMechPhone.trim()}
              className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submittingNewMech ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Save Partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
