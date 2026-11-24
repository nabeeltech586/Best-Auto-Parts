'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  COMMON_PART_CATEGORIES,
  COMMON_VEHICLE_MAKES,
  BIKE_MODELS_BY_MAKE,
  type BikeMake,
} from '@/lib/inventory/fitment';
import { PART_CONDITIONS, type PartCatalogItem, type PartCondition, type PartFormData } from '@/types/inventory';
import { Loader2, Image as ImageIcon, Sparkles } from 'lucide-react';
import { PART_IMAGE_PRESETS, getMatchingPartImage, DEFAULT_PART_IMAGE } from '@/lib/partImages';

interface PartFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: PartCatalogItem | null;
  onSuccess: () => void;
}

export function PartFormDialog({
  open,
  onOpenChange,
  initialData,
  onSuccess,
}: PartFormDialogProps) {
  const isEditing = Boolean(initialData);

  const [partName, setPartName] = useState('');
  const [sku, setSku] = useState('');
  const [oemNumber, setOemNumber] = useState('');
  const [alternateOems, setAlternateOems] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [condition, setCondition] = useState<PartCondition>('OEM');
  const [costPrice, setCostPrice] = useState('0.00');
  const [sellingPrice, setSellingPrice] = useState('0.00');
  const [quantity, setQuantity] = useState('0');
  const [threshold, setThreshold] = useState('5');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedBikeMake, setSelectedBikeMake] = useState<BikeMake | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setPartName(initialData.part_name || '');
      setSku(initialData.sku || '');
      setOemNumber(initialData.oem_number || '');
      setAlternateOems((initialData.alternate_oem_numbers || []).join(', '));
      setBrand(initialData.brand || '');
      setCategory(initialData.category || '');
      setSubcategory(initialData.subcategory || '');
      setCondition(initialData.condition || 'OEM');
      setCostPrice(String(initialData.cost_price ?? '0.00'));
      setSellingPrice(String(initialData.selling_price ?? '0.00'));
      setQuantity(String(initialData.quantity_in_stock ?? '0'));
      setThreshold(String(initialData.low_stock_threshold ?? '5'));
      setLocation(initialData.location || '');
      setImageUrl(initialData.image_url || (initialData.image_urls && initialData.image_urls[0]) || '');
      setDescription(initialData.description || '');

      const currentSku = (initialData.sku || '').toUpperCase();
      const currentBrand = (initialData.brand || '').toLowerCase();
      if (currentSku.includes('BAJ') || currentBrand.includes('bajaj')) {
        setSelectedBikeMake('Bajaj');
      } else if (currentSku.includes('HER') || currentBrand.includes('hero')) {
        setSelectedBikeMake('Hero');
      } else if (currentSku.includes('HON') || currentBrand.includes('honda')) {
        setSelectedBikeMake('Honda');
      } else {
        setSelectedBikeMake('');
      }
    } else {
      setPartName('');
      setSku('');
      setOemNumber('');
      setAlternateOems('');
      setBrand('');
      setCategory('');
      setSubcategory('');
      setCondition('OEM');
      setCostPrice('0.00');
      setSellingPrice('0.00');
      setQuantity('0');
      setThreshold('5');
      setLocation('');
      setImageUrl('');
      setDescription('');
      setSelectedBikeMake('');
    }
    setErrors({});
  }, [initialData, open]);

  const handleSelectBikeMake = (make: BikeMake) => {
    const isTogglingOff = selectedBikeMake === make;
    setSelectedBikeMake(isTogglingOff ? '' : make);

    if (!isEditing && !isTogglingOff) {
      if (
        !brand ||
        brand === 'Bajaj Genuine' ||
        brand === 'Hero Genuine' ||
        brand === 'Honda Genuine'
      ) {
        setBrand(`${make} Genuine`);
      }
      if (!sku || sku.startsWith('SKU-')) {
        const prefix =
          make === 'Bajaj' ? 'SKU-BAJ-' : make === 'Hero' ? 'SKU-HER-' : 'SKU-HON-';
        setSku(prefix);
      }
    }
  };

  const handleAddModelToDescription = (modelName: string) => {
    setDescription((prev) => {
      if (prev.includes(modelName)) return prev;
      return prev ? `${prev} • Compatible with ${modelName}` : `Compatible with ${modelName}`;
    });
    toast.info(`Added "${modelName}" to part compatibility description`);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    if (!partName.trim()) {
      setErrors((prev) => ({ ...prev, part_name: 'Part name is required' }));
      return;
    }
    if (!sku.trim()) {
      setErrors((prev) => ({ ...prev, sku: 'SKU is required' }));
      return;
    }

    const trimmedImg = imageUrl.trim();

    const payload: Partial<PartFormData> = {
      part_name: partName.trim(),
      sku: sku.trim().toUpperCase(),
      oem_number: oemNumber.trim() || undefined,
      alternate_oem_numbers: alternateOems
        ? alternateOems.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
        : [],
      brand: brand.trim() || undefined,
      category: category.trim() || undefined,
      subcategory: subcategory.trim() || undefined,
      condition,
      cost_price: parseFloat(costPrice) || 0,
      selling_price: parseFloat(sellingPrice) || 0,
      quantity_in_stock: parseInt(quantity, 10) || 0,
      low_stock_threshold: parseInt(threshold, 10) || 5,
      location: location.trim() || undefined,
      image_url: trimmedImg || undefined,
      image_urls: trimmedImg ? [trimmedImg] : undefined,
      description: description.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const url = isEditing
        ? `/api/inventory/parts/${initialData?.id}`
        : '/api/inventory/parts';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save part');
      }

      toast.success(isEditing ? 'Part updated successfully' : 'Part added to catalog');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save part');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEditing ? 'Edit Auto Part' : 'Add New Auto Part'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditing
              ? 'Update the product specifications, OEM references, and stock parameters.'
              : 'Add an automotive part to your inventory catalog with OEM numbers and stock tracking.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Section 1: Identification */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Part Identification
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="partName" className="text-xs">
                  Part Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="partName"
                  placeholder="e.g. Ceramic Front Brake Pad Set"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  className="bg-muted/60 border-border"
                />
                {errors.part_name && (
                  <p className="text-[11px] text-red-400">{errors.part_name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku" className="text-xs">
                  SKU / Internal Part # <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="sku"
                  placeholder="e.g. BRK-PAD-TY-01"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  className="bg-muted/60 border-border font-mono text-sm"
                />
                {errors.sku && (
                  <p className="text-[11px] text-red-400">{errors.sku}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="oemNumber" className="text-xs">
                  Primary OEM Part #
                </Label>
                <Input
                  id="oemNumber"
                  placeholder="e.g. 04465-02220"
                  value={oemNumber}
                  onChange={(e) => setOemNumber(e.target.value)}
                  className="bg-muted/60 border-border font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="alternateOems" className="text-xs">
                  Alternate / Superseded OEM Numbers (comma-separated)
                </Label>
                <Input
                  id="alternateOems"
                  placeholder="e.g. 04465-02240, 04465-12610, 04465-YZZC1"
                  value={alternateOems}
                  onChange={(e) => setAlternateOems(e.target.value)}
                  className="bg-muted/60 border-border font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Classification */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Classification &amp; Brand
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="brand" className="text-xs">
                  Manufacturer / Brand
                </Label>
                <Input
                  id="brand"
                  placeholder="e.g. Hero Genuine, Bajaj, Honda, NGK, Exide, MRF"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="bg-muted/60 border-border"
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {[
                    'Hero Genuine',
                    'Bajaj Genuine',
                    'Honda Genuine',
                    'NGK',
                    'Exide',
                    'MRF',
                    'Endurance',
                  ].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBrand(b)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        brand === b
                          ? 'bg-primary/15 text-primary border-primary font-medium'
                          : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-xs">
                  System Category
                </Label>
                <Select
                  value={category}
                  onValueChange={(val) => {
                    if (val !== null) setCategory(val);
                  }}
                >
                  <SelectTrigger className="bg-muted/60 border-border text-xs">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_PART_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="condition" className="text-xs">
                  Part Condition <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={condition}
                  onValueChange={(v) => {
                    if (v !== null) setCondition(v as PartCondition);
                  }}
                >
                  <SelectTrigger className="bg-muted/60 border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PART_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Target Bike Make & Popular Models */}
            <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Target Two-Wheeler Make &amp; Compatible Models
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  Bajaj • Hero • Honda
                </span>
              </div>

              {/* Make Selector Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_VEHICLE_MAKES.map((make) => {
                  const isSelected = selectedBikeMake === make;
                  return (
                    <button
                      key={make}
                      type="button"
                      onClick={() => handleSelectBikeMake(make)}
                      className={`text-xs px-3 py-1 rounded-md border font-medium transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                          : 'bg-background text-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      🏍️ {make}
                    </button>
                  );
                })}
              </div>

              {/* Models List for Selected Make */}
              {selectedBikeMake && (
                <div className="space-y-1 pt-1 border-t border-border/50">
                  <div className="text-[11px] text-muted-foreground">
                    Click a model to add to part compatibility description:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {BIKE_MODELS_BY_MAKE[selectedBikeMake].map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => handleAddModelToDescription(model)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-background border border-border text-foreground hover:border-primary hover:text-primary transition-colors"
                        title={`Click to add ${model} to description`}
                      >
                        + {model}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Pricing & Stock */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pricing &amp; Warehouse Stock
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="costPrice" className="text-xs">
                  Cost Price (₹)
                </Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="bg-muted/60 border-border font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sellingPrice" className="text-xs">
                  Selling Price (₹) <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="sellingPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="bg-muted/60 border-border font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quantity" className="text-xs">
                  Stock Units {!isEditing && <span className="text-red-400">*</span>}
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="1"
                  disabled={isEditing}
                  title={isEditing ? 'Use "Adjust Stock" on the details page to modify live stock' : undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="bg-muted/60 border-border font-mono disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="threshold" className="text-xs">
                  Low Stock Alert
                </Label>
                <Input
                  id="threshold"
                  type="number"
                  min="0"
                  step="1"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="bg-muted/60 border-border font-mono"
                />
              </div>

              <div className="space-y-1.5 col-span-2 sm:col-span-4">
                <Label htmlFor="location" className="text-xs">
                  Warehouse Location / Shelf Bin
                </Label>
                <Input
                  id="location"
                  placeholder="e.g. Aisle 3, Rack B, Bin 14"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="bg-muted/60 border-border"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Product Visual & Thumbnail */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ImageIcon className="size-3.5 text-primary" />
                Product Visual &amp; Thumbnail Photo
              </h4>
              <span className="text-[11px] text-muted-foreground">
                Appears in CRM Catalog &amp; WhatsApp Statements
              </span>
            </div>

            <div className="flex items-start gap-3">
              {/* Live Thumbnail Preview */}
              <div className="size-16 shrink-0 relative rounded-lg border border-border bg-white p-1.5 shadow-xs flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    imageUrl.trim() ||
                    getMatchingPartImage({
                      part_name: partName,
                      sku,
                      category,
                    })
                  }
                  alt="Thumbnail Preview"
                  className="size-full object-contain"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PART_IMAGE;
                  }}
                />
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                <div className="space-y-1">
                  <Label htmlFor="imageUrl" className="text-xs">
                    Custom Image URL or Path
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="imageUrl"
                      placeholder="e.g. /parts/brake-pad.svg or https://..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="bg-muted/60 border-border font-mono text-xs"
                    />
                    {imageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setImageUrl('')}
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title="Reset to Auto Category Match"
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quick Preset Selector Pills */}
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Sparkles className="size-3 text-amber-500" />
                    Quick Category Visual Presets:
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                    {PART_IMAGE_PRESETS.filter((p) => p.id !== 'generic-part').map((preset) => {
                      const isSelected =
                        imageUrl === preset.path ||
                        (!imageUrl &&
                          getMatchingPartImage({ part_name: partName, sku, category }) === preset.path);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setImageUrl(preset.path)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                            isSelected
                              ? 'bg-primary/15 text-primary border-primary font-medium'
                              : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Description */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <Label htmlFor="description" className="text-xs">
              Part Notes / Description
            </Label>
            <Textarea
              id="description"
              placeholder="e.g. Direct fit front ceramic brake pads. Hardware kit included."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-muted/60 border-border min-h-[70px] text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="border-border"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
