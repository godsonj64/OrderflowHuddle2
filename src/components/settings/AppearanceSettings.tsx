import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, ImagePlus, LayoutGrid, List, Rows3, Upload, X } from 'lucide-react';
import type { AnnouncementTone, CornerStyle, HeroStyle, MenuLayout, RestaurantProfile, StorefrontTheme, SurfaceMode } from '../../types';
import { FONT_PAIRINGS, SURFACES, THEME_PRESETS, ensureFontLoaded, isHexColor, resolveTheme, themeWarnings } from '../../lib/theme';
import { resizeWithPreset } from '../../utils/imageUpload';
import { Field, Spinner, Toggle, adminInput } from '../ui';

interface Props {
  draft: RestaurantProfile;
  update: (patch: Partial<RestaurantProfile>) => void;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-gray-100 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-bold">{title}</h3>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: React.ElementType }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-xs font-semibold transition ${
            value === v ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          {Icon && <Icon size={18} />}
          {label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="w-12 h-11 rounded-xl border border-gray-200 p-1 bg-white cursor-pointer" aria-label={`${label} picker`} />
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const hex = v.startsWith('#') ? v : `#${v}`;
            if (isHexColor(hex)) onChange(hex.toUpperCase());
          }}
          className={`${adminInput} font-mono uppercase`}
          maxLength={7}
          aria-label={`${label} hex`}
        />
      </div>
    </Field>
  );
}

function ImageStrip({ images, onAdd, onRemove, max, tall = false, busy }: { images: string[]; onAdd: (files: FileList) => void; onRemove: (i: number) => void; max: number; tall?: boolean; busy: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((url, i) => (
        <div key={i} className={`relative ${tall ? 'w-28 h-20' : 'w-24 h-12'} rounded-xl overflow-hidden border border-gray-200 bg-gray-50`}>
          <img src={url} alt="" className={`w-full h-full ${tall ? 'object-cover' : 'object-contain p-1'}`} />
          <button type="button" onClick={() => onRemove(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center" aria-label="Remove image">
            <X size={12} />
          </button>
        </div>
      ))}
      {images.length < max && (
        <label className={`${tall ? 'w-28 h-20' : 'w-24 h-12'} rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-gray-500 cursor-pointer hover:bg-gray-50`}>
          {busy ? <Spinner size={16} /> : <ImagePlus size={16} />}
          Add
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && onAdd(e.target.files)} />
        </label>
      )}
    </div>
  );
}

