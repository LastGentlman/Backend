# 📊 Monitoring & WhatsApp Alert System

This document describes the setup, configuration, and usage of the backend monitoring and WhatsApp alert system for your project.

---

## 🚀 Features

- **Automated Database Monitoring:** Collects key metrics (orders per day, query times, DB size, connections, etc.).
- **WhatsApp Alerts:** Sends critical and warning alerts to configured phone numbers using the WhatsApp Business API.
- **Escalation & Business Hours:** Alerts are routed based on severity, business hours, and escalation rules.
- **Audit Logging:** All WhatsApp alerts are logged in the `whatsapp_logs` table in Supabase for traceability.
- **Webhook Integration:** Secure WhatsApp webhook for receiving commands (e.g., status, pause, resume, help).
- **Manual & Emergency Checks:** Endpoints and scripts for manual, emergency, and test alerting.
- **Configurable Thresholds:** Customizable alert thresholds, business hours, and escalation contacts.
- **Reporting:** Daily and weekly status reports via WhatsApp.
- **API Endpoints:** For health checks, metrics, alert stats, webhook handling, and configuration.

---

## 🏗️ Setup

### 1. Environment Variables

Copy the example file and fill in your credentials:

```sh
cp Backend/monitoring.env.example Backend/.env.monitoring
```

Edit `.env.monitoring` and set:

- `META_WHATSAPP_TOKEN` — WhatsApp Business API token (from Meta Developer Console)
- `META_PHONE_NUMBER_ID` — WhatsApp phone number ID
- `META_APP_SECRET` — Meta App Secret (for webhook signature verification)
- `WEBHOOK_VERIFY_TOKEN` — Secret for webhook verification
- Phone numbers for escalation (critical, warning, weekend)
- Business hours, timezone, and thresholds as needed

**See `monitoring.env.example` for all options and documentation.**

### 2. Database Setup

Ensure your Supabase project has a `whatsapp_logs` table with at least the following columns:

| Column          | Type      | Description                |
|-----------------|-----------|----------------------------|
| id              | bigint    | Primary key (auto)         |
| phone_number    | text      | Recipient phone            |
| message_content | text      | Message sent               |
| priority        | text      | 'critical', 'warning', etc.|
| status          | text      | 'sent', 'failed'           |
| sent_at         | timestamptz | Timestamp                |

Add indexes and RLS as needed for your security model.

### 3. WhatsApp Business API

- Create a WhatsApp Business App at [Meta for Developers](https://developers.facebook.com/apps/)
- Get your access token, phone number ID, and app secret
- Set up a webhook URL (e.g., `/api/whatsapp/webhook`) and verify it with your `WEBHOOK_VERIFY_TOKEN`

---

## ⚙️ Usage

### Start Monitoring

```sh
deno run --allow-all Backend/scripts/start-monitoring.ts
```

- Loads environment variables
- Initializes Supabase
- Configures WhatsApp webhook
- Runs an initial check and starts continuous monitoring (every 6 hours)
- Sends daily and weekly reports

### API Endpoints

- `POST /monitoring/check` — Manual monitoring check
- `POST /monitoring/test-alert` — Send a test alert (critical/warning)
- `GET /monitoring/alerts` — Get alert statistics and recent alerts
- `POST /monitoring/whatsapp/webhook` — WhatsApp webhook (for incoming messages/commands)
- `GET /monitoring/whatsapp/webhook` — Webhook verification (for Meta)
- `POST /monitoring/configure` — Update monitoring thresholds

### WhatsApp Commands

Send these via WhatsApp to the business number:

- `status` — Get current system status
- `pause` — Pause alerts for 1 hour
- `resume` — Resume alerts
- `help` — List available commands

---

## 🔒 Security

- Webhook requests are verified using the `META_APP_SECRET` and signature headers.
- Only configured phone numbers receive alerts.
- All alert activity is logged for audit purposes.

---

## 🛠️ Customization

- Edit `Backend/services/WhatsAppAlertsService.ts` to adjust escalation logic, business hours, or message templates.
- Adjust thresholds and schedules in `.env.monitoring`.
- Extend the webhook handler to support more WhatsApp commands as needed.

---

## 🏁 Deployment

- Deploy your backend (e.g., to Deno Deploy or your preferred platform).
- Ensure environment variables are set in your deployment environment.
- Expose the webhook endpoint to the internet for WhatsApp integration.

---

## 📝 Example `.env.monitoring`

```env
META_WHATSAPP_TOKEN=your_token_here
META_PHONE_NUMBER_ID=your_phone_number_id
META_APP_SECRET=your_app_secret
WEBHOOK_VERIFY_TOKEN=your_webhook_token
WHATSAPP_WEBHOOK_URL=https://your-domain.com/api/whatsapp/webhook
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=22:00
TIMEZONE=America/Mexico_City
MONITORING_INTERVAL=21600000
CRITICAL_PHONE_1=+5255XXXXXXXX
WARNING_PHONE_1=+5255YYYYYYYY
WEEKEND_PHONE_1=+5255ZZZZZZZZ
```

---

## 📚 References

- [Meta WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp)
- [Supabase Documentation](https://supabase.com/docs)
- [Deno Deploy](https://deno.com/deploy)

---

## ❓ Support

For technical support, contact: `tech@pedidolist.com`

---
