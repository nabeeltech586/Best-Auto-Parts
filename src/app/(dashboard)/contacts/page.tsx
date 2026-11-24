'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  Plus,
  Upload,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Filter,
  X,
  Copy,
  Check,
  MessageSquare,
  CreditCard,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Wrench,
  Building2,
  Store,
  User,
  MoreVertical,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { useTranslations } from 'next-intl';
import {
  contactSearchFilter,
  contactSearchPattern,
} from '@/lib/contacts/search-filter';
import { pageAfterRangeError, pageAfterShrink } from '@/lib/contacts/page-bounds';
import {
  syncDistributorsAndWholesalers,
  syncContactToSupplier,
} from '@/lib/contacts/distributor-sync';
import { OwnerPinModal } from '@/components/auth/owner-pin-modal';
import { getContactUniqueCode } from '@/lib/contacts/unique-code';

const PAGE_SIZE = 25;

export type ContactCategory = 'Distributor' | 'Wholesaler' | 'Mechanic' | 'Customer';
export type CategoryTab = 'All' | 'UdhaarDue' | ContactCategory;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

export default function ContactsPage() {
  const t = useTranslations('Contacts.page');
  const tGate = useTranslations('GatedButton');
  const router = useRouter();
  const supabase = createClient();
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Category filter tab
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('All');
  const [categoryCounts, setCategoryCounts] = useState<Record<CategoryTab, number>>({
    All: 0,
    UdhaarDue: 0,
    Distributor: 0,
    Wholesaler: 0,
    Mechanic: 0,
    Customer: 0,
  });

  // Dues / Udhaar map by phone (digits)
  const [duesByPhone, setDuesByPhone] = useState<Record<string, number>>({});
  const duesByPhoneRef = useRef<Record<string, number>>({});

  // Owner PIN protection modal state
  const [ownerPinOpen, setOwnerPinOpen] = useState(false);
  const [ownerPinConfig, setOwnerPinConfig] = useState<{
    title: string;
    description: string;
    action: () => void;
  }>({
    title: 'Owner Security PIN Required',
    description: 'Enter your 4-digit Owner PIN to proceed.',
    action: () => {},
  });

  function requestOwnerPin(config: {
    title: string;
    description: string;
    action: () => void;
  }) {
    setOwnerPinConfig(config);
    setOwnerPinOpen(true);
  }

  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // 1-click copy feedback
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection (page-scoped — only the loaded rows are selectable)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});
  const tagsMapRef = useRef<Record<string, Tag>>({});

  const fetchSeq = useRef(0);

  // Calculate live Udhaar / Due amount for a contact (Non-blocking & synchronous)
  const getContactDue = useCallback(
    (contact: Contact | ContactWithTags): number => {
      const directBalance = Number(contact.pending_balance ?? 0);
      const rawPhone = (contact.phone || '').replace(/\D/g, '').slice(-10);
      const mappedDue = rawPhone
        ? duesByPhone[rawPhone] ?? duesByPhoneRef.current[rawPhone] ?? 0
        : 0;
      return Math.max(directBalance, mappedDue);
    },
    [duesByPhone]
  );

  // Fetch Category Counts across all contacts (Non-blocking with pending_balance fallback)
  const fetchCategoryCounts = useCallback(
    async (currentDuesMap?: Record<string, number>) => {
      try {
        const activeDues = currentDuesMap || duesByPhoneRef.current;
        let data: { category?: string | null; phone?: string | null; pending_balance?: number | string | null }[] | null = null;

        // Try select with pending_balance
        const res = await supabase.from('contacts').select('category, phone, pending_balance');
        if (res.error) {
          // Gracefully fallback if pending_balance column is absent
          const fallbackRes = await supabase.from('contacts').select('category, phone');
          data = fallbackRes.data;
        } else {
          data = res.data;
        }

        if (data) {
          const counts: Record<CategoryTab, number> = {
            All: data.length,
            UdhaarDue: 0,
            Distributor: 0,
            Wholesaler: 0,
            Mechanic: 0,
            Customer: 0,
          };
          data.forEach((c) => {
            const cat = c.category as ContactCategory;
            if (cat && counts[cat] !== undefined) {
              counts[cat]++;
            } else {
              counts.Customer++;
            }
            const rawPhone = (c.phone || '').replace(/\D/g, '').slice(-10);
            const due = Math.max(
              Number(c.pending_balance ?? 0),
              rawPhone ? activeDues[rawPhone] || 0 : 0
            );
            if (due > 0) {
              counts.UdhaarDue++;
            }
          });
          setCategoryCounts(counts);
        }
      } catch (err) {
        console.warn('[fetchCategoryCounts] Non-blocking warning:', err);
      }
    },
    [supabase]
  );

  // Fetch Live Udhaar / Balance dues from purchase_orders and payment_links (Non-blocking)
  const fetchLiveDues = useCallback(async (): Promise<Record<string, number>> => {
    const duesMap: Record<string, number> = {};
    try {
      // 1. Unpaid POs (for Distributors / Wholesalers)
      try {
        const { data: unpaidPos } = await supabase
          .from('purchase_orders')
          .select('supplier_phone, total_estimated_cost, amount_paid')
          .neq('payment_status', 'PAID');

        unpaidPos?.forEach((po) => {
          const rawPhone = (po.supplier_phone || '').replace(/\D/g, '').slice(-10);
          const due = Math.max(0, Number(po.total_estimated_cost || 0) - Number(po.amount_paid || 0));
          if (rawPhone && due > 0) {
            duesMap[rawPhone] = (duesMap[rawPhone] || 0) + due;
          }
        });
      } catch (poErr) {
        console.warn('[fetchLiveDues] POs check warning:', poErr);
      }

      // 2. Pending payment links / collections
      try {
        const { data: pendingLinks } = await supabase
          .from('payment_links')
          .select('customer_phone, amount')
          .eq('status', 'PENDING');

        pendingLinks?.forEach((link) => {
          const rawPhone = (link.customer_phone || '').replace(/\D/g, '').slice(-10);
          const amt = Number(link.amount || 0);
          if (rawPhone && amt > 0) {
            duesMap[rawPhone] = (duesMap[rawPhone] || 0) + amt;
          }
        });
      } catch (linkErr) {
        console.warn('[fetchLiveDues] Payment links check warning:', linkErr);
      }

      duesByPhoneRef.current = duesMap;
      setDuesByPhone(duesMap);
      return duesMap;
    } catch (err) {
      console.warn('[fetchLiveDues] Non-blocking warning:', err);
      return duesMap;
    }
  }, [supabase]);

  const fetchTags = useCallback(async () => {
    try {
      const { data } = await supabase.from('tags').select('*');
      if (data) {
        const map: Record<string, Tag> = {};
        data.forEach((t) => (map[t.id] = t));
        tagsMapRef.current = map;
        setTagsMap(map);
        setSelectedTagIds((prev) => {
          const pruned = prev.filter((id) => map[id]);
          return pruned.length === prev.length ? prev : pruned;
        });
      }
    } catch (err) {
      console.warn('[fetchTags] Non-blocking warning:', err);
    }
  }, [supabase]);

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setSelected(new Set());

    // 8-second safety timeout fallback so "Loading contacts..." NEVER hangs indefinitely
    const safetyTimer = setTimeout(() => {
      if (fetchSeq.current === seq) {
        console.warn('[fetchContacts] Safety timeout triggered after 8s - force clearing loading spinner');
        setLoading(false);
      }
    }, 8000);

    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const term = search.trim();

      let contactRows: Contact[] = [];
      let count = 0;
      let countIsExact = true;

      if (selectedTagIds.length > 0) {
        try {
          const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
            p_tag_ids: selectedTagIds,
            p_search: contactSearchPattern(term),
            p_limit: PAGE_SIZE,
            p_offset: from,
          });
          if (seq !== fetchSeq.current) return;
          if (error) {
            console.warn('[filter_contacts_by_tags] RPC error, falling back:', error);
            const fallbackQuery = await supabase
              .from('contacts')
              .select('*', { count: 'exact' })
              .order('created_at', { ascending: false })
              .range(from, to);
            contactRows = fallbackQuery.data ?? [];
            count = fallbackQuery.count ?? contactRows.length;
          } else {
            const rows = (data ?? []) as { contact: Contact; total_count: number }[];
            let rawContacts = rows.map((r) => r.contact);

            if (selectedCategory === 'UdhaarDue') {
              rawContacts = rawContacts.filter((c) => getContactDue(c) > 0);
            } else if (selectedCategory !== 'All') {
              if (selectedCategory === 'Customer') {
                rawContacts = rawContacts.filter((c) => !c.category || c.category === 'Customer');
              } else {
                rawContacts = rawContacts.filter((c) => c.category === selectedCategory);
              }
            }

            contactRows = rawContacts;
            count = rows.length > 0 ? Number(rows[0].total_count) : 0;
            countIsExact = rows.length > 0;
          }
        } catch (rpcErr) {
          console.warn('[filter_contacts_by_tags] error:', rpcErr);
        }
      } else if (selectedCategory === 'UdhaarDue') {
        let query = supabase
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false });

        const searchFilter = contactSearchFilter(term, {
          includeEmail: true,
          includeCompany: true,
          includeUniqueCode: true,
        });
        if (searchFilter) query = query.or(searchFilter);

        const { data, error } = await query;
        if (seq !== fetchSeq.current) return;
        if (error) {
          console.error('[fetchContacts] UdhaarDue query error:', error);
          toast.error(t('toastFailedLoad'));
          return;
        }

        const dueFiltered = (data ?? []).filter((c) => getContactDue(c) > 0);
        count = dueFiltered.length;
        contactRows = dueFiltered.slice(from, to + 1);
        countIsExact = true;
      } else {
        let query = supabase
          .from('contacts')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (selectedCategory !== 'All') {
          if (selectedCategory === 'Customer') {
            query = query.or('category.eq.Customer,category.is.null');
          } else {
            query = query.eq('category', selectedCategory);
          }
        }

        const searchFilter = contactSearchFilter(term, {
          includeEmail: true,
          includeCompany: true,
          includeUniqueCode: true,
        });
        if (searchFilter) query = query.or(searchFilter);

        const { data, count: exactCount, error } = await query;
        if (seq !== fetchSeq.current) return;

        const pageInRange = error ? pageAfterRangeError(page, PAGE_SIZE, error) : null;
        if (pageInRange !== null && pageInRange !== page) {
          setPage(pageInRange);
          return;
        }

        if (error) {
          console.error('[fetchContacts] Load contacts error:', error);
          toast.error(t('toastFailedLoad'));
          return;
        }
        contactRows = data ?? [];
        count = exactCount ?? contactRows.length;
      }

      setTotalCount(count);

      const boundedPage = pageAfterShrink(page, count, PAGE_SIZE, countIsExact);
      if (contactRows.length === 0 && boundedPage !== page) {
        setPage(boundedPage);
        return;
      }

      if (contactRows.length === 0) {
        setContacts([]);
        return;
      }

      // Immediately render primary contacts list without waiting for tags!
      const currentTagsMap = tagsMapRef.current;
      const initialEnriched: ContactWithTags[] = contactRows.map((c) => ({
        ...c,
        tags: [],
      }));
      setContacts(initialEnriched);

      // Secondary: fetch tags for these contacts in background without blocking render
      const contactIds = contactRows.map((c) => c.id);
      try {
        const { data: contactTags } = await supabase
          .from('contact_tags')
          .select('contact_id, tag_id')
          .in('contact_id', contactIds);

        if (seq === fetchSeq.current && contactTags && contactTags.length > 0) {
          const tagsByContact: Record<string, string[]> = {};
          contactTags.forEach((ct) => {
            if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
            tagsByContact[ct.contact_id].push(ct.tag_id);
          });

          setContacts(
            contactRows.map((c) => ({
              ...c,
              tags: (tagsByContact[c.id] ?? [])
                .map((tid) => currentTagsMap[tid] || tagsMap[tid])
                .filter(Boolean),
            }))
          );
        }
      } catch (tagErr) {
        console.warn('[fetchContacts] Non-blocking tag enrichment warning:', tagErr);
      }
    } catch (err) {
      console.error('[fetchContacts] Unexpected error:', err);
      toast.error(t('toastFailedLoad'));
    } finally {
      clearTimeout(safetyTimer);
      if (seq === fetchSeq.current) {
        setLoading(false);
      }
    }
  }, [supabase, page, search, selectedCategory, selectedTagIds, getContactDue, t]);

  // 1. Initial background loaders on mount (Tags, Dues, Distributor sync) - runs ONCE
  useEffect(() => {
    fetchTags().catch((err) => console.warn('[fetchTags] Non-blocking warning:', err));
    fetchLiveDues()
      .then((dues) => fetchCategoryCounts(dues))
      .catch((err) => console.warn('[fetchLiveDues] Non-blocking warning:', err));

    syncDistributorsAndWholesalers(supabase)
      .then((res) => {
        if (res.inserted > 0 || res.updated > 0) {
          fetchContacts();
          fetchCategoryCounts();
        }
      })
      .catch((err) => console.warn('[syncDistributors] Non-blocking warning:', err));
  }, []); // Run ONCE on mount without triggering re-render cascades!

  // 2. Fetch contacts when page, search, or filters change
  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Request PIN to change category
  function onSelectNewCategory(
    contactId: string,
    contactName: string,
    newCategory: ContactCategory,
    currentCategory: ContactCategory
  ) {
    if (newCategory === currentCategory) return;
    requestOwnerPin({
      title: 'Change Contact Role',
      description: `Enter 4-digit Owner PIN to change role for "${contactName || 'this contact'}" to ${newCategory}.`,
      action: () => handleUpdateCategory(contactId, contactName, newCategory),
    });
  }

  // Inline Category Update
  async function handleUpdateCategory(
    contactId: string,
    contactName: string,
    newCategory: ContactCategory
  ) {
    // Optimistic local state update
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, category: newCategory } : c))
    );

    try {
      const { error } = await supabase
        .from('contacts')
        .update({ category: newCategory, updated_at: new Date().toISOString() })
        .eq('id', contactId);

      if (error) throw error;
      toast.success(`Role updated: ${contactName || 'Contact'} is now ${newCategory}`);
      fetchCategoryCounts();

      // If marked as Distributor or Wholesaler, keep suppliers directory synced
      if (newCategory === 'Distributor' || newCategory === 'Wholesaler') {
        const targetContact = contacts.find((c) => c.id === contactId);
        if (targetContact) {
          syncContactToSupplier(supabase, {
            ...targetContact,
            category: newCategory,
          }).catch((err) => console.warn('[handleUpdateCategory] supplier sync warning:', err));
        }
      }
    } catch (err) {
      console.error('Update category error:', err);
      toast.error('Failed to update category');
      fetchContacts();
    }
  }

  // 1-Click Copy Phone
  function handleCopyPhone(e: React.MouseEvent, phone: string) {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    toast.success(`Phone copied: ${phone}`);
    setTimeout(() => setCopiedPhone(null), 2000);
  }

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  function confirmDelete(contact: Contact) {
    requestOwnerPin({
      title: 'Delete Contact',
      description: `Enter 4-digit Owner PIN to permanently delete "${contact.name || contact.phone}".`,
      action: () => {
        setDeleteTarget(contact);
        setDeleteConfirmOpen(true);
      },
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase.from('contacts').delete().eq('id', deleteTarget.id);

    if (error) {
      toast.error(t('toastFailedDelete'));
    } else {
      toast.success(t('toastDeleted'));
      fetchContacts();
      fetchCategoryCounts();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDeleteClick() {
    requestOwnerPin({
      title: 'Bulk Delete Contacts',
      description: `Enter 4-digit Owner PIN to permanently delete ${selected.size} selected contacts.`,
      action: () => {
        setBulkDeleteOpen(true);
      },
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);

    const { error } = await supabase.from('contacts').delete().in('id', ids);

    if (error) {
      toast.error(t('toastBulkFailedDelete'));
    } else {
      toast.success(t('toastBulkDeleted', { count: ids.length }));
      setSelected(new Set());
      fetchContacts();
      fetchCategoryCounts();
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters =
    search.trim().length > 0 || selectedTagIds.length > 0 || selectedCategory !== 'All';

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Contacts Directory
            </h1>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {totalCount} Total
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage customers, mechanics, wholesalers, and distributors with instant WhatsApp, payments, and ledger shortcuts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEditSettings && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomFieldsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted h-9"
            >
              <SlidersHorizontal className="size-4 mr-1.5" />
              {t('customFieldsBtn')}
            </Button>
          )}

          <GatedButton
            variant="outline"
            size="sm"
            canAct={canEdit}
            gateReason={tGate('reasons.addOrImportContacts')}
            onClick={() => setImportOpen(true)}
            className="border-border text-muted-foreground hover:bg-muted h-9"
          >
            <Upload className="size-4 mr-1.5" />
            {t('importBtn')}
          </GatedButton>

          <GatedButton
            size="sm"
            canAct={canEdit}
            gateReason={tGate('reasons.addOrImportContacts')}
            onClick={openAddForm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-9"
          >
            <Plus className="size-4 mr-1.5" />
            {t('addContactBtn')}
          </GatedButton>
        </div>
      </div>

      {/* Category Filter Tabs with Live Counts */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-card/60 p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['All', 'UdhaarDue', 'Distributor', 'Wholesaler', 'Mechanic', 'Customer'] as const).map((cat) => {
            const isSelected = selectedCategory === cat;
            const count = categoryCounts[cat] ?? 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setPage(0);
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isSelected
                    ? cat === 'UdhaarDue'
                      ? 'border-rose-500 bg-rose-600 text-white shadow-sm'
                      : cat === 'Distributor'
                      ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                      : cat === 'Wholesaler'
                      ? 'border-purple-500 bg-purple-600 text-white shadow-sm'
                      : cat === 'Mechanic'
                      ? 'border-amber-500 bg-amber-600 text-white shadow-sm'
                      : cat === 'Customer'
                      ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                      : 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : cat === 'UdhaarDue'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>
                  {cat === 'UdhaarDue' && '⚠️ '}
                  {cat === 'Distributor' && '🏢 '}
                  {cat === 'Wholesaler' && '🏬 '}
                  {cat === 'Mechanic' && '🔧 '}
                  {cat === 'Customer' && '👤 '}
                  {cat === 'UdhaarDue' ? 'Udhaar Due' : cat}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isSelected
                      ? 'bg-black/20 text-white'
                      : cat === 'UdhaarDue'
                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Add Contact in Toolbar */}
        <Button
          size="sm"
          variant="outline"
          onClick={openAddForm}
          className="h-8 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 shrink-0 text-xs font-medium"
        >
          <Plus className="mr-1 size-3.5" />
          Add Contact
        </Button>
      </div>

      {/* Search Bar & Tag Filter */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, phone, company, or Unique ID (BAP-...)..."
              className="pl-9 h-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:bg-muted shrink-0 h-9"
                />
              }
            >
              <Filter className="size-4 mr-1.5" />
              {t('filterByTags')}
              {selectedTagIds.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {selectedTagIds.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-medium text-popover-foreground">
                  {t('filterByTags')}
                </span>
                {selectedTagIds.length > 0 && (
                  <button
                    onClick={clearTagFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('clearAll')}
                  </button>
                )}
              </div>
              {allTags.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {t('noTagsYet')}
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTagFilter(tag.id)}
                        aria-label={t('filterByTag', { name: tag.name })}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-popover-foreground truncate">
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Active tag chips */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => toggleTagFilter(id)}
                    aria-label={t('removeTagFilter', { name: tag.name })}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearTagFilters}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-2">
          <p className="text-sm text-foreground">
            {t('selectedCount', { count: selected.size })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              {t('clearSelection')}
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason={tGate('reasons.deleteContacts')}
              onClick={handleBulkDeleteClick}
            >
              <Trash2 className="size-4 mr-1.5" />
              {t('deleteSelected')}
            </GatedButton>
          </div>
        </div>
      )}

      {/* Contacts Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && someOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={contacts.length === 0}
                  aria-label={t('selectAllOnPage')}
                />
              </TableHead>
              <TableHead className="font-semibold text-foreground">Contact & Mobile</TableHead>
              <TableHead className="font-semibold text-foreground">
                <span className="inline-flex items-center gap-1">
                  <span>Role / Category</span>
                  <Lock className="size-3 text-muted-foreground/70" />
                </span>
              </TableHead>
              <TableHead className="font-semibold text-foreground">Udhaar / Balance</TableHead>
              <TableHead className="font-semibold text-foreground hidden md:table-cell">
                <span className="inline-flex items-center gap-1">
                  <span>Tags</span>
                  <Lock className="size-3 text-muted-foreground/70" />
                </span>
              </TableHead>
              <TableHead className="font-semibold text-foreground hidden lg:table-cell">Created</TableHead>
              <TableHead className="w-12 text-right font-semibold text-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('loading')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {hasActiveFilters ? 'No contacts match your filter' : 'No contacts added yet'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hasActiveFilters
                        ? 'Try clearing category, search, or tag filters to see all contacts.'
                        : 'Create your first customer, mechanic, or distributor contact.'}
                    </p>
                    {!hasActiveFilters && (
                      <GatedButton
                        canAct={canEdit}
                        gateReason={tGate('reasons.addOrImportContacts')}
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="mt-2 border-border text-muted-foreground hover:bg-muted"
                      >
                        <Plus className="size-3.5 mr-1" />
                        {t('addFirstContact')}
                      </GatedButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact, idx) => {
                const dueAmount = getContactDue(contact);
                const hasUdhaar = dueAmount > 0;
                const uniqueCode = getContactUniqueCode(contact, page * PAGE_SIZE + idx + 1);
                const isPhoneCopied = copiedPhone === contact.phone;
                const contactCategory = (contact.category as ContactCategory) || 'Customer';

                return (
                  <TableRow
                    key={contact.id}
                    className={`border-b cursor-pointer transition-colors ${
                      hasUdhaar
                        ? 'bg-amber-50/80 dark:bg-amber-950/20 border-l-4 border-l-rose-500 hover:bg-amber-100/70 dark:hover:bg-amber-950/30 border-border/60'
                        : 'border-border/60 hover:bg-muted/40'
                    }`}
                    onClick={() => openDetail(contact.id)}
                  >
                    {/* Checkbox */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                        aria-label={t('selectContact', { name: contact.name || contact.phone })}
                      />
                    </TableCell>

                    {/* Name, Unique ID Pill, & Phone (with 1-click copy) */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Permanent Unique ID Pill */}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold tracking-tight bg-muted/80 text-foreground border border-border shadow-2xs">
                            {uniqueCode}
                          </span>

                          {/* Contact Name */}
                          <span
                            className={`text-sm ${
                              hasUdhaar
                                ? 'font-bold text-rose-950 dark:text-rose-200'
                                : 'font-semibold text-foreground'
                            }`}
                          >
                            {contact.name || (
                              <span className="text-muted-foreground italic font-normal">
                                {t('unnamed')}
                              </span>
                            )}
                          </span>

                          {/* Company / Shop Badge */}
                          {contact.company && (
                            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/40">
                              {contact.company}
                            </span>
                          )}

                          {/* ⚠️ UDHAR Badge if balance due */}
                          {hasUdhaar && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                              <span>⚠️ UDHAR ₹{dueAmount.toLocaleString('en-IN')}</span>
                            </span>
                          )}
                        </div>

                        {/* Phone with 1-click copy button */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <span>{contact.phone}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyPhone(e, contact.phone)}
                            className="inline-flex items-center justify-center size-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy phone number"
                          >
                            {isPhoneCopied ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </TableCell>

                    {/* Category Dropdown (Owner PIN Protected) */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                contactCategory === 'Distributor'
                                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25'
                                  : contactCategory === 'Wholesaler'
                                  ? 'border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25'
                                  : contactCategory === 'Mechanic'
                                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                              }`}
                              title="Click to change contact role (Owner PIN Protected)"
                            />
                          }
                        >
                          {contactCategory === 'Distributor' ? (
                            <Building2 className="size-3" />
                          ) : contactCategory === 'Wholesaler' ? (
                            <Store className="size-3" />
                          ) : contactCategory === 'Mechanic' ? (
                            <Wrench className="size-3" />
                          ) : (
                            <User className="size-3" />
                          )}
                          <span>{contactCategory}</span>
                          <Lock className="size-2.5 text-muted-foreground/80 opacity-70 ml-0.5" />
                          <ChevronDown className="size-3 opacity-60" />
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="start" className="w-48 bg-popover border-border shadow-lg">
                          <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b border-border/50">
                            <Lock className="size-3 text-amber-500" />
                            <span>Owner PIN Protected</span>
                          </div>
                          {(['Customer', 'Mechanic', 'Wholesaler', 'Distributor'] as const).map((cat) => (
                            <DropdownMenuItem
                              key={cat}
                              onClick={() =>
                                onSelectNewCategory(
                                  contact.id,
                                  contact.name || contact.phone,
                                  cat,
                                  contactCategory
                                )
                              }
                              className={`cursor-pointer text-xs font-medium flex items-center justify-between ${
                                contactCategory === cat ? 'bg-muted font-bold' : ''
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                {cat === 'Distributor' && <Building2 className="size-3.5 text-blue-500" />}
                                {cat === 'Wholesaler' && <Store className="size-3.5 text-purple-500" />}
                                {cat === 'Mechanic' && <Wrench className="size-3.5 text-amber-500" />}
                                {cat === 'Customer' && <User className="size-3.5 text-emerald-500" />}
                                {cat}
                              </span>
                              {contactCategory === cat && <Check className="size-3.5 text-emerald-500" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Live Udhaar / Balance Badge */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {dueAmount > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const isSupplier = contactCategory === 'Distributor' || contactCategory === 'Wholesaler';
                            if (isSupplier) {
                              router.push(
                                `/orders?search=${encodeURIComponent(
                                  contact.company || contact.phone || contact.name || uniqueCode || ''
                                )}`
                              );
                            } else {
                              router.push(
                                `/payments?tab=udhaar&search=${encodeURIComponent(
                                  contact.phone || contact.name || uniqueCode || ''
                                )}`
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/40 hover:bg-rose-500/25 transition-colors shadow-2xs cursor-pointer"
                          title={
                            contactCategory === 'Distributor' || contactCategory === 'Wholesaler'
                              ? 'Open Supplier Restock Orders & Wholesaler Ledger'
                              : 'Open BestPay Udhaar Ledger'
                          }
                        >
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>⚠️ ₹{dueAmount.toLocaleString('en-IN')} Due</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="size-3.5 shrink-0" />
                          <span>Settled ₹0</span>
                        </span>
                      )}
                    </TableCell>

                    {/* Tags */}
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags && contact.tags.length > 0 ? (
                          contact.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                        {contact.tags && contact.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{contact.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Created Date */}
                    <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">
                      {new Date(contact.created_at).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>

                    {/* 3-Line (☰ / ⋮) Quick-Redirect Action Menu */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-foreground hover:bg-muted"
                              title="Contact Quick Actions"
                            />
                          }
                        >
                          <MoreVertical className="size-4" />
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-56 bg-popover border-border shadow-xl">
                          {/* 1. Inbox (WhatsApp Chat) */}
                          <DropdownMenuItem
                            onClick={() => {
                              router.push(
                                `/inbox?phone=${encodeURIComponent(
                                  contact.phone
                                )}&name=${encodeURIComponent(contact.name || '')}`
                              );
                            }}
                            className="cursor-pointer text-popover-foreground hover:bg-muted font-medium py-2"
                          >
                            <MessageSquare className="mr-2 size-4 text-emerald-500" />
                            <span>💬 Inbox (WhatsApp Chat)</span>
                          </DropdownMenuItem>

                          {/* 2 & 3. Role-Based Quick Links: Wholesaler/Distributor -> Orders Ledger | Customer/Mechanic -> Payments */}
                          {contactCategory === 'Distributor' || contactCategory === 'Wholesaler' ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => {
                                  router.push(
                                    `/orders?search=${encodeURIComponent(
                                      contact.company || contact.phone || contact.name || uniqueCode || ''
                                    )}`
                                  );
                                }}
                                className="cursor-pointer text-popover-foreground hover:bg-muted font-medium py-2"
                              >
                                <Building2 className="mr-2 size-4 text-blue-500" />
                                <span>🏢 Supplier Purchase Ledger</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => {
                                  router.push(
                                    `/orders?search=${encodeURIComponent(
                                      contact.company || contact.phone || contact.name || uniqueCode || ''
                                    )}`
                                  );
                                }}
                                className="cursor-pointer text-popover-foreground hover:bg-muted font-medium py-2"
                              >
                                <AlertCircle className="mr-2 size-4 text-rose-500" />
                                <span>📒 Wholesaler Due / POs</span>
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem
                                onClick={() => {
                                  router.push(
                                    `/payments?search=${encodeURIComponent(
                                      contact.phone || contact.name || uniqueCode || ''
                                    )}`
                                  );
                                }}
                                className="cursor-pointer text-popover-foreground hover:bg-muted font-medium py-2"
                              >
                                <CreditCard className="mr-2 size-4 text-blue-500" />
                                <span>💳 Payments Ledger</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => {
                                  router.push(
                                    `/payments?tab=udhaar&search=${encodeURIComponent(
                                      contact.phone || contact.name || uniqueCode || ''
                                    )}`
                                  );
                                }}
                                className="cursor-pointer text-popover-foreground hover:bg-muted font-medium py-2"
                              >
                                <BookOpen className="mr-2 size-4 text-amber-500" />
                                <span>📒 Udhaar / Khata</span>
                              </DropdownMenuItem>
                            </>
                          )}

                          <DropdownMenuSeparator className="bg-border my-1" />

                          {/* Edit Contact */}
                          <DropdownMenuItem
                            onClick={() => openEditForm(contact)}
                            className="cursor-pointer text-popover-foreground hover:bg-muted"
                          >
                            <Pencil className="mr-2 size-4 text-muted-foreground" />
                            <span>{t('editAction')}</span>
                          </DropdownMenuItem>

                          {/* Delete Contact (Owner PIN Protected) */}
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => confirmDelete(contact)}
                            className="cursor-pointer text-red-500 hover:bg-red-500/10 flex items-center justify-between"
                          >
                            <span className="flex items-center">
                              <Trash2 className="mr-2 size-4" />
                              <span>{t('deleteAction')}</span>
                            </span>
                            <Lock className="size-3 text-red-400 opacity-80" />
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t('showingPagination', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalCount),
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {t('pageCount', { page: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
          fetchCategoryCounts();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={() => {
          fetchContacts();
          fetchCategoryCounts();
        }}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          fetchContacts();
          fetchCategoryCounts();
        }}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('deleteContactTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteContactDesc', { name: deleteTarget?.name || deleteTarget?.phone || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('deleteBulkTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteBulkDesc', { count: selected.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owner PIN Protection Modal */}
      <OwnerPinModal
        open={ownerPinOpen}
        onOpenChange={setOwnerPinOpen}
        title={ownerPinConfig.title}
        description={ownerPinConfig.description}
        onSuccess={ownerPinConfig.action}
      />
    </div>
  );
}
