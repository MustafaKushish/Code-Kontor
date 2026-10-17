import { useI18n } from "../../i18n";
import { formatMoney } from "../../money";
import { ApiError } from "../../api";

const DE: Record<string, string> = {
  "tabs.calendar": "Kalender",
  "tabs.appointments": "Termine",
  "tabs.clients": "Kunden & Farbkarten",
  "tabs.services": "Dienstleistungen",
  "tabs.staff": "Team & Stylisten",
  "tabs.settings": "Einstellungen",

  "status.booked": "Gebucht",
  "status.confirmed": "Bestätigt",
  "status.in_progress": "In Behandlung",
  "status.completed": "Abgeschlossen",
  "status.canceled": "Storniert",
  "status.no_show": "Nicht erschienen",

  "categories.cut_style": "Schnitt & Styling",
  "categories.color": "Farbe & Strähnen",
  "categories.care": "Pflege & Kuren",
  "categories.beard": "Bart & Rasur",
  "categories.cosmetics": "Kosmetik & Beauty",
  "categories.package": "Pakete & Specials",

  "actions.newAppointment": "Neuer Termin",
  "actions.newService": "Neue Dienstleistung",
  "actions.newStaff": "Neues Teammitglied",
  "actions.newClient": "Neuer Kunde",
  "actions.newFormula": "Neue Farbrezeptur",
  "actions.checkout": "Abrechnen / Kasse",
  "actions.save": "Speichern",
  "actions.cancel": "Abbrechen",
  "actions.delete": "Löschen",
  "actions.edit": "Bearbeiten",
  "actions.close": "Schließen",

  "calendar.today": "Heute",
  "calendar.noStaff": "Keine Stylisten für diesen Tag eingeteilt",
  "calendar.bookSlot": "Termin buchen",

  "clients.search": "Kunden suchen (Name, Telefon, E-Mail)...",
  "clients.colorCard": "Farbrezepturen",
  "clients.noClients": "Noch keine Kunden angelegt",
  "clients.allergies": "Allergien & Unverträglichkeiten",

  "services.duration": "Dauer",
  "services.price": "Preis",
  "services.noServices": "Noch keine Dienstleistungen angelegt",

  "staff.specialties": "Spezialisierungen",
  "staff.workingHours": "Arbeitszeit",
  "staff.noStaff": "Noch keine Mitarbeiter angelegt",

  "settings.onlineBooking": "Online-Terminbuchung für Kunden",
  "settings.publicLink": "Ihr Buchungs-Link für Kunden",
  "settings.hours": "Salon-Öffnungszeiten",
  "settings.saveSuccess": "Einstellungen erfolgreich gespeichert",

  "errors.slotTaken": "Diese Zeit ist gerade vergeben worden. Bitte eine andere Zeit wählen.",
  "errors.bookingDisabled": "Die Online-Terminbuchung ist zurzeit ausgeschaltet.",
  "errors.serviceNotFound": "Diese Dienstleistung gibt es nicht mehr. Bitte die Seite neu laden.",
  "errors.dayNotAllowed": "An diesem Tag kann nicht online gebucht werden.",
};

const EN: Record<string, string> = {
  "tabs.calendar": "Calendar",
  "tabs.appointments": "Appointments",
  "tabs.clients": "Clients & Color Cards",
  "tabs.services": "Services",
  "tabs.staff": "Team & Stylists",
  "tabs.settings": "Settings",

  "status.booked": "Booked",
  "status.confirmed": "Confirmed",
  "status.in_progress": "In Treatment",
  "status.completed": "Completed",
  "status.canceled": "Canceled",
  "status.no_show": "No Show",

  "categories.cut_style": "Cut & Style",
  "categories.color": "Color & Highlights",
  "categories.care": "Treatments & Care",
  "categories.beard": "Beard & Shave",
  "categories.cosmetics": "Cosmetics & Beauty",
  "categories.package": "Packages & Specials",

  "actions.newAppointment": "New Appointment",
  "actions.newService": "New Service",
  "actions.newStaff": "New Team Member",
  "actions.newClient": "New Client",
  "actions.newFormula": "New Color Formula",
  "actions.checkout": "Checkout / POS",
  "actions.save": "Save",
  "actions.cancel": "Cancel",
  "actions.delete": "Delete",
  "actions.edit": "Edit",
  "actions.close": "Close",

  "calendar.today": "Today",
  "calendar.noStaff": "No stylists scheduled for this day",
  "calendar.bookSlot": "Book Slot",

  "clients.search": "Search clients (name, phone, email)...",
  "clients.colorCard": "Color Formulas",
  "clients.noClients": "No clients registered yet",
  "clients.allergies": "Allergies & Sensitivities",

  "services.duration": "Duration",
  "services.price": "Price",
  "services.noServices": "No services created yet",

  "staff.specialties": "Specialties",
  "staff.workingHours": "Working Hours",
  "staff.noStaff": "No staff members created yet",

  "settings.onlineBooking": "Online Customer Booking",
  "settings.publicLink": "Your Customer Booking Link",
  "settings.hours": "Salon Opening Hours",
  "settings.saveSuccess": "Settings saved successfully",

  "errors.slotTaken": "This time was just taken. Please choose another time.",
  "errors.bookingDisabled": "Online booking is currently switched off.",
  "errors.serviceNotFound": "This service no longer exists. Please reload the page.",
  "errors.dayNotAllowed": "Online booking is not possible on this day.",
};

export function useSalonI18n() {
  const { lang, appText, errorText: coreError } = useI18n();
  const dict = lang === "en" ? EN : DE;

  const s = (key: string): string => dict[key] ?? key;

  // Währung der Firma; die öffentliche Buchungsseite gibt sie mit, weil dort niemand angemeldet ist
  const euro = (cents: number, code?: string): string => formatMoney(cents, lang, code);

  const day = (isoDate: string): string => {
    if (!isoDate) return "";
    try {
      const d = new Date(isoDate.length === 10 ? isoDate + "T12:00:00" : isoDate);
      return new Intl.DateTimeFormat(lang, {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(d);
    } catch {
      return isoDate;
    }
  };

  const time = (timeStr: string): string => timeStr || "";

  const errorText = (error: unknown): string => {
    if (error instanceof ApiError && error.code?.startsWith("salon.") && dict[`errors.${error.code.slice(6)}`]) return dict[`errors.${error.code.slice(6)}`]!;
    return coreError(error);
  };

  return { s, euro, day, time, lang, appText, errorText };
}
