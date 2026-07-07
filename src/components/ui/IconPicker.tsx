import { useState } from 'react';
import { useBackClose } from '../../hooks/useHardwareBack';
import type { LucideIcon } from 'lucide-react';
import { useT } from '../../i18n';
import {
  Rocket, Lightbulb, Target, FileText, Palette, Zap, Star, Settings, BookOpen, Briefcase,
  Gamepad2, Home, Sparkles, Flame, Gem, Gift, Code2, LineChart, CalendarDays, Dumbbell,
  Music, Heart, Coffee, GraduationCap, ShoppingCart, Plane, Phone, Camera, PenTool, Brain,
  Languages, Wallet, Bike, Utensils, X, Check,
} from 'lucide-react';

// Curated task icons (key → lucide component). Keys are persisted on the session.
export const ICONS: { key: string; Comp: LucideIcon }[] = [
  { key: 'rocket', Comp: Rocket }, { key: 'idea', Comp: Lightbulb }, { key: 'target', Comp: Target },
  { key: 'doc', Comp: FileText }, { key: 'art', Comp: Palette }, { key: 'zap', Comp: Zap },
  { key: 'star', Comp: Star }, { key: 'settings', Comp: Settings }, { key: 'book', Comp: BookOpen },
  { key: 'work', Comp: Briefcase }, { key: 'game', Comp: Gamepad2 }, { key: 'home', Comp: Home },
  { key: 'sparkles', Comp: Sparkles }, { key: 'fire', Comp: Flame }, { key: 'gem', Comp: Gem },
  { key: 'gift', Comp: Gift }, { key: 'code', Comp: Code2 }, { key: 'chart', Comp: LineChart },
  { key: 'calendar', Comp: CalendarDays }, { key: 'gym', Comp: Dumbbell }, { key: 'music', Comp: Music },
  { key: 'heart', Comp: Heart }, { key: 'coffee', Comp: Coffee }, { key: 'study', Comp: GraduationCap },
  { key: 'shop', Comp: ShoppingCart }, { key: 'travel', Comp: Plane }, { key: 'call', Comp: Phone },
  { key: 'photo', Comp: Camera }, { key: 'write', Comp: PenTool }, { key: 'brain', Comp: Brain },
  { key: 'lang', Comp: Languages }, { key: 'money', Comp: Wallet }, { key: 'bike', Comp: Bike },
  { key: 'food', Comp: Utensils },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(ICONS.map(i => [i.key, i.Comp]));

/** Renders a session icon by key, or nothing when the key is unknown/empty. */
export function SessionIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null;
  const C = ICON_MAP[name];
  return C ? <C className={className} /> : null;
}

/** Trigger + custom modal grid for picking a session icon. */
export function IconPicker({ value, color = '#8b5cf6', onChange }: { value?: string; color?: string; onChange: (key: string | undefined) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useBackClose(open, () => setOpen(false));
  const Current = value ? ICON_MAP[value] : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 flex items-center gap-2.5 text-[14px] hover:border-[var(--border)] transition-colors">
        <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0" style={{ background: `${color}1f`, color }}>
          {Current ? <Current className="w-4 h-4" /> : <Sparkles className="w-4 h-4 text-[var(--text-dim)]" />}
        </span>
        <span className={value ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}>{value ? t('ip.selected') : t('ip.choose')}</span>
        <span className="ml-auto text-[11px] text-[var(--text-dim)]">{value ? t('ip.change') : ''}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm anim-fade" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm card overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[13px] font-bold text-[var(--text)]">{t('ip.title')}</span>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-[var(--border)] grid place-items-center text-[var(--text-dim)]"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-4 grid grid-cols-6 gap-2 max-h-[320px] overflow-y-auto">
              {/* none */}
              <button onClick={() => { onChange(undefined); setOpen(false); }}
                className={`aspect-square rounded-xl grid place-items-center border transition-all ${!value ? 'border-[var(--primary)] bg-[var(--primary)]/15' : 'border-[var(--border)] hover:border-[var(--border)]'}`}>
                <span className="text-[11px] font-bold text-[var(--text-dim)]">{t('ip.none')}</span>
              </button>
              {ICONS.map(({ key, Comp }) => {
                const sel = value === key;
                return (
                  <button key={key} onClick={() => { onChange(key); setOpen(false); }}
                    className={`relative aspect-square rounded-xl grid place-items-center border transition-all ${sel ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--primary)]/40 hover:text-[var(--text)]'}`}
                    style={sel ? { color } : undefined}>
                    <Comp className="w-5 h-5" />
                    {sel && <Check className="w-3 h-3 text-[var(--primary)] absolute top-1 right-1" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
