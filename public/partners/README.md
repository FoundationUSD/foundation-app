# Partner Logos

This directory is for institutional partner/investor logos.

## Guidelines

- **Format**: SVG preferred, PNG with transparency as fallback
- **Color**: White or light gray (for dark background display)
- **Size**: Original size, will be resized in CSS
- **Naming**: Use lowercase with hyphens (e.g., `partner-name.svg`)

## Adding Partner Logos

1. Add logo files to this directory
2. Update the `partners` array in `src/views/Landing.vue`:

```typescript
const partners = ref([
  { name: 'Partner Name', logo: '/partners/partner-name.svg' },
  // Add more partners...
]);
```

## Recommended Logo Treatment

- Use white versions of logos on dark background
- Keep consistent height (~36-48px display height)
- Grayscale filter applied automatically, color on hover

## Example Partners (Update with actual):

- Venture Capital firms
- Institutional investors
- Custody providers
- Audit firms
- Blockchain networks
- Strategic partners
