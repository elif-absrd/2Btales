# Curly Tales 🍂

A camera-first photo booth and scrapbook made from the collage-page artwork supplied for Curly Tales. Built with React, TypeScript, and Vite.

## What's included

- Portrait-only opening animation, then direct entry into the camera.
- Webcam capture and multi-photo upload.
- Automatic local photo saving with IndexedDB.
- Four warm film filters.
- Four custom photo-collage page templates based on the supplied references: Autumn Keepsake, Music & Memories, Vinyl & Pop, and Comic Book.
- Each template has transparent photo windows, so real photos sit underneath the original frame art and stickers.
- Automatic page-design cycling or manual design selection for the currently displayed left and right pages.
- Page capacity changes with each template's number of photo frames. Photos flow across pages in their saved order.
- Editable captions, photo removal, drag-and-drop photo ordering, and print / Save as PDF.

## Run locally

Install Node.js 20 or newer. In this folder run:

```bash
npm install
npm run dev
```

Open the local URL from Vite, usually `http://localhost:5173`. Camera access requires localhost or HTTPS and browser permission.

## Storage and privacy

Photos, captions, and page-layout choices are stored in IndexedDB in the current browser on the current device. There is no server or cloud backup. Clearing browser site data can delete the book, so use Print a copy and Save as PDF for a portable backup.
