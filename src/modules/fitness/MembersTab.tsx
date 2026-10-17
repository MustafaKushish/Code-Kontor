import { useState, useEffect } from "react";
import {
  Search,
  UserPlus,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Trash2,
  CreditCard,
  Phone,
  Mail,
  Calendar,
  ShieldAlert,
  ChevronRight,
  Plus,
  Minus,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type {
  FitnessCheckIn,
  FitnessMember,
  FitnessPlan,
  MemberStatus,
} from "../../../shared/fitness";
import { useFitnessI18n } from "./i18n";

interface MembersTabProps {
  plans: FitnessPlan[];
  selectedMemberId?: string | null;
  onClearSelectedMember: () => void;
  onSelectMember: (id: string) => void;
  onOpenContractPrint: (member: FitnessMember, plan?: FitnessPlan) => void;
  onOpenCardPrint: (member: FitnessMember, plan?: FitnessPlan) => void;
  onRefreshStats: () => void;
  isManager: boolean;
}

export function MembersTab({
  plans,
  selectedMemberId,
  onClearSelectedMember,
  onSelectMember,
  onOpenContractPrint,
  onOpenCardPrint,
  onRefreshStats,
  isManager,
}: MembersTabProps) {
  const { t, money, day, dateTime, statusLabel } = useFitnessI18n();
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

  const fmtEuro = money;

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
        body: { status: newStatus },
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
        body: { remainingUnits: nextUnits },
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
        body: {
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
        },
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
    if (!confirm(t("members.confirmDelete"))) return;
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
          <span className="pill pos">
            <CheckCircle2 size={13} />
            {t("status.aktiv")}
          </span>
        );
      case "pausiert":
        return (
          <span className="pill warn">
            <Clock size={13} />
            {t("status.pausiert")}
          </span>
        );
      case "gesperrt":
        return (
          <span className="pill neg">
            <ShieldAlert size={13} />
            {t("status.gesperrt")}
          </span>
        );
      case "gekuendigt":
        return (
          <span className="pill">
            <XCircle size={13} />
            {t("status.gekuendigt")}
          </span>
        );
    }
  };

  const closeDetails = () => {
    setDetailedMember(null);
    onClearSelectedMember();
  };

  return (
    <div className="stack">
      {/* Such- und Aktionsleiste */}
      <div className="toolbar">
        <div className="fitness-toolbar">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("members.search")}
              aria-label={t("members.search")}
            />
          </label>
          <button onClick={() => setIsNewMemberOpen(true)} className="button primary">
            <UserPlus size={18} />
            {t("common.newMember")}
          </button>
        </div>

        {/* Status-Filter Tabs */}
        <div className="chips" role="tablist">
          {["alle", "aktiv", "pausiert", "gesperrt", "gekuendigt"].map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={statusFilter === st}
              onClick={() => setStatusFilter(st)}
              className={`chip cap ${statusFilter === st ? "active" : ""}`}
            >
              {st === "alle" ? t("status.all") : statusLabel(st)}
            </button>
          ))}
        </div>
      </div>

      {/* Mitgliederliste */}
      <section className="card list-card">
        {loading ? (
          <p className="empty muted">{t("members.loading")}</p>
        ) : members.length === 0 ? (
          <p className="empty muted">{t("members.empty")}</p>
        ) : (
          members.map((m) => (
            <div key={m.id} onClick={() => loadMemberDetails(m.id)} className="list-row fitness-member-row">
              <span className="fitness-avatar" aria-hidden>
                {m.firstName[0]}
                {m.lastName[0]}
              </span>
              <span className="list-main">
                <strong>
                  {m.firstName} {m.lastName}
                </strong>
                <small className="muted">
                  <span className="mono">{m.memberNumber}</span> · {m.email || m.phone || t("members.noContact")}
                </small>
              </span>
              <span className="fitness-member-plan">
                <strong>{m.planName}</strong>
                <small className="muted">
                  {m.remainingUnits !== undefined
                    ? t("common.unitsLeft", { n: m.remainingUnits })
                    : t("common.perMonth", { amount: fmtEuro(m.monthlyFee) })}
                </small>
              </span>
              <span className="fitness-row-meta">
                {getStatusBadge(m.status)}
                <small className="muted">
                  {t("members.checkIns", { n: m.checkInsCount, date: day(m.joinDate) })}
                </small>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadMemberDetails(m.id);
                }}
                className="icon-button"
                title={t("members.openFile")}
                aria-label={t("members.openFile")}
              >
                <ChevronRight size={18} className="flip-rtl" />
              </button>
            </div>
          ))
        )}
      </section>

      {/* --- MITGLIEDER-DETAIL DIALOG --- */}
      {detailedMember && (
        <Dialog title={`${detailedMember.firstName} ${detailedMember.lastName}`} onClose={closeDetails} wide>
          <div className="fitness-dialog">
            {/* Header */}
            <div className="fitness-member-head">
              <span className="fitness-avatar big" aria-hidden>
                {detailedMember.firstName[0]}
                {detailedMember.lastName[0]}
              </span>
              <div>
                {getStatusBadge(detailedMember.status)}
                <small className="muted mono">{t("members.memberNumber", { n: detailedMember.memberNumber })}</small>
              </div>
            </div>

            {/* Status Schnellwechsler */}
            <div className="stack-sm">
              <h3>{t("members.changeStatus")}</h3>
              <div className="segmented">
                {(["aktiv", "pausiert", "gesperrt", "gekuendigt"] as MemberStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(detailedMember.id, st)}
                    className={`cap ${detailedMember.status === st ? "active" : ""}`}
                  >
                    {statusLabel(st)}
                  </button>
                ))}
              </div>
            </div>

            {/* Vertrag & Tarif */}
            <div className="stack-sm">
              <h3>{t("members.planSection")}</h3>
              <div className="fitness-panel">
                <dl className="facts">
                  <dt>{t("members.planModel")}</dt>
                  <dd>{detailedMember.planName}</dd>
                  <dt>{t("members.monthlyFee")}</dt>
                  <dd>{fmtEuro(detailedMember.monthlyFee)}</dd>
                  <dt>{t("members.memberSince")}</dt>
                  <dd>{day(detailedMember.joinDate)}</dd>
                  <dt>{t("members.validUntil")}</dt>
                  <dd>{detailedMember.validUntil ? day(detailedMember.validUntil) : t("common.unlimited")}</dd>
                  <dt>{t("members.totalCheckIns")}</dt>
                  <dd>{t("members.visits", { n: detailedMember.checkInsCount })}</dd>
                </dl>

                {/* 10er-Karte Steuerung */}
                {detailedMember.remainingUnits !== undefined && (
                  <div className="fitness-units">
                    <span>{t("members.passBalance")}</span>
                    <span className="row gap">
                      <button type="button" onClick={() => handleAdjustUnits(-1)} className="icon-button" aria-label="−1">
                        <Minus size={16} />
                      </button>
                      <strong className="mono">{detailedMember.remainingUnits}</strong>
                      <button type="button" onClick={() => handleAdjustUnits(+1)} className="icon-button" aria-label="+1">
                        <Plus size={16} />
                      </button>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Kontaktdaten */}
            <div className="stack-sm">
              <h3>{t("members.contactSection")}</h3>
              <div className="fitness-panel">
                <p className="fitness-icon-line">
                  <Mail size={16} />
                  <span>{detailedMember.email || "–"}</span>
                </p>
                <p className="fitness-icon-line">
                  <Phone size={16} />
                  <span>{detailedMember.phone || "–"}</span>
                </p>
                <p className="fitness-icon-line">
                  <Calendar size={16} />
                  <span>{t("members.birthDate", { date: detailedMember.birthDate ? day(detailedMember.birthDate) : "–" })}</span>
                </p>
                {detailedMember.emergencyContact && (
                  <p className="fitness-note">
                    <strong>{t("members.emergency")} </strong>
                    {detailedMember.emergencyContact}
                  </p>
                )}
                {detailedMember.notes && <p className="fitness-note quote">{t("members.noteQuote", { note: detailedMember.notes })}</p>}
              </div>
            </div>

            {/* Letzte Check-In Historie */}
            <div className="stack-sm">
              <h3>{t("members.lastCheckIns")}</h3>
              {historyLoading ? (
                <p className="small muted">{t("members.historyLoading")}</p>
              ) : memberHistory.length === 0 ? (
                <p className="small muted">{t("members.historyEmpty")}</p>
              ) : (
                <div className="fitness-scroll">
                  {memberHistory.map((h) => (
                    <div key={h.id} className="list-row">
                      <span className="fitness-icon-line list-main">
                        <CheckCircle2 size={15} className="pos" />
                        <span>{dateTime(h.checkedInAt)}</span>
                      </span>
                      <small className="muted">{h.status === "anwesend" ? t("members.present") : t("members.finished")}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Aktionen */}
            <div className="fitness-two">
              <button
                type="button"
                onClick={() => {
                  const plan = plans.find((p) => p.id === detailedMember.planId);
                  onOpenContractPrint(detailedMember, plan);
                }}
                className="button"
              >
                <Printer size={17} />
                {t("members.printContract")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const plan = plans.find((p) => p.id === detailedMember.planId);
                  onOpenCardPrint(detailedMember, plan);
                }}
                className="button"
              >
                <CreditCard size={17} />
                {t("members.printCard")}
              </button>
            </div>
            {isManager && (
              <button type="button" onClick={() => handleDeleteMember(detailedMember.id)} className="button danger block">
                <Trash2 size={16} />
                {t("members.delete")}
              </button>
            )}
          </div>
        </Dialog>
      )}

      {/* --- NEUES MITGLIED DIALOG --- */}
      {isNewMemberOpen && (
        <Dialog title={t("members.newTitle")} onClose={() => setIsNewMemberOpen(false)} wide>
          <form onSubmit={handleCreateMember} className="fitness-dialog">
            <div className="grid form-grid">
              <Field label={t("members.firstName")} required>
                <input
                  type="text"
                  required
                  value={newMemberForm.firstName}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, firstName: e.target.value })}
                  placeholder={t("members.phFirstName")}
                />
              </Field>
              <Field label={t("members.lastName")} required>
                <input
                  type="text"
                  required
                  value={newMemberForm.lastName}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, lastName: e.target.value })}
                  placeholder={t("members.phLastName")}
                />
              </Field>
              <Field label={t("members.email")}>
                <input
                  type="email"
                  value={newMemberForm.email}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, email: e.target.value })}
                  placeholder={t("members.phEmail")}
                />
              </Field>
              <Field label={t("members.mobile")}>
                <input
                  type="tel"
                  value={newMemberForm.phone}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, phone: e.target.value })}
                  placeholder={t("members.phPhone")}
                />
              </Field>
              <Field label={t("members.choosePlan")} required wide>
                <select
                  value={newMemberForm.planId}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, planId: e.target.value })}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.isPass10 ? t("common.pass10") : t("common.perMonthShort", { amount: fmtEuro(p.priceMonthly) })})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("members.birthDateLabel")}>
                <input
                  type="date"
                  value={newMemberForm.birthDate}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, birthDate: e.target.value })}
                />
              </Field>
              <Field label={t("members.iban")}>
                <input
                  type="text"
                  value={newMemberForm.iban}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, iban: e.target.value })}
                  placeholder="DE89 3704 0044..."
                  className="mono"
                />
              </Field>
              <Field label={t("members.emergencyLabel")} wide>
                <input
                  type="text"
                  value={newMemberForm.emergencyContact}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, emergencyContact: e.target.value })}
                  placeholder={t("members.phEmergency")}
                />
              </Field>
              <Field label={t("members.notes")} wide>
                <textarea
                  rows={2}
                  value={newMemberForm.notes}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, notes: e.target.value })}
                  placeholder={t("members.phNotes")}
                />
              </Field>
            </div>

            <div className="actions-end">
              <button type="button" onClick={() => setIsNewMemberOpen(false)} className="button">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={savingNew} className="button primary">
                {savingNew ? t("common.saving") : t("members.create")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
