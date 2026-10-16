# Slotbook website walkthrough

The video records the actual running website using fictitious customers and admin accounts in a separate demo SQLite database. It includes 29 sections across approximately three minutes, with explanatory captions. Password fields remain masked, and the capture excludes the browser address bar.

The recording covers the home page, treatment menu, customer signup and login, duplicate phone prevention, weekly stylist days off, past-date rejection, availability, name and phone validation, account or alternate contact numbers, booking confirmation, SQLite persistence, rescheduling, overlap and cleanup rules, Any stylist, customer/admin access separation, admin ID + phone + password sign-in, daily bookings and revenue, cancellation, restored availability, sign-out, and mobile layout.

`recording.json` maps captured browser frames to sections. `render-recording.mjs` encodes the captured frames into an H.264 MP4 using FFmpeg, with captions beneath the screen recording. Interaction pacing is compressed into readable sections. `chapters.srt` and `chapters.json` provide the complete chapter sequence.

Re-encode from this directory with `node render-recording.mjs` (FFmpeg must be on PATH). No live customer information is used, and no website functionality is simulated by the encoder.
