'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Bike,
  Package,
  CheckCircle2,
  Clock,
  Loader2,
  User,
  MapPin,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

export type DeliveryStatusOption =
  | 'Confirmed'
  | 'Packed / Ready'
  | 'Out for Delivery (Local Rider)'
  | 'Delivered';

export interface LocalDeliveryOrderTarget {
  id?: string | null;
  order_id?: string | null;
  reference_id?: string | null;
  referenceId?: string | null;
  orderId?: string | null;
  merchant_transaction_id?: string | null;
  customer_name?: string | null;
  customerName?: string | null;
  customer_phone?: string | null;
  customerPhone?: string | null;
  part_details?: string | null;
  amount?: number | string | null;
  delivery_status?: DeliveryStatusOption | string | null;
  deliveryStatus?: DeliveryStatusOption | string | null;
  rider_name?: string | null;
  riderName?: string | null;
  rider_phone?: string | null;
  riderPhone?: string | null;
  delivery_notes?: string | null;
  deliveryNotes?: string | null;
}

interface LocalDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: LocalDeliveryOrderTarget | null;
  onSuccess?: (updated: {
    orderId: string;
    deliveryStatus: DeliveryStatusOption;
    riderName?: string;
    riderPhone?: string;
    deliveryNotes?: string;
  }) => void;
}

const COMMON_RIDERS = [
  { name: 'Mohd Sameer', phone: '+91 98971 23456' },
  { name: 'Arshad Khan', phone: '+91 97612 24004' },
  { name: 'Vipin Kumar', phone: '+91 96347 22174' },
  { name: 'Store Express Delivery', phone: '+91 96347 22174' },
];

function extractOrderDetails(order: LocalDeliveryOrderTarget | null | undefined) {
  if (!order) {
    return {
      orderId: '',
      customerName: 'Customer',
      customerPhone: '',
      partDetails: 'Motorcycle Spare Parts',
      amount: 0,
      deliveryStatus: 'Confirmed' as DeliveryStatusOption,
      riderName: '',
      riderPhone: '',
      deliveryNotes: '',
    };
  }

  const rawOrderId =
    order.order_id ||
    order.orderId ||
    order.reference_id ||
    order.referenceId ||
    order.merchant_transaction_id ||
    order.id ||
    '';

  const customerName =
    order.customer_name || order.customerName || 'Customer';

  const customerPhone =
    order.customer_phone || order.customerPhone || '';

  const partDetails =
    order.part_details || 'Motorcycle Spare Parts';

  const rawAmount = order.amount;
  const numAmount =
    typeof rawAmount === 'number' && !isNaN(rawAmount)
      ? rawAmount
      : Number(rawAmount) || 0;

  const rawStatus = (order.delivery_status || order.deliveryStatus || 'Confirmed') as string;
  let deliveryStatus: DeliveryStatusOption = 'Confirmed';
  if (rawStatus === 'Packed / Ready') {
    deliveryStatus = 'Packed / Ready';
  } else if (rawStatus.includes('Out for Delivery')) {
    deliveryStatus = 'Out for Delivery (Local Rider)';
  } else if (rawStatus === 'Delivered') {
    deliveryStatus = 'Delivered';
  }

  const riderName = order.rider_name || order.riderName || '';
  const riderPhone = order.rider_phone || order.riderPhone || '';
  const deliveryNotes = order.delivery_notes || order.deliveryNotes || '';

  return {
    orderId: String(rawOrderId).trim(),
    customerName: String(customerName).trim(),
    customerPhone: String(customerPhone).trim(),
    partDetails: String(partDetails).trim(),
    amount: numAmount,
    deliveryStatus,
    riderName: String(riderName).trim(),
    riderPhone: String(riderPhone).trim(),
    deliveryNotes: String(deliveryNotes).trim(),
  };
}

