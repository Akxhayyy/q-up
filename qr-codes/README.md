# QR codes

One PNG per active service, each encoding a direct link to that service's join page (`/q/<slug>`).

Currently baked with the LAN IP in use during local testing:

| File | Encodes |
|---|---|
| `cert.png` | http://192.168.1.15:3000/q/cert |
| `it.png` | http://192.168.1.15:3000/q/it |
| `lab.png` | http://192.168.1.15:3000/q/lab |

**These will be wrong on a different network** (a new venue, a different WiFi, or once deployed). Regenerate before the actual demo:

```bash
BASE_URL=https://your-app.vercel.app npm run generate-qr-codes
# or, for local testing on a different network:
BASE_URL=http://<your-new-lan-ip>:3000 npm run generate-qr-codes
```

This overwrites the files in place. The live display board (`/display/[slug]`) doesn't have this problem — its QR is generated in the browser from the page's own URL, so it's always correct without regenerating anything. These static files are just for convenience (printing, slides, sharing a link directly).
