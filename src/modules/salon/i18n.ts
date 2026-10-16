import { useI18n } from "../../i18n";

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
};

export function useSalonI18n() {
  const { lang, appText } = useI18n();
  const dict = lang === "en" ? EN : DE;

  const s = (key: string): string => dict[key] ?? key;

  const euro = (cents: number): string =>
    new Intl.NumberFormat(lang === "en" ? "en-US" : "de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);

  const day = (isoDate: string): string => {
    if (!isoDate) return "";
    try {
      const d = new Date(isoDate.length === 10 ? isoDate + "T12:00:00" : isoDate);
      return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "de-DE", {
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

  return { s, euro, day, time, lang, appText };
}
