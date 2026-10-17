import { formatMoney } from "../../money";
import { useI18n } from "../../i18n";
import type { ProductCategory, ProductUnit, OrderStatus, MovementReason } from "../../../shared/retail";

const TEXTS: Record<string, Record<string, string>> = {
  de: {
    "tabs.products": "Artikel & Sortiment",
    "tabs.orders": "Bestellungen & Wareneingang",
    "tabs.suppliers": "Lieferanten",
    "tabs.stock": "Lager & Inventur",
    "tabs.labels": "Etiketten drucken",

    "actions.newProduct": "Artikel anlegen",
    "actions.newOrder": "Bestellung anlegen",
    "actions.newSupplier": "Lieferant anlegen",
    "actions.receiveGoods": "Wareneingang erfassen",
    "actions.adjustStock": "Bestand anpassen",
    "actions.printLabels": "Etiketten drucken",
    "actions.scan": "Barcode scannen",
    "actions.quickSale": "Direktverkauf",
    "actions.save": "Speichern",
    "actions.cancel": "Abbrechen",
    "actions.edit": "Bearbeiten",
    "actions.delete": "Löschen",
    "actions.search": "Suchen nach Name, EAN oder Art.-Nr...",

    "stats.totalProducts": "Aktive Artikel",
    "stats.stockValue": "Warenwert (EK netto)",
    "stats.lowStock": "Nachzubestellen",
    "stats.openOrders": "Offene Bestellungen",

    "categories.all": "Alle Kategorien",
    "categories.lebensmittel": "Lebensmittel & Feinkost",
    "categories.getraenke": "Getränke & Weine",
    "categories.drogerie": "Drogerie & Kosmetik",
    "categories.mode": "Mode & Textil",
    "categories.schreibwaren": "Schreibwaren & Papeterie",
    "categories.wohnen": "Wohnen & Lifestyle",
    "categories.elektronik": "Elektronik & Zubehör",
    "categories.sonstiges": "Sonstiges",

    "orderStatus.draft": "Entwurf",
    "orderStatus.ordered": "Bestellt",
    "orderStatus.partially_received": "Teilgeliefert",
    "orderStatus.received": "Eingebucht",
    "orderStatus.canceled": "Storniert",

    "reasons.purchase": "Wareneingang",
    "reasons.sale": "Verkauf",
    "reasons.correction": "Inventur / Korrektur",
    "reasons.loss": "Bruch / Schwund",
    "reasons.return": "Rückgabe",
  },
  en: {
    "tabs.products": "Products & Catalog",
    "tabs.orders": "Orders & Receiving",
    "tabs.suppliers": "Suppliers",
    "tabs.stock": "Inventory & Audit",
    "tabs.labels": "Print Labels",

    "actions.newProduct": "Add Product",
    "actions.newOrder": "New Order",
    "actions.newSupplier": "Add Supplier",
    "actions.receiveGoods": "Receive Goods",
    "actions.adjustStock": "Adjust Stock",
    "actions.printLabels": "Print Labels",
    "actions.scan": "Scan Barcode",
    "actions.quickSale": "Direct Sale",
    "actions.save": "Save",
    "actions.cancel": "Cancel",
    "actions.edit": "Edit",
    "actions.delete": "Delete",
    "actions.search": "Search name, EAN or item no...",

    "stats.totalProducts": "Active Items",
    "stats.stockValue": "Stock Value (Cost)",
    "stats.lowStock": "Reorder Needed",
    "stats.openOrders": "Open Orders",

    "categories.all": "All Categories",
    "categories.lebensmittel": "Groceries & Gourmet",
    "categories.getraenke": "Beverages & Wines",
    "categories.drogerie": "Drugstore & Care",
    "categories.mode": "Fashion & Apparel",
    "categories.schreibwaren": "Stationery & Books",
    "categories.wohnen": "Home & Lifestyle",
    "categories.elektronik": "Electronics",
    "categories.sonstiges": "Other",

    "orderStatus.draft": "Draft",
    "orderStatus.ordered": "Ordered",
    "orderStatus.partially_received": "Partially Received",
    "orderStatus.received": "Received",
    "orderStatus.canceled": "Canceled",

    "reasons.purchase": "Purchase",
    "reasons.sale": "Sale",
    "reasons.correction": "Audit / Correction",
    "reasons.loss": "Breakage / Loss",
    "reasons.return": "Customer Return",
  },
  ar: {
    "tabs.products": "المنتجات والمخزون",
    "tabs.orders": "الطلبيات واستلام البضائع",
    "tabs.suppliers": "الموردون",
    "tabs.stock": "المستودع والجرد",
    "tabs.labels": "طباعة الباركود",

    "actions.newProduct": "إضافة منتج",
    "actions.newOrder": "طلبية جديدة",
    "actions.newSupplier": "إضافة مورد",
    "actions.receiveGoods": "استلام البضائع",
    "actions.adjustStock": "تعديل المخزون",
    "actions.printLabels": "طباعة الملصقات",
    "actions.scan": "مسح الباركود",
    "actions.quickSale": "بيع مباشر",
    "actions.save": "حفظ",
    "actions.cancel": "إلغاء",
    "actions.edit": "تعديل",
    "actions.delete": "حذف",
    "actions.search": "بحث بالاسم أو الباركود...",

    "stats.totalProducts": "المنتجات النشطة",
    "stats.stockValue": "قيمة المخزون",
    "stats.lowStock": "بحاجة لإعادة طلب",
    "stats.openOrders": "الطلبيات المفتوحة",

    "categories.all": "جميع الفئات",
    "categories.lebensmittel": "أغذية ومأكولات",
    "categories.getraenke": "مشروبات",
    "categories.drogerie": "عناية ومستحضرات",
    "categories.mode": "أزياء وملابس",
    "categories.schreibwaren": "قرطاسية وأوراق",
    "categories.wohnen": "أدوات منزلية وديكور",
    "categories.elektronik": "إلكترونيات",
    "categories.sonstiges": "أخرى",

    "orderStatus.draft": "مسودة",
    "orderStatus.ordered": "تم الطلب",
    "orderStatus.partially_received": "مستلم جزئياً",
    "orderStatus.received": "مستلم بالكامل",
    "orderStatus.canceled": "ملغي",

    "reasons.purchase": "استلام مشتريات",
    "reasons.sale": "بيع كاشير",
    "reasons.correction": "تصحيح / جرد",
    "reasons.loss": "تالف / فاقد",
    "reasons.return": "إرجاع",
  },
  tr: {
    "tabs.products": "Ürünler ve Stok",
    "tabs.orders": "Siparişler ve Mal Kabul",
    "tabs.suppliers": "Tedarikçiler",
    "tabs.stock": "Depo ve Sayım",
    "tabs.labels": "Barkod Yazdır",

    "actions.newProduct": "Ürün Ekle",
    "actions.newOrder": "Yeni Sipariş",
    "actions.newSupplier": "Tedarikçi Ekle",
    "actions.receiveGoods": "Mal Kabul Et",
    "actions.adjustStock": "Stok Güncelle",
    "actions.printLabels": "Etiket Yazdır",
    "actions.scan": "Barkod Tara",
    "actions.quickSale": "Hızlı Satış",
    "actions.save": "Kaydet",
    "actions.cancel": "İptal",
    "actions.edit": "Düzenle",
    "actions.delete": "Sil",
    "actions.search": "İsim veya barkod ile ara...",

    "stats.totalProducts": "Aktif Ürünler",
    "stats.stockValue": "Stok Değeri (Alış)",
    "stats.lowStock": "Sipariş Gereken",
    "stats.openOrders": "Açık Siparişler",

    "categories.all": "Tüm Kategoriler",
    "categories.lebensmittel": "Gıda ve Şarküteri",
    "categories.getraenke": "İçecekler",
    "categories.drogerie": "Kozmetik ve Bakım",
    "categories.mode": "Giyim ve Moda",
    "categories.schreibwaren": "Kırtasiye ve Kitap",
    "categories.wohnen": "Ev ve Yaşam",
    "categories.elektronik": "Elektronik",
    "categories.sonstiges": "Diğer",

    "orderStatus.draft": "Taslak",
    "orderStatus.ordered": "Sipariş Verildi",
    "orderStatus.partially_received": "Kısmi Teslim",
    "orderStatus.received": "Teslim Alındı",
    "orderStatus.canceled": "İptal",

    "reasons.purchase": "Mal Kabul",
    "reasons.sale": "Satış",
    "reasons.correction": "Sayım / Düzeltme",
    "reasons.loss": "Fire / Hasar",
    "reasons.return": "İade",
  },
};

export function useRetailI18n() {
  const { lang, appText } = useI18n();
  const dict = TEXTS[lang] ?? TEXTS.de;

  const r = (key: string) => dict[key] ?? TEXTS.de[key] ?? key;
  // Mit Cent und in der Währung der Firma (vorher gerundet auf ganze Euro: 14,90 € wurde 15 €)
  const euro = (cents: number) => formatMoney(cents, lang);
  const day = (d: string) => new Date(d).toLocaleDateString(lang);

  return { r, euro, day, appText, lang };
}
