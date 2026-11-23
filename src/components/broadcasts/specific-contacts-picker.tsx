'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, Tag } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  Check,
  X,
  UserCheck,
  Users,
  Wrench,
  Star,
  CheckSquare,
  Square,
  Loader2,
  Clock,
  Bike,
} from 'lucide-react';

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

interface SpecificContactsPickerProps {
  selectedContactIds: string[];
  onChange: (contactIds: string[]) => void;
}

export function SpecificContactsPicker({
  selectedContactIds,
  onChange,
}: SpecificContactsPickerProps) {
  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'mechanics' | 'vip' | 'bajaj' | 'hero' | 'honda' | 'udhaar'>('all');

  // Load contacts and their tags
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const supabase = createClient();

        // 1. Fetch tags
        const { data: tagRows } = await supabase.from('tags').select('*').order('name');

        // 2. Fetch all contacts
        const { data: contactRows, error } = await supabase
          .from('contacts')
          .select('*')
          .order('name', { ascending: true });

        if (error || !contactRows) {
          setLoading(false);
          return;
        }

        // 3. Fetch contact tags
        const contactIds = contactRows.map((c) => c.id);
        const { data: ctRows } = await supabase
          .from('contact_tags')
          .select('contact_id, tag_id')
          .in('contact_id', contactIds);

        const tagsMap = new Map((tagRows ?? []).map((t) => [t.id, t]));
        const contactTagsMap = new Map<string, Tag[]>();

        for (const ct of ctRows ?? []) {
          const t = tagsMap.get(ct.tag_id);
          if (t) {
            const list = contactTagsMap.get(ct.contact_id) ?? [];
            list.push(t);
            contactTagsMap.set(ct.contact_id, list);
          }
        }

        const enriched: ContactWithTags[] = contactRows.map((c) => ({
          ...c,
          tags: contactTagsMap.get(c.id) ?? [],
        }));

        if (!cancelled) {
          setContacts(enriched);
        }
      } catch (err) {
        console.error('Error fetching contacts in picker:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filter contacts by search & quick pills
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // 1. Text Search
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = c.name?.toLowerCase().includes(q) ?? false;
      const phoneMatch = c.phone?.toLowerCase().includes(q) ?? false;
      if (q && !nameMatch && !phoneMatch) return false;

      // 2. Quick Filter Pill
      if (activeFilter === 'all') return true;

      const tagNames = (c.tags ?? []).map((t) => t.name.toLowerCase());

      if (activeFilter === 'mechanics') {
        return tagNames.some((n) => n.includes('mechanic') || n.includes('ustad'));
      }
      if (activeFilter === 'vip') {
        return tagNames.some((n) => n.includes('vip') || n.includes('regular'));
      }
      if (activeFilter === 'bajaj') {
        return tagNames.some((n) => n.includes('bajaj'));
      }
      if (activeFilter === 'hero') {
        return tagNames.some((n) => n.includes('hero') || n.includes('hreo'));
      }
      if (activeFilter === 'honda') {
        return tagNames.some((n) => n.includes('honda'));
      }
      if (activeFilter === 'udhaar') {
        return tagNames.some((n) => n.includes('udhaar') || n.includes('pending'));
      }

      return true;
    });
  }, [contacts, searchQuery, activeFilter]);

  // Selected contact objects for quick chips
  const selectedContacts = useMemo(() => {
    const set = new Set(selectedContactIds);
    return contacts.filter((c) => set.has(c.id));
  }, [contacts, selectedContactIds]);

  const toggleContact = (id: string) => {
    if (selectedContactIds.includes(id)) {
      onChange(selectedContactIds.filter((item) => item !== id));
    } else {
      onChange([...selectedContactIds, id]);
    }
  };

  const selectAllFiltered = () => {
    const filteredIds = filteredContacts.map((c) => c.id);
    const combined = Array.from(new Set([...selectedContactIds, ...filteredIds]));
    onChange(combined);
  };

  const clearSelection = () => {
    onChange([]);
  };

  const removeContact = (id: string) => {
    onChange(selectedContactIds.filter((item) => item !== id));
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
      {/* Top Controls: Search & Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name or phone..."
            className="pl-8 text-xs bg-muted border-border"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAllFiltered}
            disabled={filteredContacts.length === 0}
            className="h-8 text-xs gap-1 border-border"
          >
            <CheckSquare className="h-3.5 w-3.5 text-primary" />
            Select All Filtered ({filteredContacts.length})
          </Button>

          {selectedContactIds.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Clear ({selectedContactIds.length})
            </Button>
          )}
        </div>
      </div>

      {/* Quick Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-3 w-3" />
          All ({contacts.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('mechanics')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeFilter === 'mechanics'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-pink-500/10 text-pink-500 hover:bg-pink-500/20'
          }`}
        >
          <Wrench className="h-3 w-3" />
          Mechanics / Ustads
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('vip')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeFilter === 'vip'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
          }`}
        >
          <Star className="h-3 w-3" />
          VIP / Regulars
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('bajaj')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeFilter === 'bajaj'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20'
          }`}
        >
          <Bike className="h-3 w-3" />
          Bajaj Bike
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('hero')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeFilter === 'hero'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
          }`}
        >
          <Bike className="h-3 w-3" />
          Hero Bike
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('honda')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeFilter === 'honda'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
          }`}
        >
          <Bike className="h-3 w-3" />
          Honda Bike
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('udhaar')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeFilter === 'udhaar'
              ? 'bg-red-600 text-white shadow-xs'
              : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
          }`}
        >
          <span>₹</span>
          Udhaar Pending
        </button>
      </div>

      {/* Selected Contact Chips Carousel/Bar */}
      {selectedContacts.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-primary mb-1.5">
            <span className="flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              {selectedContacts.length} Selected Recipient{selectedContacts.length > 1 ? 's' : ''}
            </span>
            <span className="text-[11px] text-muted-foreground">Click chip to remove</span>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {selectedContacts.map((c) => (
              <span
                key={c.id}
                onClick={() => removeContact(c.id)}
                className="inline-flex items-center gap-1 rounded-full bg-card border border-primary/30 px-2 py-0.5 text-xs text-foreground cursor-pointer hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                title="Click to remove"
              >
                <span className="font-medium truncate max-w-[120px]">{c.name || c.phone}</span>
                <X className="h-3 w-3 shrink-0 opacity-70" />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contact Checklist */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading CRM contacts...
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-muted-foreground">No contacts match the current filter or search.</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {filteredContacts.map((contact) => {
              const isSelected = selectedContactIds.includes(contact.id);
              const formattedDate = contact.updated_at
                ? new Date(contact.updated_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'Recent';

              return (
                <div
                  key={contact.id}
                  onClick={() => toggleContact(contact.id)}
                  className={`flex items-center justify-between p-2.5 transition-colors cursor-pointer hover:bg-muted/60 ${
                    isSelected ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 text-primary">
                      {isSelected ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground/50 hover:text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {contact.name || 'Unnamed Customer'}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground truncate">
                          {contact.phone}
                        </span>
                      </div>

                      {/* Tag Badges */}
                      {contact.tags && contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {contact.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center rounded-md px-1.5 py-0.2 text-[10px] font-medium"
                              style={{
                                backgroundColor: `${tag.color}15`,
                                color: tag.color,
                                border: `1px solid ${tag.color}30`,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right text-[11px] text-muted-foreground flex items-center gap-1 pl-2">
                    <Clock className="h-3 w-3 opacity-60" />
                    <span>{formattedDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
