'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ArrowRight, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { WhatsAppPhonePreview } from './whatsapp-phone-preview';

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Utility: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Authentication: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

interface Step1Props {
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1ChooseTemplate({ selectedTemplate, onSelect, onNext, onBack }: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        // Only APPROVED templates can be sent via Meta — anything else
        // would 400 at broadcast time. Hide them rather than letting
        // the user pick a template that will fail.
        const { data, error: fetchError } = await supabase
          .from('message_templates')
          .select('*')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setTemplates(data ?? []);
        if (data && data.length > 0 && !selectedTemplate) {
          onSelect(data[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('chooseTemplate.errorLoad'));
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('chooseTemplate.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('chooseTemplate.subtitle')}
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('chooseTemplate.noTemplates')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('chooseTemplate.createFirst')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          {/* Template Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templates.map((template) => {
              const isSelected = selectedTemplate?.id === template.id;
              const catColor = categoryColors[template.category] ?? categoryColors.Utility;

              return (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border bg-card/50 hover:border-border hover:bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                    >
                      {template.category}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-xs text-muted-foreground">{template.body_text}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{template.language ?? 'en_US'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Live WhatsApp Phone Preview */}
          {selectedTemplate && (
            <div className="flex flex-col items-center">
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-primary" />
                Live Customer WhatsApp Preview
              </p>
              <WhatsAppPhonePreview
                businessName="Best Auto Parts"
                bodyText={selectedTemplate.body_text.replace(/\{\{1\}\}/g, 'Saud Bhai')}
                headerType={selectedTemplate.header_type}
                headerMediaUrl={selectedTemplate.header_media_url}
                footerText={selectedTemplate.footer_text || 'Best Auto Parts (Saharanpur) | +91 96347 22174'}
                buttons={
                  selectedTemplate.buttons as unknown as Array<{
                    type: string;
                    text: string;
                    url?: string;
                    phone_number?: string;
                  }>
                }
                recipientName="Saud Bhai"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
