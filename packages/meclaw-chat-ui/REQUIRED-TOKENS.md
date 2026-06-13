# Required CSS tokens

`@naingoted/meclaw-chat-ui` uses semantic Tailwind utility classes. Each consumer app must define these CSS variables in its own `globals.css` (or equivalent theme file):

| Token | Used for |
|-------|----------|
| `--background` | Page/panel background |
| `--foreground` | Primary text |
| `--card` | Input and chip backgrounds |
| `--card-foreground` | Text on card surfaces |
| `--primary` | User message bubble background |
| `--primary-foreground` | User message text |
| `--muted` | Assistant bubble, trace backgrounds |
| `--muted-foreground` | Timestamps, labels, placeholders |
| `--border` | Dividers, chip borders, panels |
| `--input` | Input border color |
| `--ring` | Focus ring color |

Also ensure Tailwind v4 scans the package (adjust path for your layout):

```css
/* Monorepo workspace — scan source during dev */
@source "../../../packages/meclaw-chat-ui/src";

/* Published install — scan the built bundle */
@source "../../node_modules/@naingoted/meclaw-chat-ui/dist";
```