function generatePreviewMessage(args: {
  deliveryStatus: DeliveryStatusOption;
  displayOrderId: string;
  customerName: string;
  riderName: string;
  riderPhone: string;
}): string | null {
  const { deliveryStatus, displayOrderId, customerName, riderName, riderPhone } = args;
  const custName = customerName || 'Customer';
  const cleanRider = (riderName || '').trim() || 'Store Delivery Executive';
  const cleanPhone = (riderPhone || '').trim() || '+91 96347 22174';

  if (deliveryStatus === 'Out for Delivery (Local Rider)') {
    return (
      `🛵 *OUT FOR DELIVERY — ORDER ${displayOrderId}* 📦\n` +
      `Hello ${custName}! Your auto parts order is packed and now *Out for Delivery* with our Local Rider.\n\n` +
      `📦 *Delivery Order ID:* *${displayOrderId}*\n` +
      `👤 *Local Rider Name:* *${cleanRider}*\n` +
      `📞 *Rider Mobile Number:* *${cleanPhone}*\n` +
      `📍 *Destination:* Kailashpur / Saharanpur Local Area\n\n` +
      `Please keep your phone reachable. Our rider will contact you upon arriving at your location.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Best Auto Parts:* Kailashpur, Saharanpur, UP 247001\n` +
      `📞 *Customer Care:* Saud Khan (+91 96347 22174)`
    );
  }

  if (deliveryStatus === 'Delivered') {
    let timeStr = 'Just now';
    try {
      timeStr = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      timeStr = 'Just now';
    }

    return (
      `✅ *ORDER DELIVERED — ORDER ${displayOrderId}* 🏍️\n` +
      `Dear ${custName}, your spare parts order has been successfully delivered by our local rider!\n\n` +
      `📦 *Delivery Order ID:* *${displayOrderId}*\n` +
      `👤 *Delivered By:* *${cleanRider}*\n` +
      `📞 *Rider Contact:* *${cleanPhone}*\n` +
      `🕒 *Delivered At:* ${timeStr}\n\n` +
      `Thank you for trusting Best Auto Parts for your two-wheeler spare parts!\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Best Auto Parts:* Kailashpur, Saharanpur, UP 247001\n` +
      `📞 *Direct Helpline:* Saud Khan (+91 96347 22174)`
    );
  }

  return null;
}

