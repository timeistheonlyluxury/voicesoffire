# Copilot Instructions for TITOL "Voices of Fire" Shopify Theme

## Project Overview

This is a specialized Shopify theme built for TITOL (Time Is The Only Luxury), focused on music streaming, video content, and live events. The theme extends Shopify's Debut theme with custom functionality for audio/video players, gated content, and subscription-based access.

## Architecture & Key Components

### Theme Structure

- Based on Shopify Debut theme v17.11.0 with extensive customizations
- Uses Liquid templating with Shopify's standard directory structure
- Core assets: `theme.css`, `theme.js`, plus specialized components for media players

### Specialized Templates & Sections

**Media Templates:**

- `product.single.album.liquid` - Album/track products with audio players
- `page.single.livestream-v2.liquid` - Live streaming events
- `page.single.gated-content-*.liquid` - Access-controlled content pages

**Key Sections:**

- `single-video-*.liquid` - Video player components and access controls
- `single-music-*.liquid` - Audio streaming functionality
- `single-gated-*.liquid` - Customer access verification systems

### Custom Metafields Architecture

The theme relies heavily on Shopify metafields for content management:

**Product Metafields:**

```liquid
product.metafields.album.track_count product.metafields.album.artist_name
product.metafields.album.release_date product.metafields.track.preview_link
product.metafields.track.track_time
```

**Page Metafields (for streaming):**

```liquid
page.metafields.single_livestream.livestream_id
page.metafields.single_livestream.livestream_host
page.metafields.single_livestream.chat_enabled
page.metafields.single_livestream.collection_handle
```

### Media Player System

- **Audio Player:** Custom Howler.js implementation (`audio-player.js`)
- **Video Player:** Custom video streaming with chat integration (`video-player.js`)
- Players support preview modes, full playback, and subscription-gated access

## Development Workflows

### Local Development

```bash
yarn dev                # Start Shopify CLI dev server
yarn pull              # Pull theme from staging store
yarn deploy            # Build CSS and deploy to staging
```

**Store Configuration:** Uses `titolstaging.myshopify.com` for development

### Asset Management

- SCSS compilation available via `yarn css` command
- Critical CSS inlined in `layout/theme.liquid` for performance
- Lazy loading implemented for non-critical assets

### Access Control System

The theme implements sophisticated access control using:

- **Product Tags:** `titol_force_oos`, `titol_max_1`, `titol_max_4` for inventory control
- **Customer Tags:** Used for subscription-based access to content
- **Order-Based Access:** Customer purchases unlock specific livestream IDs via order history

## Code Patterns & Conventions

### Liquid Templating Patterns

**Conditional Access Control:**

```liquid
{% if available == false or product.tags contains 'titol_force_oos' %}
  <!-- Show sold out state -->
{% endif %}
```

**Metafield-Driven Content:**

```liquid
{% assign livestream_id = page.metafields.single_livestream.livestream_id %}
{% if livestream_id %}
  <!-- Render streaming interface -->
{% endif %}
```

### CSS Organization

- Component-specific stylesheets: `single-*.css` files
- Responsive breakpoints defined in theme object: `medium: 750px`, `large: 990px`
- Utility classes follow BEM-like conventions

### JavaScript Architecture

- Modular approach with separate player classes (`AudioPlayer`, video players)
- Event-driven player interactions with Shopify cart/customer APIs
- jQuery dependency for legacy compatibility

## Integration Points

### Third-Party Services

- **Single Media Platform:** Custom livestream integration via metafields
- **Shopify Plus Features:** Utilizes customer tagging and advanced metafields
- **CDN Assets:** Font and script preloading for performance

### Customer Journey

1. Product purchase → Customer tagged → Access granted to specific content
2. Livestream pages check customer order history for `livestream_id` matches
3. Audio/video players respect customer access levels and show previews vs full content

## Testing & Debugging

- Use browser dev tools with `theme` global object for breakpoint debugging
- Test customer access flows in Shopify admin by manipulating customer tags
- Preview mode available for content testing without purchase requirements

When editing this theme, always consider the customer access control flow and ensure metafield dependencies are maintained for proper content gating functionality.
