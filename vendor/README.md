# Bundled libraries (so tickets and scanning never depend on a CDN)

- `qrcode-generator.js` — QR Code Generator for JavaScript, © Kazuhiko Arase, MIT license.
  Draws the QR code on each ticket.
- `jsQR.min.js` — jsQR, © Cosmo Wolfe, Apache-2.0 license. Reads QR codes from the camera
  in the driver's Scan ticket screen.

Both are loaded only when needed (ticket page / scan page).
