'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Car,
  Plus,
  Trash2,
  Fuel,
  Cpu,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  COMMON_VEHICLE_MAKES,
  BIKE_MODELS_BY_MAKE,
  FUEL_TYPES,
  validateFitmentYearRange,
  type BikeMake,
} from '@/lib/inventory/fitment';
import type { VehicleFitment } from '@/types/inventory';

interface VehicleFitmentSectionProps {
  partId: string;
  fitments: VehicleFitment[];
  onRefresh: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

export function VehicleFitmentSection({
  partId,
  fitments,
  onRefresh,
  canEdit,
  canDelete,
}: VehicleFitmentSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [manufacturer, setManufacturer] = useState('');
  const [customMake, setCustomMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [engine, setEngine] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [vehicleType, setVehicleType] = useState('Motorcycle / Bike');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setManufacturer('');
    setCustomMake('');
    setModel('');
    setVariant('');
    setYearFrom('');
    setYearTo('');
    setEngine('');
    setFuelType('');
    setVehicleType('Motorcycle / Bike');
    setNotes('');
    setError(null);
  };

  const effectiveMake =
    manufacturer === '__other__' ? customMake.trim() : manufacturer.trim();

  const handleAddFitment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!effectiveMake) {
      setError('Please select or specify a vehicle manufacturer');
      return;
    }
    if (!model.trim()) {
      setError('Vehicle model is required');
      return;
    }

    const yFrom = parseInt(yearFrom, 10);
    const yTo = yearTo.trim() ? parseInt(yearTo, 10) : undefined;

    const validation = validateFitmentYearRange(yFrom, yTo);
    if (!validation.valid) {
      setError(validation.error || 'Invalid year range');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/inventory/fitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_id: partId,
          manufacturer: effectiveMake,
          model: model.trim(),
          variant: variant.trim() || undefined,
          year_from: yFrom,
          year_to: yTo,
          engine: engine.trim() || undefined,
          fuel_type: fuelType.trim() || undefined,
          vehicle_type: vehicleType.trim() || 'Passenger Car',
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add fitment');
      }

