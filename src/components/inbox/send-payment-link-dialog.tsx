"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
  customerName = "",
  customerPhone = "",
  conversationId,
  onSendPaymentMessage,
}: SendPaymentLinkDialogProps) {
  const [partDetails, setPartDetails] = useState("");
  const [amount, setAmount] = useState("");
  const [orderId, setOrderId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // Sync / reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(customerName || "");
      setPhone(customerPhone || "");
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      setOrderId(`ORD-${randSuffix}`);
      setPartDetails("");
      setAmount("");
    }
  }, [open, customerName, customerPhone]);

  const handleGenerateAndSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPart = partDetails.trim();
    if (!cleanPart) {
      toast.error("Please enter the part or item name.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid amount greater than ₹0.");
      return;
    }

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      toast.error("Please enter a valid customer phone number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/payments/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        throw new Error(data.error || "Failed to generate payment link");
      }

      const formattedMessage =
        `*Payment Request — Best Auto Parts* 🚗\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Customer: ${name.trim() || "Customer"}\n` +
        `• Item: ${cleanPart}\n` +
        `• Order ID: #${data.orderId || orderId}\n` +
        `• Amount Due: ₹${numAmount.toFixed(2)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👉 *Pay securely here:* ${data.paymentLink}\n\n` +
        `⚡ Supports UPI (Google Pay, PhonePe, Paytm), Debit/Credit Cards & Net Banking.\n` +
        `Thank you for choosing Best Auto Parts!`;

      onSendPaymentMessage(formattedMessage);
      toast.success("Payment link generated and sent to chat!");
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate payment link";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Send PhonePe Payment Link</DialogTitle>
              <DialogDescription>
                Create a secure payment link and send it directly into this WhatsApp chat.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleGenerateAndSend} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="partDetails" className="text-xs font-medium">
              Part / Item Details <span className="text-destructive">*</span>
            </Label>
            <Input
              id="partDetails"
              placeholder="e.g. Hero Splendor Chain Sprocket Kit"
              value={partDetails}
              onChange={(e) => setPartDetails(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs font-medium">
                Amount (₹) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">₹</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="650"
                  className="pl-7"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="orderId" className="text-xs font-medium">
                Order ID
              </Label>
              <Input
                id="orderId"
                placeholder="ORD-1001"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customerName" className="text-xs font-medium">
                Customer Name
              </Label>
              <Input
                id="customerName"
                placeholder="Customer Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customerPhone" className="text-xs font-medium">
                Customer Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customerPhone"
                placeholder="+919634722174"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> PhonePe Checkout Integration
            </p>
            <p className="mt-1">
              Generates a short link (<code>/pay/BAP_...</code>). When the customer pays via UPI or card, the CRM webhook automatically confirms the order in WhatsApp!
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !partDetails.trim() || !amount || !phone.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Payment Link
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
