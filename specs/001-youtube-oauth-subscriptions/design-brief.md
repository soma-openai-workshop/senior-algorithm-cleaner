# UI Design Brief: Senior-friendly Green Utility Interface

## Selected visual targets

- `/Users/yjh/Desktop/알약UI_2.jpg` — desktop utility layout reference, 600×384
- `/Users/yjh/Desktop/알약UI.jpeg` — tablet/mobile tile layout reference, 450×680

The references define visual language only. The product must not copy the 알약 name, logo, mascot, capsule
illustration, advertising, or other proprietary brand assets.

## Visual translation

| Reference characteristic      | Product translation                                                        |
| ----------------------------- | -------------------------------------------------------------------------- |
| Bright green top action strip | 72px desktop / 64px mobile header with current step and primary action     |
| Large bordered utility tiles  | 2-column mobile and up-to-3-column desktop action/status cards             |
| White-to-light-gray surfaces  | Solid off-white page and light-gray cards with strong neutral borders      |
| Large icon above short label  | Phosphor icon plus 20px-or-larger Korean action label and supporting text  |
| Persistent status rows        | Clearly separated progress, success, warning, and limitation rows          |
| Dense legacy chrome           | Simplified spacing and fewer simultaneous actions for senior comprehension |

## Design tokens

```text
font-family: "Noto Sans KR", system sans-serif
body-size: 18px
smallest-supporting-size: 16px
tile-label-size: 20px
page-title-size: clamp(32px, 5vw, 48px)

green-700: #477b0b
green-600: #5f950f
green-500: #78b91a
green-100: #eaf6d6
surface-page: #f5f6f2
surface-card: #ffffff
surface-muted: #ecefeb
border: #c8cec5
text: #20261f
text-muted: #596257
warning: #a85d00
warning-surface: #fff2d7
danger: #a52b2b
info: #176da3

control-min-size: 52px
primary-button-min-height: 60px
card-radius: 10px
focus-ring: 3px solid #176da3 with 3px offset
content-max-width: 1180px
```

WCAG contrast takes precedence over matching the reference's pale gray labels. Do not use green text on a pale
green background unless the resulting contrast is at least 4.5:1.

## Responsive layout

### 1280px desktop

- Center content within 1180px.
- Header contains product text, current connection status, and one primary action.
- Intro/status panel uses a two-column layout: explanation on the left, connection summary on the right.
- Main actions use three columns when three cards exist; collection results use the full width.

### 768px tablet

- Header wraps status below title if needed.
- Actions use two columns.
- Progress counts use a 2×2 grid with labels always visible.

### 360px mobile

- Header and content become one column.
- Action tiles remain two columns only when each can stay at least 156px wide; otherwise one column.
- Full subscription/channel lists become vertically stacked cards rather than horizontally scrolling tables.
- Sticky actions must not cover the last list item or focus target.

### 200% zoom

- No horizontal page scrolling.
- Text and controls reflow without clipping.
- Dialogs remain within viewport and restore focus to their trigger when closed.

## Component states

Every interactive component must visibly implement:

- default, hover, keyboard focus, pressed, disabled
- loading with text (`연결 중`, `수집 중`) rather than a spinner alone
- empty (`구독 채널이 없습니다`)
- success, partial, reconnect-required, expired, and provider-failure states

Status never relies on color alone. Pair an icon with a short Korean label and explanatory sentence.

## Icon and asset catalog

- Use `@phosphor-icons/react` for search/scan, shield/connection, list, progress, warning, retry, and disconnect
  icons. Use one consistent rounded weight.
- Use locally bundled `@fontsource/noto-sans-kr` weights 400, 500, and 700.
- No custom hero raster is required. The product content and oversized status icon replace the reference mascot
  area, preventing trademark imitation and reducing distraction.
- Channel thumbnails come only from the user's YouTube API results and always have meaningful channel-name alt
  text or an explicitly decorative empty alt when the adjacent name duplicates it.

## Senior UX rules

1. Present one primary action per panel.
2. Use action-first labels: `YouTube 연결하기`, `구독 목록 가져오기`, `계속 수집하기`.
3. Keep paragraphs below three short lines where possible.
4. Show progress as both a sentence and exact counts.
5. Destructive disconnect uses a clearly labelled confirmation; green is never used for destructive confirmation.
6. Keyboard order follows the visual order and all primary tasks are possible without pointer input.
7. Honor `prefers-reduced-motion`; no essential information depends on animation.
