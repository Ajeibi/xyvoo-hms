import { registerAlertDelivery } from "@/lib/hms/alerts";
import { deliverAlert } from "@/lib/hms/alert-delivery";

/** Server start-up: lets sendAlert reach email, push and WhatsApp (see the note in alerts.ts). */
registerAlertDelivery(deliverAlert);
