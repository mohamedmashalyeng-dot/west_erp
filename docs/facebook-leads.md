# Facebook Lead Ads → CRM

The integration imports available submissions from all lead forms on one Facebook Page per organization. New submissions arrive through a signed Meta webhook. Every submission is identified by its Page ID and lead ID, so backfills and webhook retries never duplicate the same submission or overwrite sales notes, assignments, or pipeline stages. Separate form submissions by the same person remain separate leads.

## Server setup

1. Configure a MySQL/MariaDB `DATABASE_URL`. For an existing imported database, follow [the MySQL deployment guide](./mysql-deployment.md) before deployment so its existing data is preserved. Run `npm ci`, `npm run db:generate`, and `npm run db:deploy` only after the baseline has been verified or on an empty application database.
2. Set `APP_URL` to your public HTTPS application URL.
3. Set `FACEBOOK_APP_SECRET` to your Meta app secret.
4. Generate a random `FACEBOOK_WEBHOOK_VERIFY_TOKEN` and a separate `FACEBOOK_TOKEN_ENCRYPTION_KEY`. Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The encryption key must have exactly 64 hexadecimal characters. Store it securely and keep it stable across instances and deploys; rotating it requires reconnecting the Pages.
5. `FACEBOOK_GRAPH_API_VERSION` defaults to `v27.0` and can be set explicitly to a version supported by your app.

`npm run build` generates the Prisma client, applies pending migrations, runs the optional organization bootstrap, and builds Next.js. It requires the target database configuration. `npm run vercel-build` is an alias for the same pipeline, so Hostinger and Vercel apply the schema migration with the application build. For a compilation-only check against an already configured schema, use `npm run build:app` after generating the Prisma client.

The organization administrator enters the Page access token in Settings. Tokens are encrypted with AES-256-GCM and bound to the organization before database storage. Saved tokens and app secrets are never rendered in the browser or audit metadata.

## Meta setup

1. Create/configure a Meta app with Lead Ads access. Obtain the required permissions and leads access for the Page. Meta's webhook guide lists `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, and `ads_management`. Check the retrieval guide for any additional permissions needed by your use case, and complete the relevant app review/advanced access requirements for production users.
2. In the app's Webhooks configuration, choose **Page**, set the callback URL to `https://YOUR_DOMAIN/api/webhooks/facebook`, enter your server's `FACEBOOK_WEBHOOK_VERIFY_TOKEN`, and subscribe to **leadgen**. The endpoint must be publicly reachable over HTTPS.
3. Generate a **Page access token** for that Page using the same Meta app. Ensure the app/user has access in Leads Access Manager. A user access token is not a substitute for the Page token.
4. In ERP **Settings → Facebook Lead Ads**, enter the Page ID and Page token and connect. The app verifies the token's Page identity, checks form access, and subscribes itself to the Page's `leadgen` events.
5. In **CRM & Leads**, click **Sync Facebook** to import submissions still available from Meta. The UI reports forms scanned, new leads, and submissions already imported. This can be repeated to recover missed deliveries. Meta's retention and access policies limit historical availability.
6. Use the [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing/) to create a test submission. Verify it appears with source **Facebook**, contact details, custom answers in notes, and an import timeline entry. Test leads can require deleting an earlier test lead before creating another.

## Deployment for erp.orvann.com

- Public app URL: `https://erp.orvann.com`.
- Meta callback URL: `https://erp.orvann.com/api/webhooks/facebook`.
- Facebook Page: **West Development Ngg**, Page ID `1199396266586272` (confirmed in Graph API Explorer).
- The public site identifies its hosting platform as Hostinger. The webhook endpoint returned HTTP 404 during the deployment check on November 23, 2026; the new integration still needs to be deployed there.
- The local `.env.local` contains the Facebook app secret, generated verify token and encryption key, Graph API version, and `APP_URL`. It is excluded from Git. These local settings do not configure the hosted application automatically.

In Hostinger hPanel, open **Websites → Dashboard** for this application and open **Environment Variables**. Copy these settings from the local `.env.local` to the hosting configuration without committing the secret file:

```text
APP_URL
FACEBOOK_APP_SECRET
FACEBOOK_WEBHOOK_VERIFY_TOKEN
FACEBOOK_TOKEN_ENCRYPTION_KEY
FACEBOOK_GRAPH_API_VERSION
```

Keep the existing production database and authentication variables. Deploy the updated source including the Prisma migration using `npm run build` (or its alias `npm run vercel-build`). Both commands apply pending migrations before building; do not replace the production database with the local test database. The production database connection must be available to the build process, and the bootstrap runs only if its owner configuration is set.

Redeploy after changing the environment settings. Before entering the callback in Meta, verify the deployed endpoint is reachable and returns HTTP 200 with the supplied `hub.challenge` when the correct verify token and `hub.mode=subscribe` are supplied. A bare GET returns HTTP 403 when configured, or 503 if the verify token is missing; HTTP 404 means the route is absent or not routed to this application. Do not put real verify tokens in screenshots or shared URLs.

Once Meta verifies the callback, subscribe the Page object to `leadgen`, connect the confirmed Page in ERP Settings using its Page token, and run Sync Facebook. Store the Page token only through the connection form; it is not an environment variable in this implementation.

Hostinger references: [Environment variables](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/) and [redeploying the application](https://www.hostinger.com/support/how-to-redeploy-a-node-js-application/).

New submissions require no manual sync once the webhook is configured. The CRM list shows new records on the next page load/refresh; it does not currently push updates into an already open browser tab.

## Recovery and behavior

- Expired or revoked tokens: generate a replacement Page token and update the connection in Settings. Re-run Sync Facebook to recover available missed submissions.
- Failed webhook imports return HTTP 500 so Meta can retry. Acknowledgement occurs after database commits. Duplicate deliveries leave existing CRM work unchanged. This implementation processes deliveries synchronously; hosting request-duration limits still apply to large batches. Manual sync provides recovery for available submissions.
- Unknown, disconnected, or inactive organizations are ignored. A Page can connect to only one organization, and imports use its tenant-scoped database client.
- Disconnect removes the locally saved credentials; existing CRM leads remain. It does not revoke Meta credentials or remove other Page webhook subscriptions. Remove the app in Meta as well if you need to revoke access entirely.
- Names, phone numbers, email, country, city, submission time, form ID, ad ID, and all question answers are preserved. Submissions without a phone can still be imported. Imported leads start at `NEW` with source `FACEBOOK` and remain unassigned.

## Official references

- [Retrieving leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/)
- [Webhooks for leads and required permissions](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/)
- [Webhook verification and signature validation](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)
- [Graph API versioning](https://developers.facebook.com/docs/graph-api/guides/versioning)
