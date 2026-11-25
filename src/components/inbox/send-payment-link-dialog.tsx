'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import {
  Loader2,
  CreditCard,
  Send,
  Search,
  FileText,
  ChevronDown,
  User,
  Wrench,
  Building2,
  Package,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import type { PartCatalogItem } from '@/types/inventory';

export interface SelectedCartItem {
  id: string;
  name: string;
  bikeModel?: string;
  brand?: string;
  unitPrice: number;
  quantity: number;
}

interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  category?: string | null;
  company?: string | null;
  tags?: string[] | null;
}

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
  // Multi-Item Cart State
  const [selectedItems, setSelectedItems] = useState<SelectedCartItem[]>([]);

  // Inventory Catalog Dropdown States
  const [partSearch, setPartSearch] = useState('');
  const [searchingParts, setSearchingParts] = useState(false);
  const [partResults, setPartResults] = useState<PartCatalogItem[]>([]);
  const [showPartDropdown, setShowPartDropdown] = useState(false);

  // CRM Contacts Dropdown States
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Form Fields
  const [partDetails, setPartDetails] = useState('');
  const [amount, setAmount] = useState('');
  const [orderId, setOrderId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);

  const catalogDropdownRef = useRef<HTMLDivElement>(null);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  // Helper to format part name with bike model / fitment
  const formatPartWithModel = useCallback((part: PartCatalogItem): string => {
    const fitment =
      part.fitments && part.fitments.length > 0
        ? `${part.fitments[0].manufacturer || ''} ${part.fitments[0].model || ''}`.trim()
        : part.brand || '';

    if (fitment && !part.part_name.toLowerCase().includes(fitment.toLowerCase())) {
      return `${part.part_name} (${fitment})`;
    }
    return part.part_name;
  }, []);

  // Sync form inputs with the cart array
  const syncFormFieldsWithCart = useCallback((items: SelectedCartItem[]) => {
    if (items.length === 0) {
      setPartDetails('');
      setAmount('');
      return;
    }

    const lines = items.map((item, idx) => {
      const modelStr = item.bikeModel ? ` (${item.bikeModel})` : '';
      return `${idx + 1}. ${item.name}${modelStr} (x${item.quantity}) — ${formatCurrency(
        item.unitPrice * item.quantity
      )}`;
    });

    setPartDetails(lines.join('\n'));

    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    setAmount(total > 0 ? String(total) : '');
  }, []);

  // Fetch initial parts catalog
  const loadInitialParts = useCallback(async () => {
    try {
      setSearchingParts(true);
      const res = await fetch('/api/inventory/parts?pageSize=20');
      if (res.ok) {
        const data = await res.json();
        setPartResults(data.parts || data.items || []);
      }
    } catch {
      // ignore
    } finally {
      setSearchingParts(false);
    }
  }, []);

  // Fetch CRM contacts
  const loadContacts = useCallback(async () => {
    try {
      setLoadingContacts(true);
      const res = await fetch('/api/contacts?limit=60');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  // Sync / reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(customerName || '');
      setPhone(customerPhone || '');
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      setOrderId(`ORD-${randSuffix}`);
      setSelectedItems([]);
      setPartDetails('');
      setAmount('');
      setPartSearch('');
      setShowPartDropdown(false);
      setShowContactDropdown(false);

      loadInitialParts();
      loadContacts();
    }
  }, [open, customerName, customerPhone, loadInitialParts, loadContacts]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (catalogDropdownRef.current && !catalogDropdownRef.current.contains(target)) {
        setShowPartDropdown(false);
      }
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(target)) {
        setShowContactDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live parts catalog search debounced
  useEffect(() => {
    if (!open) return;
    if (!partSearch.trim()) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingParts(true);
        const res = await fetch(
          `/api/inventory/parts?search=${encodeURIComponent(partSearch.trim())}&pageSize=25`
        );
        if (res.ok) {
          const data = await res.json();
          setPartResults(data.parts || data.items || []);
          setShowPartDropdown(true);
        }
      } catch {
        // ignore
      } finally {
        setSearchingParts(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [partSearch, open]);

  // Multi-Item Add / Increment Handler
  const handleSelectPart = (part: PartCatalogItem) => {
    const bikeModel =
      part.fitments && part.fitments.length > 0
        ? `${part.fitments[0].manufacturer || ''} ${part.fitments[0].model || ''}`.trim()
        : part.brand || '';

    const unitPrice = Number(part.selling_price) || 0;

    setSelectedItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.id === part.id);
      let updated: SelectedCartItem[];
      if (existingIdx >= 0) {
        updated = prev.map((item, idx) =>
          idx === existingIdx ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        updated = [
          ...prev,
          {
            id: part.id,
            name: part.part_name,
            bikeModel: bikeModel || undefined,
            brand: part.brand || undefined,
            unitPrice,
            quantity: 1,
          },
        ];
      }
      syncFormFieldsWithCart(updated);
      return updated;
    });

    setShowPartDropdown(false);
    setPartSearch(''); // Clears search query immediately so next part can be typed
  };

  // Quantity Stepper Handlers
  const handleUpdateQuantity = (id: string, delta: number) => {
    setSelectedItems((prev) => {
      const updated = prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is SelectedCartItem => item !== null);

      syncFormFieldsWithCart(updated);
      return updated;
    });
  };

  const handleUpdateUnitPrice = (id: string, newPrice: number) => {
    setSelectedItems((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, unitPrice: Math.max(0, newPrice) } : item
      );
      syncFormFieldsWithCart(updated);
      return updated;
    });
  };

  const handleRemoveItem = (id: string) => {
    setSelectedItems((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      syncFormFieldsWithCart(updated);
      return updated;
    });
  };

  const handleClearAll = () => {
    setSelectedItems([]);
    setPartDetails('');
    setAmount('');
  };

  // Calculate Cart Grand Total
  const cartGrandTotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [selectedItems]);

  // Filtered contacts list
  const filteredContacts = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) {
      return contacts.slice(0, 20);
    }
    return contacts
      .filter((c) => {
        const matchName = c.name?.toLowerCase().includes(q);
        const matchPhone = c.phone?.toLowerCase().includes(q);
        const matchCompany = c.company?.toLowerCase().includes(q);
        const matchCategory = c.category?.toLowerCase().includes(q);
        return matchName || matchPhone || matchCompany || matchCategory;
      })
      .slice(0, 20);
  }, [contacts, name]);

  // Select contact from dropdown
  const handleSelectContact = (contact: ContactItem) => {
    setName(contact.name || '');
    const cleanDigits = contact.phone.replace(/[^0-9]/g, '').slice(-10);
    setPhone(cleanDigits ? `+91 ${cleanDigits}` : contact.phone);
    setShowContactDropdown(false);
  };

  // 1. Send Multi-Item Part Quote Only (Dispatches WhatsApp & Logs in Inbox)
  const handleSendQuoteOnly = async () => {
    const cleanPart = partDetails.trim();
    if (!cleanPart) {
      toast.error('Please enter or select spare parts.');
      return;
    }

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      toast.error('Please enter a valid customer phone number.');
      return;
    }

    const numAmount = parseFloat(amount);
    setSendingQuote(true);

    try {
      const res = await fetch('/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim() || undefined,
          customerPhone: cleanPhone,
          partDetails: cleanPart,
          items: selectedItems.length > 0 ? selectedItems : undefined,
          amount: isNaN(numAmount) ? undefined : numAmount,
          isQuoteOnly: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch WhatsApp quote');
      }

      onSendPaymentMessage(data.formattedMessage || `Part Quote for ${cleanPart}`);
      toast.success('Itemized part quote dispatched via WhatsApp and logged in Inbox!');
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send quote';
      toast.error(message);
    } finally {
      setSendingQuote(false);
    }
  };

  // 2. Generate and Send BestPay Link + Itemized Quote
  const handleGenerateAndSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPart = partDetails.trim();
    if (!cleanPart) {
      toast.error('Please enter or select at least one spare part.');
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
      // Step A: Create the Payment Link and ledger record in Supabase
      const createRes = await fetch('/api/payments/create-link', {
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

      const linkData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !linkData.paymentLink) {
        throw new Error(linkData.error || 'Failed to generate payment link');
      }

      // Step B: Dispatch Quote & BestPay Link via WhatsApp Meta Cloud API and log in CRM
      const quoteRes = await fetch('/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim() || undefined,
          customerPhone: cleanPhone,
          partDetails: cleanPart,
          items: selectedItems.length > 0 ? selectedItems : undefined,
          amount: numAmount,
          orderId: linkData.orderId || orderId,
          paymentLink: linkData.paymentLink,
          isQuoteOnly: false,
        }),
      });

      const quoteData = await quoteRes.json().catch(() => ({}));

      // Step C: Update caller / Inbox / Payments table
      const finalMsg =
        quoteData.formattedMessage ||
        `*Payment Request — Best Auto Parts*\nOrder #${linkData.orderId}: ${linkData.paymentLink}`;
      onSendPaymentMessage(finalMsg);

      toast.success('BestPay link & itemized quote dispatched to WhatsApp!');
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
      <DialogContent className="sm:max-w-xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                BestPay Instant Checkout & Part Quote
              </DialogTitle>
              <DialogDescription className="text-xs">
                Search live catalog, add multiple parts, adjust quantities, and dispatch itemized quote & BestPay link.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 1. Interactive Live Inventory Catalog Search */}
        <div ref={catalogDropdownRef} className="rounded-xl border border-border bg-muted/40 p-3 space-y-2 relative">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Search className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Live Inventory Catalog Search</span>
            </Label>
            <span className="text-[10px] text-muted-foreground">Click part to add to quote</span>
          </div>

          <div className="relative">
            <Input
              placeholder="Search part (Clutch Cable, Brake Shoe, Oil, Pulsar, Splendor, Activa)..."
              value={partSearch}
              onChange={(e) => {
                setPartSearch(e.target.value);
                setShowPartDropdown(true);
              }}
              onFocus={() => setShowPartDropdown(true)}
              onClick={() => setShowPartDropdown(true)}
              className="text-xs bg-background pr-8"
            />
            {searchingParts ? (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={() => setShowPartDropdown((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Toggle Catalog Dropdown"
              >
                <ChevronDown className={`size-3.5 transition-transform duration-200 ${showPartDropdown ? 'rotate-180' : ''}`} />
              </button>
            )}

            {/* High z-index Scrollable Catalog Dropdown */}
            {showPartDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl divide-y divide-border animate-in fade-in zoom-in-95 duration-150">
                {searchingParts ? (
                  <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="size-3.5 animate-spin text-emerald-600" />
                    <span>Searching catalog...</span>
                  </div>
                ) : partResults.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    No matching parts found for "{partSearch}".
                  </div>
                ) : (
                  partResults.map((part) => {
                    const displayName = formatPartWithModel(part);
                    const isLowStock =
                      part.quantity_in_stock > 0 &&
                      part.quantity_in_stock <= (part.low_stock_threshold || 5);
                    const isOutOfStock = part.quantity_in_stock <= 0;

                    const inCartItem = selectedItems.find((i) => i.id === part.id);

                    return (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => handleSelectPart(part)}
                        className="w-full text-left p-2.5 hover:bg-muted/80 active:bg-muted transition-colors flex items-center justify-between text-xs gap-3 cursor-pointer"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                            <Package className="size-3 text-emerald-600 shrink-0" />
                            <span>{displayName}</span>
                            {inCartItem && (
                              <Badge className="text-[9px] px-1 py-0 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                In Cart ({inCartItem.quantity})
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium">{part.brand || 'Genuine'}</span>
                            <span>• SKU: {part.sku}</span>
                            {part.oem_number && <span>• OEM: {part.oem_number}</span>}
                            {isOutOfStock ? (
                              <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                Out of Stock
                              </Badge>
                            ) : isLowStock ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                              >
                                Low Stock ({part.quantity_in_stock})
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-4 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                              >
                                In Stock ({part.quantity_in_stock})
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm block">
                            {formatCurrency(part.selling_price || 0)}
                          </span>
                          <span className="inline-block text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/60 dark:border-emerald-700/60 px-1.5 py-0.5 rounded mt-0.5">
                            {inCartItem ? '+ Add Another' : '+ Add to Quote'}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2. Interactive Multi-Item Cart List UI */}
        {selectedItems.length > 0 && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <ShoppingCart className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Selected Parts ({selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'})
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] text-muted-foreground hover:text-destructive font-medium cursor-pointer transition-colors"
              >
                Clear All
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5 divide-y divide-border/40">
              {selectedItems.map((item) => (
                <div key={item.id} className="pt-2 first:pt-0 flex items-center justify-between gap-2.5 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-semibold text-foreground truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {item.bikeModel || item.brand || 'Genuine Spares'}
                    </p>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-border rounded-lg overflow-hidden bg-background shrink-0 shadow-xs">
                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(item.id, -1)}
                      className="h-6 w-6 flex items-center justify-center hover:bg-muted active:bg-muted/80 text-foreground transition cursor-pointer"
                      title="Decrease quantity"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-6 text-center font-mono font-bold text-xs text-foreground">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(item.id, 1)}
                      className="h-6 w-6 flex items-center justify-center hover:bg-muted active:bg-muted/80 text-foreground transition cursor-pointer"
                      title="Increase quantity"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>

                  {/* Editable Unit Price & Subtotal */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative w-20">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">
                        ₹
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleUpdateUnitPrice(item.id, parseFloat(e.target.value) || 0)}
                        className="h-7 pl-4 pr-1 text-xs font-mono font-semibold text-right bg-background"
                        title="Unit price"
                      />
                    </div>
                    <span className="w-16 text-right font-mono font-bold text-foreground text-xs">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition cursor-pointer"
                      title="Remove part"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Auto-Total Summary Row */}
            <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Auto-Calculated Total:</span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                {formatCurrency(cartGrandTotal)}
              </span>
            </div>
          </div>
        )}

        {/* 3. Main Order & Customer Form */}
        <form onSubmit={handleGenerateAndSend} className="space-y-3 pt-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="partDetails" className="text-xs font-medium">
                Part / Item Details <span className="text-destructive">*</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">Synced from selected parts</span>
            </div>
            <textarea
              id="partDetails"
              rows={selectedItems.length > 1 ? 3 : 2}
              placeholder="e.g. 1. Clutch Cable (x1) — ₹140.00&#10;2. Ignition Switch (x1) — ₹380.00"
              value={partDetails}
              onChange={(e) => setPartDetails(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono leading-relaxed"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="amount" className="text-xs font-medium">
                Selling Price / Grand Total (₹) <span className="text-destructive">*</span>
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
                  className="pl-6 text-xs font-semibold bg-card font-mono text-emerald-600 dark:text-emerald-400"
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

          {/* 4. Interactive Customer & Mechanic Contact Selector */}
          <div className="grid grid-cols-2 gap-3">
            <div ref={contactDropdownRef} className="space-y-1 relative">
              <div className="flex items-center justify-between">
                <Label htmlFor="customerName" className="text-xs font-medium">
                  Customer Name
                </Label>
                <span className="text-[10px] text-muted-foreground">Select saved or type</span>
              </div>
              <div className="relative">
                <Input
                  id="customerName"
                  placeholder="Type name or select..."
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setShowContactDropdown(true);
                  }}
                  onFocus={() => setShowContactDropdown(true)}
                  onClick={() => setShowContactDropdown(true)}
                  className="text-xs bg-card pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowContactDropdown((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer rounded"
                  title="Select Saved Customer / Mechanic"
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform duration-200 ${
                      showContactDropdown ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* High z-index Scrollable Contact Dropdown */}
                {showContactDropdown && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl divide-y divide-border animate-in fade-in zoom-in-95 duration-150">
                    {loadingContacts ? (
                      <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="size-3.5 animate-spin text-emerald-600" />
                        <span>Loading contacts...</span>
                      </div>
                    ) : filteredContacts.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground">
                        No saved contacts found. Type manually for walk-in.
                      </div>
                    ) : (
                      filteredContacts.map((contact) => {
                        const isMechanic =
                          contact.category === 'Mechanic' ||
                          (contact.tags &&
                            contact.tags.some((t: string) =>
                              t.toLowerCase().includes('mechanic')
                            ));
                        const isDistributor =
                          contact.category === 'Distributor' || contact.category === 'Wholesaler';
                        const cleanDigits = contact.phone.replace(/[^0-9]/g, '').slice(-10);
                        const displayPhone = cleanDigits ? `+91 ${cleanDigits}` : contact.phone;

                        return (
                          <button
                            key={contact.id}
                            type="button"
                            onClick={() => handleSelectContact(contact)}
                            className="w-full text-left p-2.5 hover:bg-muted/80 active:bg-muted transition-colors flex items-center justify-between text-xs gap-2 cursor-pointer"
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                                <span>{contact.name || 'Unnamed Contact'}</span>
                                {contact.company && (
                                  <span className="text-[10px] text-muted-foreground font-normal truncate">
                                    ({contact.company})
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono">
                                {displayPhone}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center">
                              {isMechanic ? (
                                <Badge className="text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 flex items-center gap-1">
                                  <Wrench className="size-2.5" />
                                  <span>Mechanic</span>
                                </Badge>
                              ) : isDistributor ? (
                                <Badge className="text-[9px] px-1.5 py-0 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 flex items-center gap-1">
                                  <Building2 className="size-2.5" />
                                  <span>{contact.category}</span>
                                </Badge>
                              ) : (
                                <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                                  <User className="size-2.5" />
                                  <span>Customer</span>
                                </Badge>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="customerPhone" className="text-xs font-medium">
                WhatsApp Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customerPhone"
                placeholder="+91 96347 22174"
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
              disabled={sendingQuote || loading}
              onClick={handleSendQuoteOnly}
              className="text-xs gap-1.5"
            >
              {sendingQuote ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5 text-blue-500" />
              )}
              Send Quote Only
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={loading || sendingQuote}
              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send Quote & BestPay Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
