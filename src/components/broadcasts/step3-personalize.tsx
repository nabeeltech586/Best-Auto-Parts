'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, CustomField, MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, ArrowRight, ImageIcon, Sparkles, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { extractTemplateVariables } from '@/lib/whatsapp/template-validators';
import { WhatsAppPhonePreview } from './whatsapp-phone-preview';

type VariableType = 'static' | 'field' | 'custom_field';

export interface VariableMapping {
  type: VariableType;
  value: string;
  fallback?: string;
}

interface Step3Props {
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  onUpdate: (variables: Record<string, VariableMapping>) => void;
  /** Media URL for an IMAGE/VIDEO/DOCUMENT header, when the template has one. */
  headerMediaUrl: string;
  onHeaderMediaUrlChange: (url: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;
type MediaHeaderType = (typeof MEDIA_HEADER_TYPES)[number];

function isMediaHeaderType(value: unknown): value is MediaHeaderType {
  return MEDIA_HEADER_TYPES.includes(value as MediaHeaderType);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const contactFields = [
  { value: 'name', labelKey: 'name' },
  { value: 'phone', labelKey: 'phone' },
  { value: 'email', labelKey: 'email' },
];

const SAMPLE_CONTACT: Contact = {
  id: 'sample',
  user_id: '',
  account_id: '',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  company: 'Acme Corp',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function Step3Personalize({
  template,
  variables,
  onUpdate,
  headerMediaUrl,
  onHeaderMediaUrlChange,
  onNext,
  onBack,
}: Step3Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [firstContact, setFirstContact] = useState<Contact | null>(null);
  const [firstContactCustomValues, setFirstContactCustomValues] = useState<
    Map<string, string>
  >(new Map());

  // Load user's custom fields + a representative contact for the
  // live preview. Fall back to sample data if no contacts exist yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [fieldsRes, contactRes] = await Promise.all([
        supabase.from('custom_fields').select('*').order('field_name'),
        supabase
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      setCustomFields(fieldsRes.data ?? []);
      setLoadingFields(false);

      const contact = contactRes.data ?? null;
      setFirstContact(contact);

      if (contact) {
        const { data: customVals } = await supabase
          .from('contact_custom_values')
          .select('custom_field_id, value')
          .eq('contact_id', contact.id);
        if (!cancelled) {
          const map = new Map<string, string>();
          for (const row of customVals ?? []) {
            map.set(row.custom_field_id, row.value ?? '');
          }
          setFirstContactCustomValues(map);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Positional {{1}} or named {{customer_name}} placeholders.
  const placeholders = useMemo(
    () => extractTemplateVariables(template.body_text).map((k) => `{{${k}}}`),
    [template.body_text],
  );

  // Auto-seed {{1}} or any name variable with "Contact Name (Auto-fill per recipient)"
  // and default fallback "Valued Customer"
  useEffect(() => {
    let changed = false;
    const nextVars: Record<string, VariableMapping> = { ...variables };

    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      if (!nextVars[key] || !nextVars[key].value) {
        if (key === '1' || key.toLowerCase().includes('name')) {
          nextVars[key] = {
            type: 'field',
            value: 'name',
            fallback: 'Valued Customer',
          };
          changed = true;
        }
      }
    }

    if (changed) {
      onUpdate(nextVars);
    }
  }, [placeholders]);

  // Templates with an IMAGE/VIDEO/DOCUMENT header need a media URL at
  // send time — Meta requires the media component on every delivery and
  // rejects the broadcast without it. The field is hidden for text-only
  // headers.
  const mediaHeaderType = isMediaHeaderType(template.header_type)
    ? template.header_type
    : null;

  // Seed the field with the template's stored sample URL the first time
  // we land on a media-header template, so the common "reuse the
  // approved media" case needs no typing. Only seeds when empty to avoid
  // clobbering a URL the user already edited.
  useEffect(() => {
    if (mediaHeaderType && !headerMediaUrl && template.header_media_url) {
      onHeaderMediaUrlChange(template.header_media_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaHeaderType, template.header_media_url]);

  const headerMediaError = useMemo<'missing' | 'invalid' | null>(() => {
    if (!mediaHeaderType) return null;
    const value = headerMediaUrl.trim();
    if (!value) return 'missing';
    if (!isValidHttpUrl(value)) return 'invalid';
    return null;
  }, [mediaHeaderType, headerMediaUrl]);

  /**
   * A placeholder is "unmapped" if the user hasn't picked either a
   * static value or a field/custom-field source. Blocks Next until
   * every placeholder has something — otherwise the broadcast would
   * ship with empty strings and confuse recipients.
   */
  const unmappedKeys = useMemo(() => {
    const missing: string[] = [];
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      if (!mapping || !mapping.value?.trim()) {
        missing.push(placeholder);
      }
    }
    return missing;
  }, [placeholders, variables]);

  function updateVariable(key: string, patch: Partial<VariableMapping>) {
    const current = variables[key] ?? { type: 'static' as VariableType, value: '' };
    onUpdate({
      ...variables,
      [key]: { ...current, ...patch },
    });
  }

  /**
   * Substitute placeholders using the first real contact where
   * possible. Placeholders keyed by "{{N}}" or "{{name}}" map to
   * variable key "N" / "name".
   */
  const previewText = useMemo(() => {
    const contact = firstContact ?? {
      ...SAMPLE_CONTACT,
      name: t('personalize.sampleName'),
      company: t('personalize.sampleCompany'),
    };
    const customValues = firstContact
      ? firstContactCustomValues
      : new Map<string, string>();

    let text = template.body_text;
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      let replacement = placeholder;

      if (mapping) {
        if (mapping.type === 'static' && mapping.value) {
          replacement = mapping.value;
        } else if (mapping.type === 'field' && mapping.value) {
          const contactName = contact.name?.trim() || mapping.fallback || 'Valued Customer';
          const fieldMap: Record<string, string | undefined> = {
            name: contactName,
            phone: contact.phone,
            email: contact.email,
            company: contact.company,
          };
          replacement = fieldMap[mapping.value] ?? (mapping.fallback || placeholder);
        } else if (mapping.type === 'custom_field' && mapping.value) {
          replacement = customValues.get(mapping.value) || mapping.fallback || placeholder;
        }
      }
      text = text.replaceAll(placeholder, replacement);
    }
    return text;
  }, [
    template.body_text,
    variables,
    placeholders,
    firstContact,
    firstContactCustomValues,
    t,
  ]);

  const previewLabel = firstContact
    ? firstContact.name || firstContact.phone
    : t('personalize.previewSample');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('personalize.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('personalize.subtitle')}
        </p>
      </div>

      {mediaHeaderType && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">{t('personalize.headerImage')}</p>
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">
              {mediaHeaderType}
            </span>
          </div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t('personalize.imageUrl')}
          </label>
          <Input
            type="url"
            value={headerMediaUrl}
            onChange={(e) => onHeaderMediaUrlChange(e.target.value)}
            placeholder={t('personalize.imageUrlPlaceholder')}
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('personalize.headerImageDesc')}
          </p>
          {mediaHeaderType === 'image' &&
            headerMediaError === null &&
            headerMediaUrl.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerMediaUrl.trim()}
                alt={t('personalize.headerPreviewAlt')}
                className="mt-3 max-h-40 rounded-lg border border-border object-contain"
              />
            )}
          {headerMediaError && (
            <p className="mt-1.5 text-xs text-amber-300">
              {headerMediaError === 'missing'
                ? t('personalize.mediaUrlRequired')
                : t('personalize.mediaUrlInvalid')}
            </p>
          )}
        </div>
      )}

      {placeholders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-xs">
              <span className="font-semibold text-foreground">Zero-Effort Auto-Name Personalization</span>
              <p className="text-muted-foreground text-[11px]">
                Automatically populates each customer&apos;s real name with a respectful &quot;Valued Customer&quot; fallback.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const updated: Record<string, VariableMapping> = { ...variables };
              for (const p of placeholders) {
                const k = p.replace(/^\{\{|\}\}$/g, '');
                if (k === '1' || k.toLowerCase().includes('name')) {
                  updated[k] = { type: 'field', value: 'name', fallback: 'Valued Customer' };
                }
              }
              onUpdate(updated);
            }}
            className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium shrink-0 gap-1.5 shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto-Fill Customer Name
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_340px] gap-6 items-start">
        {/* Left Column: Placeholders Form & Media */}
        <div className="space-y-4">
          {placeholders.length === 0 && !mediaHeaderType ? (
            <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t('personalize.noPreview')}
              </p>
            </div>
          ) : placeholders.length === 0 ? null : (
            <div className="space-y-4">
              {placeholders.map((placeholder) => {
                const key = placeholder.replace(/^\{\{|\}\}$/g, '');
                const mapping = variables[key] ?? { type: 'static', value: '' };

                return (
                  <div
                    key={placeholder}
                    className="rounded-xl border border-border bg-card/50 p-4"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                        {placeholder}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          {t('personalize.type')}
                        </label>
                        <Select
                          value={mapping.type}
                          onValueChange={(val) =>
                            updateVariable(key, {
                              type: val as VariableType,
                              value: val === 'field' ? 'name' : '',
                              fallback: val === 'field' ? 'Valued Customer' : undefined,
                            })
                          }
                        >
                          <SelectTrigger className="w-full border-border bg-muted text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-border bg-popover">
                            <SelectItem value="static">{t('personalize.typeStatic')}</SelectItem>
                            <SelectItem value="field">{t('personalize.typeContact')}</SelectItem>
                            <SelectItem value="custom_field">
                              {t('personalize.typeCustom')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          {mapping.type === 'static' ? t('personalize.staticValue') : t('personalize.contactField')}
                        </label>
                        {mapping.type === 'static' ? (
                          <Input
                            value={mapping.value}
                            onChange={(e) =>
                              updateVariable(key, { value: e.target.value })
                            }
                            placeholder={t('personalize.enterValue')}
                            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                          />
                        ) : mapping.type === 'field' ? (
                          <Select
                            value={mapping.value || undefined}
                            onValueChange={(val) =>
                              updateVariable(key, {
                                value: val || '',
                                fallback: val === 'name' ? (mapping.fallback ?? 'Valued Customer') : undefined,
                              })
                            }
                          >
                            <SelectTrigger className="w-full border-border bg-muted text-foreground">
                              <SelectValue placeholder={t('personalize.selectContactField')} />
                            </SelectTrigger>
                            <SelectContent className="border-border bg-popover">
                              {contactFields.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {t(`personalize.fieldMap.${field.labelKey}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            value={mapping.value || undefined}
                            onValueChange={(val) =>
                              updateVariable(key, { value: val || '' })
                            }
                          >
                            <SelectTrigger className="w-full border-border bg-muted text-foreground">
                              <SelectValue
                                placeholder={
                                  loadingFields
                                    ? t('personalize.loadingFields')
                                    : customFields.length === 0
                                      ? t('personalize.noCustomFields')
                                      : t('personalize.selectCustomField')
                                }
                              />
                            </SelectTrigger>
                            <SelectContent className="border-border bg-popover">
                              {customFields.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.field_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Fallback name input for Contact Name dynamic mapping */}
                      {mapping.type === 'field' && mapping.value === 'name' && (
                        <div className="sm:col-span-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 mt-1">
                          <div className="flex items-center justify-between text-xs">
                            <label className="font-medium text-foreground flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-primary" />
                              Fallback Name (if contact name is blank)
                            </label>
                            <span className="text-[11px] text-muted-foreground">Default: Valued Customer</span>
                          </div>
                          <Input
                            value={mapping.fallback ?? 'Valued Customer'}
                            onChange={(e) => updateVariable(key, { fallback: e.target.value })}
                            placeholder="Valued Customer"
                            className="mt-1.5 h-8 text-xs bg-background border-border font-medium"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Every recipient with a name saved in CRM receives their real name. If no name is found, &quot;{mapping.fallback || 'Valued Customer'}&quot; is sent.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Realistic Live WhatsApp Phone Mockup */}
        <div className="flex flex-col items-center">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 text-primary" />
            Live Preview ({previewLabel})
          </p>
          <WhatsAppPhonePreview
            businessName="Best Auto Parts"
            bodyText={previewText}
            headerType={mediaHeaderType}
            headerMediaUrl={headerMediaUrl}
            footerText={template.footer_text || 'Best Auto Parts (Saharanpur) | +91 96347 22174'}
            buttons={
              template.buttons as unknown as Array<{
                type: string;
                text: string;
                url?: string;
                phone_number?: string;
              }>
            }
            recipientName={firstContact?.name || 'Valued Customer'}
          />
        </div>
      </div>

      {unmappedKeys.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {t.rich('personalize.unmappedWarning', {
            keys: unmappedKeys.join(', '),
            mono: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={unmappedKeys.length > 0 || headerMediaError !== null}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