      toast.success(
        `Added fitment: ${effectiveMake} ${model} (${yFrom}${yTo ? `-${yTo}` : '+'})`,
      );
      resetForm();
      setDialogOpen(false);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error adding vehicle compatibility';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFitment = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/inventory/fitment/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove fitment');
      }
      toast.success('Vehicle compatibility removed');
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Car className="size-5 text-primary" />
            Compatible Vehicles ({fitments.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified makes and models guaranteed to fit this auto part.
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            Add Vehicle
          </Button>
        )}
      </div>

      {fitments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-8 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
            <Car className="size-5" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">No compatibility records</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Associate this part with specific vehicle makes, models, and year ranges to power intelligent matching in customer WhatsApp chats.
          </p>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="mt-4 gap-1.5"
            >
              <Plus className="size-4" />
              Add First Vehicle
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-xs font-semibold">Make & Model</TableHead>
                <TableHead className="text-xs font-semibold">Years</TableHead>
                <TableHead className="text-xs font-semibold">Engine & Fuel</TableHead>
                <TableHead className="text-xs font-semibold">Variant / Notes</TableHead>
                {canDelete && (
                  <TableHead className="w-16 text-right text-xs font-semibold">
                    Action
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fitments.map((fitment) => (
                <TableRow key={fitment.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {fitment.manufacturer}
                      </span>
                      <span className="text-muted-foreground">{fitment.model}</span>
                      {fitment.vehicle_type && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {fitment.vehicle_type}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs font-medium text-foreground">
                      {fitment.year_from}
                      {fitment.year_to ? ` – ${fitment.year_to}` : '+'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {fitment.engine && (
                        <div className="flex items-center gap-1">
                          <Cpu className="size-3 text-primary" />
                          <span>{fitment.engine}</span>
                        </div>
                      )}
                      {fitment.fuel_type && (
                        <div className="flex items-center gap-1">
                          <Fuel className="size-3 text-muted-foreground" />
                          <span>{fitment.fuel_type}</span>
                        </div>
                      )}
                      {!fitment.engine && !fitment.fuel_type && (
                        <span className="italic">All powertrains</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5 text-xs">
                      {fitment.variant && (
                        <p className="font-medium text-foreground">{fitment.variant}</p>
                      )}
                      {fitment.notes && (
                        <p className="text-muted-foreground text-[11px]">{fitment.notes}</p>
                      )}
                      {!fitment.variant && !fitment.notes && (
                        <span className="text-muted-foreground italic">Standard</span>
                      )}
                    </div>
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        disabled={deletingId === fitment.id}
                        onClick={() => handleDeleteFitment(fitment.id)}
                      >
                        {deletingId === fitment.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Fitment Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) resetForm();
          setDialogOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="size-5 text-primary" />
              Add Vehicle Compatibility
            </DialogTitle>
            <DialogDescription>
              Link a vehicle model and manufacturing year range to this part.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddFitment} className="space-y-3.5 py-1">
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Manufacturer Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fit_make" className="text-xs font-semibold">
                  Manufacturer <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={manufacturer}
                  onValueChange={(val) => {
                    if (val !== null) {
                      setManufacturer(val);
                      setError(null);
                    }
                  }}
                >
                  <SelectTrigger id="fit_make">
                    <SelectValue placeholder="Select Make" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {COMMON_VEHICLE_MAKES.map((make) => (
                      <SelectItem key={make} value={make}>
                        {make}
                      </SelectItem>
                    ))}
                    <SelectItem value="__other__">+ Other / Custom Make</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {manufacturer === '__other__' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="custom_make" className="text-xs font-semibold">
                    Custom Make Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="custom_make"
                    placeholder="e.g. Bajaj, Hero, Honda"
                    value={customMake}
                    onChange={(e) => setCustomMake(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="fit_type" className="text-xs font-semibold">
                    Vehicle Type
                  </Label>
                  <Select
                    value={vehicleType}
                    onValueChange={(val) => {
                      if (val !== null) setVehicleType(val);
                    }}
                  >
                    <SelectTrigger id="fit_type">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Motorcycle / Bike">Motorcycle / Bike</SelectItem>
                      <SelectItem value="Scooter">Scooter</SelectItem>
                      <SelectItem value="Moped">Moped</SelectItem>
                      <SelectItem value="Three-Wheeler / Auto">Three-Wheeler / Auto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Model & Variant */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fit_model" className="text-xs font-semibold">
                  Model <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fit_model"
                  placeholder="e.g. Pulsar 150, Splendor Plus, Activa 6G"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setError(null);
                  }}
                  required
                />
                {manufacturer && manufacturer in BIKE_MODELS_BY_MAKE && (
                  <div className="flex flex-wrap gap-1 pt-1 max-h-20 overflow-y-auto">
                    {BIKE_MODELS_BY_MAKE[manufacturer as BikeMake].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setModel(m);
                          setError(null);
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          model === m
                            ? 'bg-primary/15 text-primary border-primary font-medium'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fit_variant" className="text-xs font-semibold">
                  Trim / Variant (Optional)
                </Label>
                <Input
                  id="fit_variant"
                  placeholder="e.g. Drum, Disc, Self-Start, Alloy, BS6"
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                />
              </div>
            </div>

            {/* Year From & Year To */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="year_from" className="text-xs font-semibold">
                  Year From <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="year_from"
                  type="number"
                  placeholder="2018"
                  min="1900"
                  max="2035"
                  value={yearFrom}
                  onChange={(e) => {
                    setYearFrom(e.target.value);
                    setError(null);
                  }}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="year_to" className="text-xs font-semibold">
                  Year To (Optional)
                </Label>
                <Input
                  id="year_to"
                  type="number"
                  placeholder="2024 (leave blank for current)"
                  min="1900"
                  max="2035"
                  value={yearTo}
                  onChange={(e) => {
                    setYearTo(e.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>

            {/* Engine & Fuel Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fit_engine" className="text-xs font-semibold">
                  Engine Displacement / Code (Optional)
                </Label>
                <Input
                  id="fit_engine"
                  placeholder="e.g. 97.2cc, 109.5cc, 124.7cc, 149.5cc DTS-i"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fit_fuel" className="text-xs font-semibold">
                  Fuel Type (Optional)
                </Label>
                <Select
                  value={fuelType}
                  onValueChange={(val) => {
                    if (val !== null) setFuelType(val);
                  }}
                >
                  <SelectTrigger id="fit_fuel">
                    <SelectValue placeholder="All Fuel Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Powertrains</SelectItem>
                    {FUEL_TYPES.map((fuel) => (
                      <SelectItem key={fuel} value={fuel}>
                        {fuel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fitment Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="fit_notes" className="text-xs font-semibold">
                Fitment Notes / Restrictions (Optional)
              </Label>
              <Textarea
                id="fit_notes"
                placeholder="e.g. Fits front axle only with 296mm rotors; not compatible with Sport package"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Compatibility'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
