'use client';

import { useState } from 'react';
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
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import type { PartCatalogItem } from '@/types/inventory';

interface PartDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartCatalogItem | null;
  onSuccess: () => void;
}

export function PartDeleteDialog({
  open,
  onOpenChange,
  part,
  onSuccess,
}: PartDeleteDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!part) return null;

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/parts/${part.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete part');
      }

      toast.success(`Part "${part.part_name}" has been removed`);
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
            <AlertTriangle className="size-6" />
          </div>
          <DialogTitle className="text-center text-lg">Delete Auto Part</DialogTitle>
          <DialogDescription className="text-center text-sm">
            Are you sure you want to permanently delete{' '}
            <strong className="text-foreground">{part.part_name}</strong> (SKU:{' '}
            <span className="font-mono">{part.sku}</span>)?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-500">
          <p className="font-semibold">Warning:</p>
          <p className="mt-1">
            This action will remove the part record, all associated vehicle compatibility fitments, and historic stock movement entries. This cannot be undone.
          </p>
        </div>

        <DialogFooter className="mt-4 flex sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-1.5 size-4" />
                Confirm Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
