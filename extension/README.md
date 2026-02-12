# VoxLink - WhatsApp Web Translator Extension

Translate messages directly in WhatsApp Web. Type in your language, send in theirs.

## Installation

### Step 1: Download Icons (Optional but Recommended)
1. Go to https://favicon.io/emoji-favicons/globe-with-meridians/
2. Download the favicon package
3. Replace the placeholder icons in `/icons` folder with:
   - `favicon-16x16.png` → `icon16.png`
   - `favicon-32x32.png` → `icon48.png` (or use android-chrome-192x192 resized)
   - `apple-touch-icon.png` → `icon128.png`

### Step 2: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this `extension` folder
5. The VoxLink icon should appear in your extensions bar

### Step 3: Use in WhatsApp Web

1. Go to https://web.whatsapp.com
2. Look for the 🌐 button in the bottom-right corner
3. Click it to open the translation panel
4. Type your message → See translation → Click "Send Translation"
5. Press Enter in WhatsApp to send

## Features

- **Real-time translation** - Translates as you type
- **Back-translation verification** - Shows "They'll understand:" so you can verify meaning
- **One-click send** - Inserts translation directly into WhatsApp chat
- **Keyboard shortcut** - `Ctrl+Enter` to send translation
- **Language swap** - Quick EN ↔ ES toggle
- **Remembers preferences** - Saves your language settings

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send translation to chat |

## Troubleshooting

**Extension not showing?**
- Make sure you're on `web.whatsapp.com`
- Refresh the page after installing
- Check that the extension is enabled in `chrome://extensions/`

**Translation not working?**
- Check your internet connection
- The VoxLink API at `voxlink-v14.vercel.app` must be accessible

**Send button not inserting text?**
- WhatsApp Web occasionally updates their DOM structure
- Try refreshing the page
- Report issues at the VoxLink repository

## Privacy

- This extension only runs on `web.whatsapp.com`
- Messages are sent to VoxLink's translation API for processing
- No data is stored on external servers
- Language preferences are saved locally in your browser

---

**Built by MachineMind**
