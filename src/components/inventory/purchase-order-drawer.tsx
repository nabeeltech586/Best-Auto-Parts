'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Send,
  MessageCircle,
  Copy,
  Trash2,
  Plus,
  Minus,
  Truck,
  ExternalLink,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { Supplier, PurchaseOrderItem } from '@/types/inventory';

interface PurchaseOrderDrawerProps {
  selectedItems: Map<string, PurchaseOrderItem>;
  onUpdateQuantity: (partId: string, quantity: number) => void;
  onRemoveItem: (partId: string) => void;
  onClearAll: () => void;
  onOrderSaved?: () => void;
  onOpenSuppliersManager?: () => void;
}

export function PurchaseOrderDrawer({
  selectedItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearAll,
  onOrderSaved,
  onOpenSuppliersManager,
}: PurchaseOrderDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [customSupplierPhone, setCustomSupplierPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const itemsList = useMemo(() => Array.from(selectedItems.values()), [selectedItems]);

  const totalUnits = useMemo(
    () => itemsList.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0),
    [itemsList],
  );

  const totalCost = useMemo(
    () =>
      itemsList.reduce(
        (acc, item) =>
          acc + (Number(item.quantity) || 0) * (Number(item.cost_price) || 0),
        0,
      ),
    [itemsList],
  );

  // Fetch saved suppliers
  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const res = await fetch('/api/inventory/suppliers');
      if (res.ok) {
        const data = await res.json();
        const list: Supplier[] = data.suppliers || [];
        setSuppliers(list);
        if (list.length > 0 && !selectedSupplierId) {
          setSelectedSupplierId(list[0].id);
          setCustomSupplierName(list[0].firm_name);
          setCustomSupplierPhone(list[0].whatsapp_number);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingSuppliers(false);
    }
  }, [selectedSupplierId]);

  useEffect(() => {
    if (isOpen) {
      loadSuppliers();
    }
  }, [isOpen, loadSuppliers]);

  const handleSelectSupplier = (id: string | null) => {
    if (!id) return;
    setSelectedSupplierId(id);
    if (id === 'custom') {
      setCustomSupplierName('');
      setCustomSupplierPhone('+91 ');
      return;
    }
    const sup = suppliers.find((s) => s.id === id);
    if (sup) {
      setCustomSupplierName(sup.firm_name);
      setCustomSupplierPhone(sup.whatsapp_number);
    }
  };

  // Build live WhatsApp text
  const poDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const whatsappMessageText = useMemo(() => {
    const distributorName = customSupplierName.trim() || '[Distributor Name]';
    const lines = [
      `*PURCHASE ORDER - BEST AUTO PARTS*`,
      `*Date:* ${poDateString}`,
      `*To:* ${distributorName}`,
      '',
    ];

    itemsList.forEach((item, idx) => {
      const oem = item.oem_number ? `OEM: ${item.oem_number}` : '';
      const brand = item.brand ? `${item.brand}` : '';
      const spec = [oem, brand].filter(Boolean).join(' | ');
      const specStr = spec ? ` (${spec})` : '';
      lines.push(`${idx + 1}. ${item.part_name}${specStr} — *Qty: ${item.quantity} pcs*`);
    });

    lines.push('');
    lines.push(`*Total Items:* ${itemsList.length} | *Total Units:* ${totalUnits}`);
    lines.push(`*Est. Value:* ${formatCurrency(totalCost)}`);
    if (notes.trim()) {
      lines.push(`*Notes:* ${notes.trim()}`);
    }
    lines.push('');
    lines.push('Please confirm availability & dispatch time.');
    lines.push('- Best Auto Parts, Saharanpur (+91 96347 22174)');

    return lines.join('\n');
  }, [itemsList, totalUnits, totalCost, customSupplierName, notes, poDateString]);

  const handleCopyText = () => {
    navigator.clipboard.writeText(whatsappMessageText);
    toast.success('Formatted PO copied to clipboard');
  };

  const handleOpenWhatsAppWeb = async () => {
    const phone = customSupplierPhone.replace(/[^0-9]/g, '');
    if (!phone) {
      toast.error('Please enter a valid distributor WhatsApp number');
      return;
    }

    // Save PO first, then open WA
    await handleSavePO(false);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessageText)}`, '_blank');
  };

  const handleSavePO = async (sendViaApi = false): Promise<boolean> => {
    if (!customSupplierName.trim()) {
      toast.error('Distributor name is required');
      return false;
    }
    if (!customSupplierPhone.trim()) {
      toast.error('Distributor WhatsApp number is required');
      return false;
    }
    if (itemsList.length === 0) {
      toast.error('No parts selected');
      return false;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: selectedSupplierId === 'custom' ? null : selectedSupplierId,
        supplier_name: customSupplierName.trim(),
        supplier_phone: customSupplierPhone.trim(),
        items: itemsList,
        notes: notes.trim() || undefined,
        send_via_whatsapp: sendViaApi,
      };

      const res = await fetch('/api/inventory/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save purchase order');
      }

      if (sendViaApi) {
        if (data.whatsapp_dispatched) {
          toast.success(`PO #${data.purchase_order?.po_number} created and sent via WhatsApp API!`);
        } else {
          toast.warning(
            `PO #${data.purchase_order?.po_number} saved! (Direct API delivery skipped; open in WhatsApp to send).`,
          );
        }
      } else {
        toast.success(`Purchase Order #${data.purchase_order?.po_number} saved to history!`);
      }

      onClearAll();
      setIsOpen(false);
      onOrderSaved?.();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creating purchase order');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  if (itemsList.length === 0) return null;

  return (
    <>
      {/* 1. STICKY BOTTOM FLOATING BAR */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-4xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-primary/30 bg-card/95 p-3.5 shadow-2xl backdrop-blur-md dark:bg-zinc-950/95">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {itemsList.length} {itemsList.length === 1 ? 'Part' : 'Parts'} Selected
                </span>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  {totalUnits} units
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Est. Restock Cost:{' '}
                <span className="font-semibold text-foreground font-mono">
                  {formatCurrency(totalCost)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-xs text-muted-foreground hover:text-destructive h-9"
            >
              Clear List
            </Button>

            <Button
              size="sm"
              onClick={() => setIsOpen(true)}
              className="gap-2 text-xs font-semibold h-9 shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Send className="size-3.5" />
              Review &amp; Send Order
            </Button>
          </div>
        </div>
      </div>

      {/* 2. FULL PURCHASE ORDER DRAWER / MODAL */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Truck className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-foreground">
                  Wholesaler / Distributor Purchase Order (PO)
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Generate a clean restock purchase order for your auto parts distributor and send directly via WhatsApp.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Distributor Selection Card */}
            <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Truck className="size-3.5 text-primary" />
                  Select Distributor / Wholesaler
                </Label>
                {onOpenSuppliersManager && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenSuppliersManager();
                    }}
                    className="h-6 text-[11px] text-primary hover:underline px-1"
                  >
                    + Manage Directory
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <Select
                    value={selectedSupplierId}
                    onValueChange={handleSelectSupplier}
                  >
                    <SelectTrigger className="text-xs bg-card">
                      <SelectValue placeholder={loadingSuppliers ? "Loading distributors..." : "Choose distributor..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.firm_name} ({s.brand_specialty?.slice(0, 2).join(', ') || 'General'})
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs text-primary font-medium">
                        + Enter Other Wholesaler
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-1">
                  <Input
                    placeholder="Distributor Firm Name"
                    value={customSupplierName}
                    onChange={(e) => setCustomSupplierName(e.target.value)}
                    className="text-xs bg-card"
                    required
                  />
                </div>

                <div className="sm:col-span-1">
                  <Input
                    placeholder="WhatsApp (+91...)"
                    value={customSupplierPhone}
                    onChange={(e) => setCustomSupplierPhone(e.target.value)}
                    className="text-xs font-mono bg-card"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">
                  Order Items ({itemsList.length} parts • {totalUnits} total units)
                </h4>
                <span className="text-xs font-mono font-bold text-foreground">
                  Est. Total: {formatCurrency(totalCost)}
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="h-8">
                      <TableHead className="text-xs py-1">Part Details</TableHead>
                      <TableHead className="text-xs py-1 text-right">Cost (₹)</TableHead>
                      <TableHead className="text-xs py-1 text-center w-32">Order Qty</TableHead>
                      <TableHead className="text-xs py-1 text-right">Line Total</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsList.map((item) => {
                      const lineTotal = (item.cost_price || 0) * (item.quantity || 1);
                      return (
                        <TableRow key={item.part_id} className="h-10 hover:bg-muted/20">
                          <TableCell className="py-1.5 text-xs">
                            <div className="font-medium text-foreground truncate max-w-[240px]">
                              {item.part_name}
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground">
                              SKU: {item.sku} {item.oem_number ? `• OEM: ${item.oem_number}` : ''}
                            </div>
                          </TableCell>

                          <TableCell className="py-1.5 text-right text-xs font-mono">
                            {formatCurrency(item.cost_price)}
                          </TableCell>

                          <TableCell className="py-1.5 text-center">
                            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  onUpdateQuantity(
                                    item.part_id,
                                    Math.max(1, item.quantity - 5),
                                  )
                                }
                                className="size-6 p-0 text-muted-foreground hover:text-foreground"
                              >
                                <Minus className="size-3" />
                              </Button>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  onUpdateQuantity(
                                    item.part_id,
                                    Math.max(1, parseInt(e.target.value, 10) || 1),
                                  )
                                }
                                className="h-6 w-14 p-0 text-center font-mono text-xs border-0 bg-transparent"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  onUpdateQuantity(item.part_id, item.quantity + 5)
                                }
                                className="size-6 p-0 text-muted-foreground hover:text-foreground"
                              >
                                <Plus className="size-3" />
                              </Button>
                            </div>
                          </TableCell>

                          <TableCell className="py-1.5 text-right text-xs font-mono font-medium text-foreground">
                            {formatCurrency(lineTotal)}
                          </TableCell>

                          <TableCell className="py-1.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onRemoveItem(item.part_id)}
                              className="size-7 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Optional Notes */}
            <div className="space-y-1">
              <Label htmlFor="poNotes" className="text-xs">
                Order Notes / Special Instructions
              </Label>
              <Input
                id="poNotes"
                placeholder="e.g. Urgent requirement; please dispatch by courier today"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs bg-card"
              />
            </div>

            {/* Live WhatsApp Message Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MessageCircle className="size-3.5 text-emerald-500" />
                  Live WhatsApp Purchase Order Preview
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyText}
                  className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="size-3" />
                  Copy Text
                </Button>
              </div>
              <pre className="p-3 rounded-lg border border-border bg-muted/40 font-mono text-xs text-foreground whitespace-pre-wrap max-h-36 overflow-y-auto">
                {whatsappMessageText}
              </pre>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleOpenWhatsAppWeb}
              disabled={submitting}
              className="gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
            >
              <ExternalLink className="size-3.5" />
              Open in WhatsApp Web
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => handleSavePO(true)}
              disabled={submitting}
              className="gap-1.5 bg-primary text-primary-foreground font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Sending Order...
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  Send via WhatsApp API
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