export function AppearanceSettings({ draft, update }: Props) {
  const theme = resolveTheme(draft.theme);
  const warnings = themeWarnings(theme);
  const [uploading, setUploading] = useState<string | null>(null);

  const setTheme = (patch: Partial<StorefrontTheme>) => update({ theme: { ...(draft.theme || {}), ...patch } });

  const applyPreset = (id: string) => {
    const p = THEME_PRESETS.find((x) => x.id === id);
    if (!p) return;
    ensureFontLoaded(p.font);
    setTheme({ preset: p.id, brandColor: p.brandColor, accentColor: p.accentColor, mode: p.mode, font: p.font, corners: p.corners });
  };

  const upload = async (kind: 'banner' | 'promoBanner' | 'marquee' | 'gallery', files: FileList | File[]) => {
    setUploading(kind);
    try {
      const list = Array.from(files);
      if (kind === 'banner') {
        const converted = await resizeWithPreset(list[0], 'banner');
        update({ bannerUrl: converted });
        toast.success('Banner converted to WebP');
      } else if (kind === 'promoBanner') {
        const converted = await resizeWithPreset(list[0], 'banner');
        setTheme({ promoBannerUrl: converted });
        toast.success('Promo banner converted to WebP');
      } else {
        const key = kind === 'marquee' ? 'marqueeImageUrls' : 'galleryImageUrls';
        const existing = (draft[key] as string[] | undefined) || [];
        const room = 12 - existing.length;
        const urls: string[] = [];
        for (const f of list.slice(0, room)) urls.push(await resizeWithPreset(f, kind));
        update({ [key]: [...existing, ...urls] } as Partial<RestaurantProfile>);
        if (urls.length > 0) toast.success(`${urls.length} image${urls.length > 1 ? 's' : ''} converted to WebP`);
        if (list.length > room) toast('Only 12 images are allowed here.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that image.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Theme" description="Start from a preset, then fine-tune colors and style below.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {THEME_PRESETS.map((p) => {
            const s = SURFACES[p.mode];
            const active = theme.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`text-left rounded-2xl border p-2.5 transition ${active ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-200 hover:border-gray-400'}`}
              >
                <div className="h-14 rounded-xl flex items-end gap-1 p-1.5" style={{ background: s.page, border: `1px solid ${s.line}` }}>
                  <span className="w-6 h-6 rounded-full" style={{ background: p.brandColor }} />
                  <span className="w-4 h-4 rounded-full" style={{ background: p.accentColor }} />
                  <span className="ml-auto w-8 h-4 rounded" style={{ background: s.card }} />
                </div>
                <div className="mt-1.5 text-sm font-bold">{p.name}</div>
                <div className="text-[11px] text-gray-500 leading-tight">{p.description}</div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Colors & style">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ColorField label="Brand color (buttons, highlights)" value={theme.brandColor} onChange={(v) => setTheme({ brandColor: v })} />
          <ColorField label="Accent color" value={theme.accentColor} onChange={(v) => setTheme({ accentColor: v })} />
        </div>
        {warnings.map((w) => (
          <p key={w} className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {w}
          </p>
        ))}
        <Field label="Background">
          <Choice<SurfaceMode>
            value={theme.mode}
            onChange={(mode) => setTheme({ mode })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'warm', label: 'Warm' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>
        <Field label="Font">
          <select
            value={theme.font}
            onChange={(e) => {
              ensureFontLoaded(e.target.value);
              setTheme({ font: e.target.value });
            }}
            className={adminInput}
          >
            {FONT_PAIRINGS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Corners">
          <Choice<CornerStyle>
            value={theme.corners}
            onChange={(corners) => setTheme({ corners })}
            options={[
              { value: 'sharp', label: 'Sharp' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'pill', label: 'Pill' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Menu layout" description="List works best on phones for long menus; Compact suits menus without photos.">
        <Choice<MenuLayout>
          value={theme.menuLayout}
          onChange={(menuLayout) => setTheme({ menuLayout })}
          options={[
            { value: 'grid', label: 'Photo grid', icon: LayoutGrid },
            { value: 'list', label: 'List', icon: List },
            { value: 'compact', label: 'Compact', icon: Rows3 },
          ]}
        />
        <div className="divide-y divide-gray-100">
          <Toggle label="Search bar" checked={theme.showSearch} onChange={(v) => setTheme({ showSearch: v })} />
          <Toggle label="Featured row" description="Items you mark as Featured plus your best sellers." checked={theme.showFeatured} onChange={(v) => setTheme({ showFeatured: v })} />
          {theme.showFeatured && (
            <div className="py-3">
              <input value={theme.featuredTitle} onChange={(e) => setTheme({ featuredTitle: e.target.value.slice(0, 40) })} className={adminInput} placeholder="Featured row title" aria-label="Featured row title" />
            </div>
          )}
          <Toggle label="Ratings" checked={theme.showRatings} onChange={(v) => setTheme({ showRatings: v })} />
          <Toggle label="Prep time on items" checked={theme.showPrepTime} onChange={(v) => setTheme({ showPrepTime: v })} />
          <Toggle label="Calories on items" checked={theme.showCalories} onChange={(v) => setTheme({ showCalories: v })} />
          <Toggle label="“Powered by OrderFlow” badge" checked={theme.showPoweredBy} onChange={(v) => setTheme({ showPoweredBy: v })} />
        </div>
      </Section>

      <Section title="Header banner" description="Full-width image or brand banner at the top of the storefront.">
        <Choice<HeroStyle>
          value={theme.heroStyle}
          onChange={(heroStyle) => setTheme({ heroStyle })}
          options={[
            { value: 'image', label: 'Photo' },
            { value: 'minimal', label: 'Brand color' },
            { value: 'none', label: 'Hidden' },
          ]}
        />
        {theme.heroStyle !== 'none' && (
          <>
            <Choice<'compact' | 'tall'>
              value={theme.heroHeight}
              onChange={(heroHeight) => setTheme({ heroHeight })}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'tall', label: 'Tall' },
              ]}
            />
            <Field label="Tagline" hint="Shown under your name. Leave empty to use your description.">
              <input value={theme.tagline} onChange={(e) => setTheme({ tagline: e.target.value.slice(0, 120) })} className={adminInput} placeholder="e.g. Smash burgers & shakes since 2019" />
            </Field>
          </>
        )}
        {theme.heroStyle === 'image' && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-40 h-24 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                {draft.bannerUrl ? <img src={draft.bannerUrl} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="text-gray-300" />}
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold cursor-pointer">
                  {uploading === 'banner' ? <Spinner size={16} /> : <Upload size={16} />} {draft.bannerUrl ? 'Replace photo' : 'Upload photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload('banner', e.target.files)} />
                </label>
                {draft.bannerUrl && (
                  <button type="button" onClick={() => update({ bannerUrl: '' })} className="block text-xs font-semibold text-red-600">
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            {!draft.bannerUrl && <p className="text-xs text-gray-500">Upload a photo to display the image header banner on the storefront.</p>}
            <Field label={`Photo darkness (${theme.heroOverlay}%)`} hint="Darker makes the text easier to read.">
              <input type="range" min={0} max={90} step={5} value={theme.heroOverlay} onChange={(e) => setTheme({ heroOverlay: Number(e.target.value) })} className="w-full accent-gray-900" />
            </Field>
          </>
        )}
      </Section>

      <Section title="Special offer card" description="Highlight a featured dish or promotion with an optional custom background image.">
        <Toggle label="Show special offer card" checked={theme.showPromoCard !== false} onChange={(v) => setTheme({ showPromoCard: v })} />
        {theme.showPromoCard !== false && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Offer title" hint="Leave empty to use your featured dish name.">
                <input
                  value={theme.promoTitle || ''}
                  onChange={(e) => setTheme({ promoTitle: e.target.value.slice(0, 60) })}
                  className={adminInput}
                  placeholder="e.g. Chicken Teriyaki"
                />
              </Field>
              <Field label="Offer subtitle" hint="Leave empty to use dish description or promo text.">
                <input
                  value={theme.promoSubtitle || ''}
                  onChange={(e) => setTheme({ promoSubtitle: e.target.value.slice(0, 120) })}
                  className={adminInput}
                  placeholder="e.g. Discount 25%"
                />
              </Field>
            </div>

            <Field label="Background image (optional)" hint="Add a background photo behind the special offer banner.">
              <div className="flex items-center gap-3">
                <div className="w-40 h-24 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                  {theme.promoBannerUrl ? (
                    <img src={theme.promoBannerUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="text-gray-300" />
                  )}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold cursor-pointer">
                    {uploading === 'promoBanner' ? <Spinner size={16} /> : <Upload size={16} />}{' '}
                    {theme.promoBannerUrl ? 'Replace background' : 'Upload background'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && upload('promoBanner', e.target.files)}
                    />
                  </label>
                  {theme.promoBannerUrl && (
                    <button
                      type="button"
                      onClick={() => setTheme({ promoBannerUrl: '' })}
                      className="block text-xs font-semibold text-red-600"
                    >
                      Remove background
                    </button>
                  )}
                </div>
              </div>
            </Field>

            {theme.promoBannerUrl && (
              <Field label={`Background darkness (${theme.promoOverlay}%)`} hint="Adjust contrast so the offer text stays easy to read.">
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={theme.promoOverlay}
                  onChange={(e) => setTheme({ promoOverlay: Number(e.target.value) })}
                  className="w-full accent-gray-900"
                />
              </Field>
            )}
          </>
        )}
      </Section>

      <Section title="Announcement bar" description="A slim message across the top of every page — holiday hours, new location, specials.">
        <Toggle label="Show announcement" checked={theme.announcementEnabled} onChange={(v) => setTheme({ announcementEnabled: v })} />
        {theme.announcementEnabled && (
          <>
            <input value={theme.announcementText} onChange={(e) => setTheme({ announcementText: e.target.value.slice(0, 140) })} className={adminInput} placeholder="e.g. Closed Monday for Labor Day 🎉" />
            <Choice<AnnouncementTone>
              value={theme.announcementTone}
              onChange={(announcementTone) => setTheme({ announcementTone })}
              options={[
                { value: 'brand', label: 'Brand' },
                { value: 'info', label: 'Info' },
                { value: 'success', label: 'Good news' },
                { value: 'warning', label: 'Alert' },
              ]}
            />
          </>
        )}
      </Section>

      <Section title="Scrolling promo strip" description="A moving banner below the header (text and/or logos).">
        <Toggle label="Show promo strip" checked={!!draft.isMarqueeEnabled} onChange={(v) => update({ isMarqueeEnabled: v })} />
        {draft.isMarqueeEnabled && (
          <>
            <input value={draft.marqueeText || ''} onChange={(e) => update({ marqueeText: e.target.value.slice(0, 500) })} className={adminInput} placeholder="e.g. 20% OFF ALL ORDERS THIS WEEKEND" />
            <ImageStrip
              images={draft.marqueeImageUrls?.length ? draft.marqueeImageUrls : draft.marqueeImageUrl ? [draft.marqueeImageUrl] : []}
              onAdd={(files) => upload('marquee', files)}
              onRemove={(i) => {
                if (!draft.marqueeImageUrls?.length) update({ marqueeImageUrl: '' });
                else update({ marqueeImageUrls: draft.marqueeImageUrls.filter((_, j) => j !== i) });
              }}
              max={12}
              busy={uploading === 'marquee'}
            />
          </>
        )}
      </Section>

      <Section title="Spotlight gallery" description="A slow-scrolling photo reel at the bottom of the menu.">
        <Toggle label="Show spotlight" checked={!!draft.isGalleryEnabled} onChange={(v) => update({ isGalleryEnabled: v })} />
        {draft.isGalleryEnabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={theme.spotlightTitle} onChange={(e) => setTheme({ spotlightTitle: e.target.value.slice(0, 40) })} className={adminInput} placeholder="Title" aria-label="Spotlight title" />
              <input value={theme.spotlightSubtitle} onChange={(e) => setTheme({ spotlightSubtitle: e.target.value.slice(0, 120) })} className={adminInput} placeholder="Subtitle" aria-label="Spotlight subtitle" />
            </div>
            <ImageStrip
              images={draft.galleryImageUrls || []}
              onAdd={(files) => upload('gallery', files)}
              onRemove={(i) => update({ galleryImageUrls: (draft.galleryImageUrls || []).filter((_, j) => j !== i) })}
              max={12}
              tall
              busy={uploading === 'gallery'}
            />
          </>
        )}
      </Section>
    </div>
  );
}
