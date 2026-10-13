# Verse UI references

> **Local preview references.** The newer UI described here is local development work. This documentation-only GitHub update does not publish its implementation; the public app source remains 0.1.9.

The Library layout and Warm Graphite palette were selected from the project previews. These component references were subsequently approved for implementation, with their colours adapted to the same palette:

| Component | Design reference | Verse implementation |
| --- | --- | --- |
| Player dock | [Audio Player Card — Yefi Chlara](https://liquidglassdesign.com/gallery/audio-player-card-design-liquid-glass-effect) | Rounded frosted dock, grouped transport, seek, volume and queue controls. |
| Buttons | [Liquid Glass Button — Outline](https://liquidglassdesign.com/gallery/liquid-glass-button-ios-26-light-dark) | Neutral glass rims, inset highlights, light press and hover feedback. |
| Preference navigation | [Tab Navigation — Rishi Raghu](https://liquidglassdesign.com/gallery/liquid-glass-ui-tab-navigation) | A sliding glass selection indicator with arrow-key navigation. |
| Sliders | [Volume Slider — sanoj sunny](https://liquidglassdesign.com/gallery/liquid-glass-slider-concept%28volume%29) | Recessed tracks, glass handles, visible fill and native range-input behaviour. |
| Dropdowns | [SAAS Dropdown — Pranjay](https://liquidglassdesign.com/gallery/liquid-glass-saas-dropdown-component) | CSS-styled native select pickers with keyboard/type-ahead behaviour and native fallback. |
| Colour studio | [Colour Picker — Dominik Tyka](https://liquidglassdesign.com/gallery/color-picker-liquid-glass) | Glass-framed wheel, brightness control, editable hex, colour swatch, and independent lyric/secondary/background targets. |

These are design references. Their artwork and component source code are not bundled. Verse uses its existing HTML controls and locally authored CSS/JavaScript, without a new UI dependency. Large surfaces use static grain and shading; the tab indicator animates its transform. Reduced Motion disables decorative transitions. The fullscreen background and clean lyric glyphs retain their separate appearance settings.
