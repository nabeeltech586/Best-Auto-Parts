'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Send, Sparkles, Search, PackageCheck, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import type { PartCatalogItem } from '@/types/inventory';

interface SendPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName?: string;
  customerPhone?: string;
  conversationId?: string;
  onSendPaymentMessage: (formattedMessage: string) => void;
}

export function SendPaymentLinkDialog({
  open,
  onOpenChange,
  customerName = '',
  customerPhone = '',
  conversationId,
  onSendPaymentMessage,
}: SendPaymentLinkDialogProps) {
  const [partSearch, setPartSearch] = useState('');
  const [searchingParts, setSearchingParts] = useState(false);
  const [partResults, setPartResults] = useState<PartCatalogItem[]>([]);
  const [selectedPart, setSelectedPart] = useState<PartCatalogItem | null>(null);

  const [partDetails, setPartDetails] = useState('');
  const [amount, setAmount] = useState('');
  const [orderId, setOrderId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync / reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(customerName || '');
      setPhone(customerPhone || '');
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      setOrderId(`ORD-${randSuffix}`);
      setPartDetails('');
      setAmount('');
      setPartSearch('');
      setPartResults([]);
      setSelectedPart(null);
    }
  }, [open, customerName, customerPhone]);

  // Live parts catalog search
  useEffect(() => {
    if (!partSearch.trim()) {
      setPartResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingParts(true);
        const res = await fetch(`/api/inventory/parts?search=${encodeURIComponent(partSearch.trim())}&pageSize=5`);
        if (res.ok) {
          const data = await res.json();
          setPartResults(data.parts || data.items || []);
        }
      } catch {
        // ignore
      } finally {
        setSearchingParts(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [partSearch]);

  const handleSelectPart = (part: PartCatalogItem) => {
    setSelectedPart(part);
    const oemStr = part.oem_number ? ` (OEM: ${part.oem_number})` : '';
    const brandStr = part.brand ? ` [${part.brand}]` : '';
    setPartDetails(`${part.part_name}${oemStr}${brandStr}`);
    setAmount(String(part.selling_price || '0.00'));
    setPartResults([]);
    setPartSearch('');
  };

  // 1. Send English Part Quote Only
  const handleSendQuoteOnly = () => {
    const cleanPart = partDetails.trim();
    if (!cleanPart) {
      toast.error('Please enter or select a spare part.');
      return;
    }

    const numAmount = parseFloat(amount);
    const priceStr = !isNaN(numAmount) && numAmount > 0 ? formatCurrency(numAmount) : 'Contact for best price';
    const oemLine = selectedPart?.oem_number ? `• OEM Number: ${selectedPart.oem_number}\n` : '';
    const brandLine = selectedPart?.brand ? `• Brand: ${selectedPart.brand} (${selectedPart.condition || 'Genuine'})\n` : '';
    const stockStatus = (selectedPart?.quantity_in_stock ?? 1) > 0 ? 'In Stock ✅' : 'Available on order 📦';

    const quoteMessage =
      `*Spare Part Quote — Best Auto Parts* 🏍️\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• Part: ${cleanPart}\n` +
      brandLine +
      oemLine +
      `• Price: ${priceStr}\n` +
      `• Availability: ${stockStatus}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 Store: Kailashpur, Saharanpur, UP 247001\n` +
      `📞 Contact: Saud Bhai (+91 96347 22174)\n\n` +
      `Reply here to confirm your order or request a secure PhonePe payment link.`;

    onSendPaymentMessage(quoteMessage);
    toast.success('English part quote sent to chat!');
    onOpenChange(false);
  };

  // 2. Generate and Send PhonePe Payment Link
  const handleGenerateAndSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPart = partDetails.trim();
    if (!cleanPart) {
      toast.error('Please enter the part or item name.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount greater than ₹0.');
      return;
    }

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      toast.error('Please enter a valid customer phone number.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderId.trim() || `ORD-${Date.now().toString(36).toUpperCase().slice(-5)}`,
          customerName: name.trim() || undefined,
          customerPhone: cleanPhone,
          partDetails: cleanPart,
          amount: numAmount,
          conversationId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.paymentLink) {
        throw new Error(data.error || 'Failed to generate payment link');
      }

      const formattedMessage =
        `*Payment Request — Best Auto Parts* 🏍️\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Customer: ${name.trim() || 'Customer'}\n` +
        `• Item: ${cleanPart}\n` +
        `• Order ID: #${data.orderId || orderId}\n` +
        `• Amount Due: ${formatCurrency(numAmount)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👉 *Pay securely here:* ${data.paymentLink}\n\n` +
        `⚡ Supports UPI (Google Pay, PhonePe, Paytm), Debit/Credit Cards & Net Banking.\n` +
        `Thank you for choosing Best Auto Parts!`;

      onSendPaymentMessage(formattedMessage);
      toast.success('Payment link generated and sent to chat!');
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate payment link';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Quick Part Quote & PhonePe Pay Link</DialogTitle>
              <DialogDescription className="text-xs">
                Search live inventory catalog, quote verified price, or dispatch a PhonePe link into chat.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Catalog Search Bar */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Search className="size-3.5 text-primary" />
            Live Inventory Catalog Search
          </Label>
          <div className="relative">
            <Input
              placeholder="Search by part name, bike model (Pulsar, Splendor), or OEM #..."
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              className="text-xs bg-background pr-8"
            />
            {searchingParts && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search Results Dropdown */}
          {partResults.length > 0 && (
            <div className="rounded-md border border-border bg-card shadow-md divide-y divide-border overflow-hidden">
              {partResults.map((part) => (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => handleSelectPart(part)}
                  className="w-full text-left p-2.5 hover:bg-muted transition-colors flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="font-semibold text-foreground truncate">{part.part_name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      {part.brand && <span>{part.brand}</span>}
                      {part.oem_number && <span>• OEM: {part.oem_number}</span>}
                      <span className={part.quantity_in_stock > 0 ? 'text-emerald-500' : 'text-red-400'}>
                        • {part.quantity_in_stock > 0 ? `In Stock (${part.quantity_in_stock})` : 'Out of Stock'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-foreground">{formatCurrency(part.selling_price || 0)}</span>
                    <Badge variant="outline" className="block text-[9px] mt-0.5 border-emerald-500/40 text-emerald-600">
                      Select
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedPart && (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded p-2 text-xs">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium truncate">
                Selected: {selectedPart.part_name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPart(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground shrink-0 underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleGenerateAndSend} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label htmlFor="partDetails" className="text-xs font-medium">
              Part / Item Details <span className="text-destructive">*</span>
            </Label>
            <Input
              id="partDetails"
              placeholder="e.g. Bajaj Pulsar 150 Clutch Plate"
              value={partDetails}
              onChange={(e) => setPartDetails(e.target.value)}
              className="text-xs bg-card"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="amount" className="text-xs font-medium">
                Selling Price (₹) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-6 text-xs font-semibold bg-card font-mono"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="orderId" className="text-xs font-medium">
                Order ID
              </Label>
              <Input
                id="orderId"
                placeholder="ORD-1001"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="text-xs bg-card font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="customerName" className="text-xs font-medium">
                Customer Name
              </Label>
              <Input
                id="customerName"
                placeholder="Ramesh Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs bg-card"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="customerPhone" className="text-xs font-medium">
                WhatsApp Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customerPhone"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-xs bg-card font-mono"
                required
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSendQuoteOnly}
              className="text-xs gap-1.5"
            >
              <FileText className="size-3.5 text-blue-500" />
              Send Quote Only
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send Quote & PhonePe Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
