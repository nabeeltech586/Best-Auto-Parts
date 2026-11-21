'use client';

import { useState, useRef } from 'react';
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
import {
  parseCsv,
  validateCsvRows,
  generateSampleCsv,
} from '@/lib/inventory/csv';
import type { CsvImportRow, CsvValidationError } from '@/types/inventory';
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CsvImportModal({
  open,
  onOpenChange,
  onSuccess,
}: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validRows, setValidRows] = useState<CsvImportRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<CsvValidationError[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [parsing, setParsing] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setValidRows([]);
    setValidationErrors([]);
    setDuplicateCount(0);
    setTotalRows(0);
    setParsing(false);
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadSample = () => {
    const csvContent = generateSampleCsv();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'auto_parts_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Sample template downloaded');
  };

  const processFile = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Please upload a valid .csv file');
      return;
    }

    setParsing(true);
    setFile(selectedFile);

    try {
      const text = await selectedFile.text();
      const parsed = parseCsv(text);

      if (parsed.length === 0) {
        toast.error('The selected CSV file is empty or missing headers');
        resetState();
        return;
      }

      setTotalRows(parsed.length);
      const validation = validateCsvRows(parsed);
      setValidRows(validation.validRows);
      setValidationErrors(validation.errors);
      setDuplicateCount(validation.duplicateCount);

      if (validation.validRows.length === 0) {
        toast.error('No valid rows found in CSV. Check the errors list below.');
      } else {
        toast.info(
          `Found ${validation.validRows.length} valid rows${
            validation.errors.length > 0 ? ` with ${validation.errors.length} errors` : ''
          }`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse CSV file';
      toast.error(msg);
      resetState();
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processFile(selected);
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/inventory/csv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import CSV');
      }

      toast.success(
        `Successfully imported ${data.summary.imported} parts (${data.summary.skippedDuplicates} duplicates skipped)`,
      );
      resetState();
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetState();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              Import Auto Parts via CSV
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadSample}
              className="text-xs gap-1.5"
            >
              <Download className="size-3.5" />
              Download Template
            </Button>
          </div>
          <DialogDescription>
            Upload a CSV containing parts, SKUs, OEM numbers, pricing, and initial quantities.
          </DialogDescription>
        </DialogHeader>

        {/* Upload Zone */}
        {!file && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="rounded-full bg-primary/10 p-3 text-primary mb-3 group-hover:scale-105 transition-transform">
              <Upload className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Click to select a CSV file
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports UTF-8 CSV with part name, SKU, OEM numbers, and pricing
            </p>
          </div>
        )}

        {/* Parsing state */}
        {parsing && (
          <div className="flex items-center justify-center p-8 space-x-2">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Validating CSV rows...</span>
          </div>
        )}

        {/* Analysis Results */}
        {file && !parsing && (
          <div className="space-y-4">
            {/* File info bar */}
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB • {totalRows} records found
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetState}
                className="h-8 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5 mr-1" />
                Remove
              </Button>
            </div>

            {/* Validation Metrics Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Total Rows</p>
                <p className="text-lg font-bold text-foreground">{totalRows}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                <p className="text-[11px] text-emerald-500">Ready to Import</p>
                <p className="text-lg font-bold text-emerald-500">{validRows.length}</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                <p className="text-[11px] text-amber-500">Invalid / Duplicates</p>
                <p className="text-lg font-bold text-amber-500">{validationErrors.length}</p>
              </div>
            </div>

            {/* Error Listing */}
            {validationErrors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" />
                    Validation Issues ({validationErrors.length})
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    Invalid rows will be skipped during import
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-16 text-xs">Row</TableHead>
                        <TableHead className="w-28 text-xs">Field</TableHead>
                        <TableHead className="text-xs">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationErrors.map((err, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{err.row}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-foreground">
                            {err.field}
                          </TableCell>
                          <TableCell className="text-xs text-destructive">
                            {err.message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetState();
              onOpenChange(false);
            }}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={importing || validRows.length === 0}
            className="gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importing {validRows.length} Parts...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Import {validRows.length} Parts
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
