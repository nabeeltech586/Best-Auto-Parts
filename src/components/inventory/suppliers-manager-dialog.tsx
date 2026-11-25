'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Phone,
  MessageCircle,
  Loader2,
  Building2,
  Check,
} from 'lucide-react';
import type { Supplier, SupplierFormData } from '@/types/inventory';

interface SuppliersManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuppliersUpdated?: () => void;
}

const COMMON_BRANDS = [
  'Hero',
  'Bajaj',
  'Honda',
  'Aftermarket',
  'Genuine OEM',
  'Universal',
];

export function SuppliersManagerDialog({
  open,
  onOpenChange,
  onSuppliersUpdated,
}: SuppliersManagerDialogProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [firmName, setFirmName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch {
      toast.error('Failed to load distributors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchSuppliers();
    }
  }, [open, fetchSuppliers]);

  const resetForm = () => {
    setFirmName('');
    setContactPerson('');
    setWhatsappNumber('');
    setSelectedBrands([]);
    setAddress('');
    setNotes('');
    setShowAddForm(false);
    setEditingSupplier(null);
  };

  const handleStartEdit = (sup: Supplier) => {
    setEditingSupplier(sup);
    setFirmName(sup.firm_name);
    setContactPerson(sup.contact_person || '');
    setWhatsappNumber(sup.whatsapp_number);
    setSelectedBrands(sup.brand_specialty || []);
    setAddress(sup.address || '');
    setNotes(sup.notes || '');
    setShowAddForm(true);
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmName.trim()) {
      toast.error('Firm name is required');
      return;
    }
    if (!whatsappNumber.trim()) {
      toast.error('WhatsApp number is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload: SupplierFormData = {
        firm_name: firmName.trim(),
        contact_person: contactPerson.trim() || undefined,
        whatsapp_number: whatsappNumber.trim(),
        brand_specialty: selectedBrands,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const url = editingSupplier
        ? `/api/inventory/suppliers/${editingSupplier.id}`
        : '/api/inventory/suppliers';
      const method = editingSupplier ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save distributor');
      }

      toast.success(
        editingSupplier
          ? 'Distributor updated successfully'
          : 'Distributor added to directory',
      );
      resetForm();
      fetchSuppliers();
      onSuppliersUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error saving distributor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from distributors?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/inventory/suppliers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Removed ${name}`);
        fetchSuppliers();
        onSuppliersUpdated?.();
      } else {
        toast.error('Failed to remove distributor');
      }
    } catch {
      toast.error('Failed to remove distributor');
    }
  };

  const openWhatsApp = (phone: string, firm: string) => {
    const clean = phone.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `Hello ${firm}, this is Best Auto Parts regarding spare parts inquiry.`,
    );
    window.open(`https://wa.me/${clean}?text=${text}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Truck className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-foreground">
                  Distributors &amp; Wholesalers Directory
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Manage parts suppliers, brand specialties, and direct WhatsApp contact numbers.
                </DialogDescription>
              </div>
            </div>

            {!showAddForm && (
              <Button
                size="sm"
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Add Distributor
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Add / Edit Form */}
        {showAddForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-muted/30 p-4 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                {editingSupplier ? 'Edit Distributor' : 'Add New Distributor / Wholesaler'}
              </h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetForm}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor="firmName" className="text-xs">
                  Firm / Company Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="firmName"
                  placeholder="e.g. Gupta Auto Agencies"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  className="bg-card text-xs"
                  required
                />
              </div>

              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor="contactPerson" className="text-xs">
                  Contact Person
                </Label>
                <Input
                  id="contactPerson"
                  placeholder="e.g. Ramesh Gupta"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="bg-card text-xs"
                />
              </div>

              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor="whatsappNumber" className="text-xs">
                  WhatsApp Number <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="whatsappNumber"
                    placeholder="+91 98765 43210"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    className="bg-card pl-8 text-xs font-mono"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Brand Specialties Tags */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Brand Specialties (Click to select)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_BRANDS.map((brand) => {
                  const isSelected = selectedBrands.includes(brand);
                  return (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => toggleBrand(brand)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors border ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {isSelected && <Check className="size-3" />}
                      {brand}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="address" className="text-xs">
                  Shop / Warehouse Address
                </Label>
                <Input
                  id="address"
                  placeholder="e.g. Shop 14, Auto Market, Saharanpur"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="bg-card text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs">
                  Notes / Payment Terms
                </Label>
                <Input
                  id="notes"
                  placeholder="e.g. Net 15 days, 5% cash discount"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-card text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                {editingSupplier ? 'Update Distributor' : 'Save Distributor'}
              </Button>
            </div>
          </form>
        )}

        {/* Directory Table */}
        <div className="rounded-md border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading suppliers...
            </div>
          ) : suppliers.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No distributors saved yet. Click &quot;Add Distributor&quot; to add your regular parts wholesalers.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-xs">Firm &amp; Contact</TableHead>
                  <TableHead className="text-xs">WhatsApp Number</TableHead>
                  <TableHead className="text-xs">Specialties</TableHead>
                  <TableHead className="text-xs">Location / Notes</TableHead>
                  <TableHead className="w-[110px] text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="py-2.5">
                      <div className="font-semibold text-xs text-foreground">{s.firm_name}</div>
                      {s.contact_person && (
                        <div className="text-[11px] text-muted-foreground">{s.contact_person}</div>
                      )}
                    </TableCell>

                    <TableCell className="py-2.5">
                      <button
                        type="button"
                        onClick={() => openWhatsApp(s.whatsapp_number, s.firm_name)}
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-500 hover:text-emerald-400 hover:underline"
                        title="Chat on WhatsApp"
                      >
                        <MessageCircle className="size-3.5" />
                        {s.whatsapp_number}
                      </button>
                    </TableCell>

                    <TableCell className="py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(s.brand_specialty || []).map((b) => (
                          <Badge
                            key={b}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-border bg-card"
                          >
                            {b}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell className="py-2.5 text-xs text-muted-foreground max-w-[180px]">
                      {s.address && <div className="truncate">{s.address}</div>}
                      {s.notes && (
                        <div className="text-[11px] text-muted-foreground/70 truncate">
                          {s.notes}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(s)}
                          className="size-7 p-0 text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(s.id, s.firm_name)}
                          className="size-7 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