export function LocalDeliveryDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
}: LocalDeliveryDialogProps) {
  // ALL hooks called unconditionally at the very top
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusOption>('Confirmed');
  const [customOrderId, setCustomOrderId] = useState('');
  const [customCustomerName, setCustomCustomerName] = useState('');
  const [customCustomerPhone, setCustomCustomerPhone] = useState('');
  const [customPartDetails, setCustomPartDetails] = useState('');
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Sync state whenever selected order changes
  useEffect(() => {
    if (order) {
      const details = extractOrderDetails(order);
      setDeliveryStatus(details.deliveryStatus);
      setCustomOrderId(details.orderId);
      setCustomCustomerName(details.customerName);
      setCustomCustomerPhone(details.customerPhone);
      setCustomPartDetails(details.partDetails);
      setRiderName(details.riderName);
      setRiderPhone(details.riderPhone);
      setDeliveryNotes(details.deliveryNotes);
      setNotifyCustomer(true);
    } else {
      setDeliveryStatus('Confirmed');
      setCustomOrderId('');
      setCustomCustomerName('');
      setCustomCustomerPhone('');
      setCustomPartDetails('');
      setRiderName('');
      setRiderPhone('');
      setDeliveryNotes('');
      setNotifyCustomer(true);
    }
  }, [order]);

  // Lookup order details if customOrderId changed in blank mode
  const handleLookupOrder = async (idToLook: string) => {
    const clean = (idToLook || '').trim().replace(/^#/, '');
    if (!clean) return;
    setLookingUp(true);
    try {
      const res = await fetch(`/api/orders/delivery-status?orderId=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.customerName) setCustomCustomerName(String(data.customerName));
          if (data.customerPhone) setCustomCustomerPhone(String(data.customerPhone));
          if (data.deliveryStatus) {
            const raw = String(data.deliveryStatus);
            if (raw === 'Packed / Ready') setDeliveryStatus('Packed / Ready');
            else if (raw.includes('Out for Delivery')) setDeliveryStatus('Out for Delivery (Local Rider)');
            else if (raw === 'Delivered') setDeliveryStatus('Delivered');
            else setDeliveryStatus('Confirmed');
          }
          if (data.riderName) setRiderName(String(data.riderName));
          if (data.riderPhone) setRiderPhone(String(data.riderPhone));
          if (data.deliveryNotes) setDeliveryNotes(String(data.deliveryNotes));
          toast.info(`Loaded details for Order #${clean}`);
        }
      }
    } catch {
      // safe fallback
    } finally {
      setLookingUp(false);
    }
  };

  const details = extractOrderDetails(order);
  const effectiveOrderId = (customOrderId || details.orderId || 'ORDER').trim();
  const displayOrderId = effectiveOrderId.startsWith('#') ? effectiveOrderId : `#${effectiveOrderId}`;
  const effectiveCustName = (customCustomerName || details.customerName || 'Customer').trim();
  const effectiveCustPhone = (customCustomerPhone || details.customerPhone || '').trim();
  const effectiveParts = (customPartDetails || details.partDetails || 'Motorcycle Spare Parts').trim();

  // Compute preview message cleanly without hook dependencies
  const previewMessage = generatePreviewMessage({
    deliveryStatus,
    displayOrderId,
    customerName: effectiveCustName,
    riderName,
    riderPhone,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetOrderId = (customOrderId || details.orderId || '').trim();
    if (!targetOrderId) {
      toast.error('Please specify a Delivery Order ID');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders/delivery-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetOrderId,
          deliveryStatus,
          riderName: (riderName || '').trim(),
          riderPhone: (riderPhone || '').trim(),
          deliveryNotes: (deliveryNotes || '').trim(),
          customerPhone: effectiveCustPhone,
          customerName: effectiveCustName,
          notifyCustomer,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update delivery status');
      }

      toast.success(
        `Delivery status updated to "${deliveryStatus}" for ${displayOrderId}!${
          data.whatsappSent ? ' WhatsApp alert sent to customer.' : ''
        }`
      );

      if (onSuccess) {
        onSuccess({
          orderId: targetOrderId,
          deliveryStatus,
          riderName: (riderName || '').trim(),
          riderPhone: (riderPhone || '').trim(),
          deliveryNotes: (deliveryNotes || '').trim(),
        });
      }

      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update delivery';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Radix Dialog handles visibility via open prop cleanly
  return (
    <Dialog open={Boolean(open && order)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Bike className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Local Rider Delivery Assignment
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Manage local delivery dispatch across Kailashpur &amp; Saharanpur
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">
              {displayOrderId}
            </Badge>
          </div>
        </DialogHeader>

        {/* Order Details Card */}
        {!details.orderId ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="customOrderId" className="text-[11px] font-semibold">
                  Delivery Order ID (e.g. ORD-CAT-...)
                </Label>
                <div className="relative">
                  <Input
                    id="customOrderId"
                    placeholder="ORD-CAT-..."
                    value={customOrderId}
                    onChange={(e) => setCustomOrderId(e.target.value)}
                    onBlur={(e) => handleLookupOrder(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  {lookingUp && (
                    <Loader2 className="absolute right-2 top-2 size-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="customCustomerPhone" className="text-[11px] font-semibold">
                  Customer Mobile Number
                </Label>
                <Input
                  id="customCustomerPhone"
                  placeholder="+91 XXXXX XXXXX"
                  value={customCustomerPhone}
                  onChange={(e) => setCustomCustomerPhone(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="size-3 text-emerald-600 dark:text-emerald-400" />
              <span>Best Auto Parts, Kailashpur, Saharanpur, UP 247001</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <User className="size-3.5 text-muted-foreground" />
                <span>{effectiveCustName}</span>
                {effectiveCustPhone && (
                  <span className="text-muted-foreground font-mono">({effectiveCustPhone})</span>
                )}
              </div>
              {details.amount > 0 ? (
                <span className="font-bold text-foreground">
                  {formatCurrency(details.amount)}
                </span>
              ) : null}
            </div>
            <div className="text-muted-foreground truncate" title={effectiveParts}>
              📦 {effectiveParts}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="size-3 text-emerald-600 dark:text-emerald-400" />
              <span>Kailashpur, Saharanpur, UP 247001 (Best Auto Parts Store)</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Delivery Status Option */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Delivery Lifecycle Status</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDeliveryStatus('Confirmed')}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer',
                  deliveryStatus === 'Confirmed'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold ring-1 ring-blue-500'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                )}
              >
                <Clock className="size-4 shrink-0" />
                <div className="flex flex-col">
                  <span>Confirmed</span>
                  <span className="text-[10px] opacity-75">Order recorded</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryStatus('Packed / Ready')}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer',
                  deliveryStatus === 'Packed / Ready'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold ring-1 ring-amber-500'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                )}
              >
                <Package className="size-4 shrink-0" />
                <div className="flex flex-col">
                  <span>Packed / Ready</span>
                  <span className="text-[10px] opacity-75">Ready for pickup</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryStatus('Out for Delivery (Local Rider)')}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer',
                  deliveryStatus === 'Out for Delivery (Local Rider)'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-semibold ring-1 ring-indigo-500'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                )}
              >
                <Bike className="size-4 shrink-0" />
                <div className="flex flex-col">
                  <span>Out for Delivery</span>
                  <span className="text-[10px] opacity-75">With local rider</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryStatus('Delivered')}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer',
                  deliveryStatus === 'Delivered'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold ring-1 ring-emerald-500'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                )}
              >
                <CheckCircle2 className="size-4 shrink-0" />
                <div className="flex flex-col">
                  <span>Delivered</span>
                  <span className="text-[10px] opacity-75">Handed to buyer</span>
                </div>
              </button>
            </div>
          </div>

          {/* Local Rider Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="riderName" className="text-xs font-semibold">
                Local Rider Name
              </Label>
              <Input
                id="riderName"
                placeholder="e.g. Mohd Sameer"
                value={riderName}
                onChange={(e) => setRiderName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="riderPhone" className="text-xs font-semibold">
                Rider Mobile Number
              </Label>
              <Input
                id="riderPhone"
                placeholder="e.g. +91 98971 23456"
                value={riderPhone}
                onChange={(e) => setRiderPhone(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Quick Rider Selection Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground">Quick Select:</span>
            {COMMON_RIDERS.map((r) => (
              <button
                key={r.name}
                type="button"
                onClick={() => {
                  setRiderName(r.name);
                  setRiderPhone(r.phone);
                }}
                className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer"
              >
                {r.name}
              </button>
            ))}
          </div>

          {/* Delivery Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="deliveryNotes" className="text-xs font-semibold">
              Delivery Notes / Destination Landmark (Optional)
            </Label>
            <Input
              id="deliveryNotes"
              placeholder="e.g. Near Kailashpur Bridge, Delivery on Splendor Plus"
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {/* WhatsApp Notification Checkbox & Preview */}
          {(deliveryStatus === 'Out for Delivery (Local Rider)' ||
            deliveryStatus === 'Delivered') && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                  className="rounded border-border text-emerald-600 focus:ring-emerald-500 size-4"
                />
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  Send real-time WhatsApp delivery alert to {effectiveCustPhone || 'customer'}
                </span>
              </label>

              {notifyCustomer && previewMessage && (
                <div className="rounded-md bg-background/80 border border-border p-2.5 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-36 overflow-y-auto">
                  {previewMessage}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Updating Delivery...
                </>
              ) : (
                <>
                  <Bike className="size-3.5" />
                  Save Delivery Status
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
