'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Sparkles,
  MapPin,
  Wrench,
  PhoneCall,
  Check,
  Send,
  Loader2,
  HelpCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { META_ICEBREAKERS, type IcebreakerDef } from '@/lib/whatsapp/icebreakers';

export function IcebreakersPanel() {
  const [icebreakers, setIcebreakers] = useState<IcebreakerDef[]>(
    Object.values(META_ICEBREAKERS)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    Object.values(META_ICEBREAKERS).forEach((item) => {
      init[item.id] = item.responseTemplate;
    });
    return init;
  });

  // Simulator state
  const [simulateText, setSimulateText] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simulateResult, setSimulateResult] = useState<{
    matched: boolean;
    icebreaker: IcebreakerDef | null;
  } | null>(null);

  const handleSave = async (id: string) => {
    const newText = editTexts[id];
    if (!newText?.trim()) {
      toast.error('Response template cannot be empty');
      return;
    }

    try {
      const res = await fetch('/api/automations/icebreakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_response',
          icebreakerKey: id,
          updatedResponse: newText.trim(),
        }),
      });

      if (res.ok) {
        toast.success('Icebreaker English response updated successfully');
        setEditingId(null);
      } else {
        toast.error('Failed to update response template');
      }
    } catch {
      toast.error('Error saving icebreaker response');
    }
  };

  const handleSimulate = async () => {
    if (!simulateText.trim()) return;
    setSimulating(true);
    try {
      const res = await fetch('/api/automations/icebreakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_match',
          text: simulateText.trim(),
        }),
      });
      const data = await res.json();
      setSimulateResult(data);
    } catch {
      toast.error('Simulation check failed');
    } finally {
      setSimulating(false);
    }
  };

  const getIcon = (id: string) => {
    switch (id) {
      case 'icebreaker_1_rate_check':
        return <Sparkles className="size-4 text-emerald-500" />;
      case 'icebreaker_2_shop_location':
        return <MapPin className="size-4 text-blue-500" />;
      case 'icebreaker_3_wholesale_mechanic':
        return <Wrench className="size-4 text-amber-500" />;
      case 'icebreaker_4_saud_bhai_call':
        return <PhoneCall className="size-4 text-purple-500" />;
      default:
        return <Sparkles className="size-4 text-primary" />;
    }
  };

  const getActionBadge = (id: string) => {
    switch (id) {
      case 'icebreaker_1_rate_check':
        return (
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
            AI Agent Active • English
          </Badge>
        );
      case 'icebreaker_2_shop_location':
        return (
          <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10">
            Address & Maps Pin
          </Badge>
        );
      case 'icebreaker_3_wholesale_mechanic':
        return (
          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10">
            Auto-Tag: Wholesale / Mechanic
          </Badge>
        );
      case 'icebreaker_4_saud_bhai_call':
        return (
          <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10">
            Human Handoff • Saud Bhai Alert
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Meta WhatsApp Manager Icebreakers & Quick Replies
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                4 standard Meta icebreakers mapped to Best Auto Parts (Kailashpur, Saharanpur).
                These ALWAYS respond immediately in English and bypass Out-of-Office suppression.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit text-xs">
              4 Active Triggers
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Simulator Test Bar */}
      <Card className="border-border bg-card/60">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-primary" />
              Test Customer Message Matcher
            </span>
            <span className="text-[11px] text-muted-foreground">
              Simulates text & interactive tap matching
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder='Try: "bhai rate check karna hai", "shop location", "saud bhai baat karein", or "mechanic"'
              value={simulateText}
              onChange={(e) => setSimulateText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSimulate()}
              className="text-xs bg-background"
            />
            <Button
              size="sm"
              onClick={handleSimulate}
              disabled={simulating || !simulateText.trim()}
              className="text-xs gap-1.5 shrink-0"
            >
              {simulating ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Test Match
            </Button>
          </div>

          {simulateResult && (
            <div
              className={`rounded-lg p-3 text-xs border ${
                simulateResult.matched
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-muted bg-muted/40 text-muted-foreground'
              }`}
            >
              {simulateResult.matched ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Check className="size-4 text-emerald-500" />
                    Matched: {simulateResult.icebreaker?.name}
                  </div>
                  <p className="text-[11px] opacity-90 pl-6 whitespace-pre-line font-mono bg-background/50 p-2 rounded">
                    {simulateResult.icebreaker?.responseTemplate}
                  </p>
                </div>
              ) : (
                <p>No icebreaker matched for &quot;{simulateText}&quot;. Inbound will be processed by standard conversational AI or menu.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* The 4 Icebreaker Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {icebreakers.map((item, idx) => {
          const isEditing = editingId === item.id;
          return (
            <Card key={item.id} className="border-border bg-card shadow-sm flex flex-col justify-between">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg p-1.5 bg-muted/70 shrink-0">
                      {getIcon(item.id)}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        #{idx + 1} {item.name}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Button Label in Meta: &quot;{item.buttonTitle}&quot;
                      </p>
                    </div>
                  </div>
                  {getActionBadge(item.id)}
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="text-[10px] text-muted-foreground self-center mr-1">
                      Keywords:
                    </span>
                    {item.keywords.slice(0, 4).map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 bg-muted/30">
                        {kw}
                      </Badge>
                    ))}
                    {item.keywords.length > 4 && (
                      <span className="text-[9px] text-muted-foreground self-center">
                        +{item.keywords.length - 4} more
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-foreground">
                      English Automated Response:
                    </span>
                    {isEditing ? (
                      <Textarea
                        rows={5}
                        value={editTexts[item.id]}
                        onChange={(e) =>
                          setEditTexts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="text-xs font-mono bg-background"
                      />
                    ) : (
                      <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs text-foreground whitespace-pre-line font-sans leading-relaxed">
                        {editTexts[item.id]}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(editTexts[item.id]);
                      toast.success('Response copied to clipboard');
                    }}
                    className="h-7 text-xs gap-1"
                  >
                    <Copy className="size-3" />
                    Copy
                  </Button>

                  {isEditing ? (
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(null)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(item.id)}
                        className="h-7 text-xs gap-1"
                      >
                        <Check className="size-3" />
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(item.id)}
                      className="h-7 text-xs"
                    >
                      Edit Response
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
