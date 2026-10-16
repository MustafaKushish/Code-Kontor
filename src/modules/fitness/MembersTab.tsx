import { useState, useEffect } from "react";
import {
  Users,
  Search,
  UserPlus,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Printer,
  Edit,
  Trash2,
  X,
  CreditCard,
  Phone,
  Mail,
  Calendar,
  ShieldAlert,
  ChevronRight,
  UserCheck,
  Plus,
  Minus,
} from "lucide-react";
import { api } from "../../api";
import type {
  FitnessCheckIn,
  FitnessMember,
  FitnessPlan,
  MemberStatus,
} from "../../../shared/fitness";

interface MembersTabProps {
  plans: FitnessPlan[];
  selectedMemberId?: string | null;
  onClearSelectedMember: () => void;
  onSelectMember: (id: string) => void;
  onOpenContractPrint: (member: FitnessMember, plan?: FitnessPlan) => void;
  onOpenCardPrint: (member: FitnessMember, plan?: FitnessPlan) => void;
  onRefreshStats: () => void;
}

export function MembersTab({
  plans,
  selectedMemberId,
  onClearSelectedMember,
  onSelectMember,
  onOpenContractPrint,
  onOpenCardPrint,
  onRefreshStats,
}: MembersTabProps) {
  const [members, setMembers] = useState<FitnessMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  // Detail Modal / Drawer state
  const [detailedMember, setDetailedMember] = useState<FitnessMember | null>(null);
  const [memberHistory, setMemberHistory] = useState<FitnessCheckIn[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // New Member Modal state
  const [isNewMemberOpen, setIsNewMemberOpen] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthDate: "",
    planId: plans[0]?.id || "",
    iban: "",
    emergencyContact: "",
    notes: "",
  });
  const [savingNew, setSavingNew] = useState(false);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (statusFilter !== "alle") query.set("status", statusFilter);
      const data = await api<FitnessMember[]>(`/fitness/members?${query.toString()}`);
      setMembers(data);
    } catch {
      // Ignorieren
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [search, statusFilter]);

  // Wenn ein Mitglied von außen ausgewählt wurde (z.B. nach Scan)
  useEffect(() => {
    if (selectedMemberId) {
      loadMemberDetails(selectedMemberId);
    }
  }, [selectedMemberId]);

  const loadMemberDetails = async (id: string) => {
    setHistoryLoading(true);
    try {
      const data = await api<{ member: FitnessMember; history: FitnessCheckIn[] }>(
        `/fitness/members/${id}`
      );
      setDetailedMember(data.member);
      setMemberHistory(data.history);
    } catch {
      // Fehlerbehandlung
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStatusChange = async (memberId: string, newStatus: MemberStatus) => {
    try {
      const updated = await api<FitnessMember>(`/fitness/members/${memberId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setDetailedMember(updated);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
      onRefreshStats();
    } catch {
      // Fehler
    }
  };

  const handleAdjustUnits = async (delta: number) => {
    if (!detailedMember || detailedMember.remainingUnits === undefined) return;
    const nextUnits = Math.max(0, (detailedMember.remainingUnits || 0) + delta);
    try {
      const updated = await api<FitnessMember>(`/fitness/members/${detailedMember.id}`, {
        method: "PUT",
        body: JSON.stringify({ remainingUnits: nextUnits }),
      });
      setDetailedMember(updated);
      setMembers((prev) => prev.map((m) => (m.id === detailedMember.id ? updated : m)));
    } catch {
      // Fehler
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberForm.firstName.trim() || !newMemberForm.lastName.trim()) return;

    setSavingNew(true);
    try {
      const selectedPlan = plans.find((p) => p.id === newMemberForm.planId) || plans[0];
      const created = await api<FitnessMember>("/fitness/members", {
        method: "POST",
        body: JSON.stringify({
          firstName: newMemberForm.firstName.trim(),
          lastName: newMemberForm.lastName.trim(),
          email: newMemberForm.email.trim(),
          phone: newMemberForm.phone.trim(),
          birthDate: newMemberForm.birthDate || undefined,
          planId: selectedPlan?.id || "plan-standard",
          planName: selectedPlan?.name || "Standard",
          monthlyFee: selectedPlan?.isPass10 ? 0 : selectedPlan?.priceMonthly || 39.9,
          remainingUnits: selectedPlan?.isPass10 ? 10 : undefined,
          iban: newMemberForm.iban.trim(),
          emergencyContact: newMemberForm.emergencyContact.trim(),
          notes: newMemberForm.notes.trim(),
          status: "aktiv",
        }),
      });

      setIsNewMemberOpen(false);
      setNewMemberForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        birthDate: "",
        planId: plans[0]?.id || "",
        iban: "",
        emergencyContact: "",
        notes: "",
      });
      await loadMembers();
      onRefreshStats();
      loadMemberDetails(created.id);
    } catch {
      // Fehler
    } finally {
      setSavingNew(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm("Mitglied wirklich unwiderruflich aus der Kartei löschen?")) return;
    try {
      await api(`/fitness/members/${id}`, { method: "DELETE" });
      setDetailedMember(null);
      onClearSelectedMember();
      await loadMembers();
      onRefreshStats();
    } catch {
      // Fehler
    }
  };

  const getStatusBadge = (status: MemberStatus) => {
    switch (status) {
      case "aktiv":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Aktiv
          </span>
        );
      case "pausiert":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            Pausiert
          </span>
        );
      case "gesperrt":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3 h-3" />
            Gesperrt
          </span>
        );
      case "gekuendigt":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
            <XCircle className="w-3 h-3" />
            Gekündigt
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Such- und Aktionsleiste */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nach Name, Mitgliedsnummer, E-Mail suchen..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm font-medium text-zinc-900 focus:outline-hidden transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end overflow-x-auto pb-1 md:pb-0">
          {/* Status-Filter Tabs */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl text-xs font-semibold text-zinc-600">
            {["alle", "aktiv", "pausiert", "gesperrt", "gekuendigt"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-colors cursor-pointer ${
                  statusFilter === st
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "hover:text-zinc-900"
                }`}
              >
                {st === "alle" ? "Alle" : st}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsNewMemberOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs whitespace-nowrap cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Neues Mitglied</span>
          </button>
        </div>
      </div>

      {/* Mitgliederliste (Tabelle & Karten) */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400 text-sm">Mitglieder werden geladen...</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-sm">
            Keine Mitglieder zur Auswahl gefunden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-5">Mitglied</th>
                  <th className="py-3 px-4">Nummer</th>
                  <th className="py-3 px-4">Tarif & Beitrag</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Besuche</th>
                  <th className="py-3 px-4">Beitritt</th>
                  <th className="py-3 px-5 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-sm">
                {members.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => loadMemberDetails(m.id)}
                    className="hover:bg-zinc-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-800 font-bold text-xs flex items-center justify-center border border-zinc-200">
                          {m.firstName[0]}
                          {m.lastName[0]}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 leading-tight">
                            {m.firstName} {m.lastName}
                          </p>
                          <p className="text-xs text-zinc-400">{m.email || m.phone || "Keine Kontaktdaten"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-zinc-600">
                      {m.memberNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-zinc-900 block">{m.planName}</span>
                      <span className="text-xs text-zinc-500">
                        {m.remainingUnits !== undefined
                          ? `${m.remainingUnits} Einheiten verbleibend`
                          : `${fmtEuro(m.monthlyFee)} / Monat`}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(m.status)}</td>
                    <td className="py-3.5 px-4 font-semibold text-zinc-700">
                      {m.checkInsCount} Check-Ins
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-500">{m.joinDate}</td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          loadMemberDetails(m.id);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                        title="Akte öffnen"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MITGLIEDER-DETAIL DRAWER / MODAL --- */}
      {detailedMember && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-200">
            <div>
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 font-extrabold text-lg flex items-center justify-center border border-emerald-200">
                    {detailedMember.firstName[0]}
                    {detailedMember.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-zinc-900">
                        {detailedMember.firstName} {detailedMember.lastName}
                      </h2>
                      {getStatusBadge(detailedMember.status)}
                    </div>
                    <p className="text-xs font-mono text-zinc-500 mt-0.5">
                      Mitgliedsnummer: {detailedMember.memberNumber}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setDetailedMember(null);
                    onClearSelectedMember();
                  }}
                  className="p-2 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Schnellwechsler */}
              <div className="mt-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <span className="text-xs font-bold uppercase text-zinc-500 block mb-2">
                  Status anpassen:
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {(["aktiv", "pausiert", "gesperrt", "gekuendigt"] as MemberStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStatusChange(detailedMember.id, st)}
                      className={`py-1.5 text-xs font-bold rounded-lg border capitalize transition-colors cursor-pointer ${
                        detailedMember.status === st
                          ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs"
                          : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vertrag & Tarif */}
              <div className="mt-6 space-y-4">
                <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider">
                  Tarif & Mitgliedschaft
                </h3>
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-2.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Tarifmodell:</span>
                    <span className="font-bold text-zinc-900">{detailedMember.planName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Monatlicher Beitrag:</span>
                    <span className="font-bold text-emerald-800">
                      {fmtEuro(detailedMember.monthlyFee)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Mitglied seit:</span>
                    <span>{detailedMember.joinDate}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Laufzeit bis:</span>
                    <span>{detailedMember.validUntil || "Unbefristet"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Gesamte Check-Ins:</span>
                    <span className="font-bold">{detailedMember.checkInsCount} Besuche</span>
                  </div>

                  {/* 10er-Karte Steuerung */}
                  {detailedMember.remainingUnits !== undefined && (
                    <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
                      <span className="text-zinc-700 font-semibold">Restguthaben 10er-Karte:</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAdjustUnits(-1)}
                          className="p-1 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-700 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono font-bold text-base px-2">
                          {detailedMember.remainingUnits}
                        </span>
                        <button
                          onClick={() => handleAdjustUnits(+1)}
                          className="p-1 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-700 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Kontaktdaten */}
                <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider pt-2">
                  Kontaktdaten & Notiz
                </h3>
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-zinc-700">
                    <Mail className="w-4 h-4 text-zinc-400" />
                    <span>{detailedMember.email || "–"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-700">
                    <Phone className="w-4 h-4 text-zinc-400" />
                    <span>{detailedMember.phone || "–"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-700">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span>Geburtsdatum: {detailedMember.birthDate || "–"}</span>
                  </div>
                  {detailedMember.emergencyContact && (
                    <div className="pt-2 border-t border-zinc-200 text-zinc-600">
                      <span className="font-bold text-zinc-800">Notfallkontakt: </span>
                      {detailedMember.emergencyContact}
                    </div>
                  )}
                  {detailedMember.notes && (
                    <div className="pt-2 border-t border-zinc-200 text-zinc-600 italic">
                      „{detailedMember.notes}“
                    </div>
                  )}
                </div>

                {/* Letzte Check-In Historie */}
                <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider pt-2">
                  Letzte Check-Ins
                </h3>
                {historyLoading ? (
                  <p className="text-xs text-zinc-400">Verlauf wird geladen...</p>
                ) : memberHistory.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">Noch keine Besuche erfasst.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {memberHistory.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-lg text-xs border border-zinc-100"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{new Date(h.checkedInAt).toLocaleString("de-DE")}</span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {h.status === "anwesend" ? "Gerade anwesend" : "Abgeschlossen"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Aktionen Footer */}
            <div className="pt-6 border-t border-zinc-200 space-y-2 mt-6">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const plan = plans.find((p) => p.id === detailedMember.planId);
                    onOpenContractPrint(detailedMember, plan);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Vertrag drucken
                </button>
                <button
                  onClick={() => {
                    const plan = plans.find((p) => p.id === detailedMember.planId);
                    onOpenCardPrint(detailedMember, plan);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  Ausweis drucken
                </button>
              </div>

              <button
                onClick={() => handleDeleteMember(detailedMember.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-rose-600 hover:text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Mitglied löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEUES MITGLIED MODAL --- */}
      {isNewMemberOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Neues Mitglied aufnehmen</h3>
              </div>
              <button
                onClick={() => setIsNewMemberOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Vorname *</label>
                  <input
                    type="text"
                    required
                    value={newMemberForm.firstName}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm"
                    placeholder="Max"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Nachname *</label>
                  <input
                    type="text"
                    required
                    value={newMemberForm.lastName}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm"
                    placeholder="Mustermann"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">E-Mail</label>
                  <input
                    type="email"
                    value={newMemberForm.email}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm"
                    placeholder="max@beispiel.de"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Mobiltelefon</label>
                  <input
                    type="tel"
                    value={newMemberForm.phone}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm"
                    placeholder="+49 171 1234567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tarif wählen *</label>
                <select
                  value={newMemberForm.planId}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, planId: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm font-semibold text-zinc-900"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.isPass10 ? "10er-Karte" : `${fmtEuro(p.priceMonthly)} / Mon.`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Geburtsdatum</label>
                  <input
                    type="date"
                    value={newMemberForm.birthDate}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, birthDate: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">IBAN für SEPA</label>
                  <input
                    type="text"
                    value={newMemberForm.iban}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, iban: e.target.value })}
                    placeholder="DE89 3704 0044..."
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Notfallkontakt</label>
                <input
                  type="text"
                  value={newMemberForm.emergencyContact}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, emergencyContact: e.target.value })}
                  placeholder="z. B. Partner/in: +49 170 ..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Notiz / Besonderheit</label>
                <textarea
                  rows={2}
                  value={newMemberForm.notes}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, notes: e.target.value })}
                  placeholder="Besonderheiten, Trainingsziele, ärztliche Freigabe..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsNewMemberOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={savingNew}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors shadow-xs cursor-pointer"
                >
                  {savingNew ? "Wird gespeichert..." : "Mitglied anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
