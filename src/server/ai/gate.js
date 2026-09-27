// Zentrale Sperre (Grundsatz 5: keine KI-Nutzung ohne Meldung).
// Ein KI-Aufruf braucht eine Erlaubnis (Permit). Die gibt es nur aus einem Plan, den die
// Oberfläche vorher angefordert hat (was wird gesendet, was kostet es voraussichtlich) und
// der bestätigt bzw. nach den Regeln „nicht mehr fragen“ freigegeben wurde. Eine Erlaubnis
// reicht für genau so viele KI-Aufrufe, wie der Plan Einträge hat.
import crypto from 'crypto';

const PLAN_TTL_MS = 10 * 60 * 1000;
const plans = new Map();
const PERMIT_MARK = Symbol('permit');

export class GateError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function createPlan(kind, details) {
  const id = crypto.randomBytes(16).toString('hex');
  plans.set(id, { kind, details, created: Date.now() });
  return id;
}

export function getPlan(id) {
  const plan = plans.get(id);
  if (!plan || Date.now() - plan.created > PLAN_TTL_MS) return null;
  return plan;
}

// Plan einlösen (einmalig) -> Erlaubnis für genau diesen Vorgang
export function redeemPlan(id, kind, { confirmed }) {
  const plan = getPlan(id);
  plans.delete(id);
  if (!plan) throw new GateError('planInvalid');
  if (plan.kind !== kind) throw new GateError('planWrongKind');
  if (plan.details.blocked) throw new GateError(plan.details.blocked);
  if (plan.details.mustConfirm && !confirmed) throw new GateError('confirmationRequired');
  const calls = plan.details.items?.length ?? 0;
  return { [PERMIT_MARK]: true, kind, plan: plan.details, active: true, callsLeft: calls, costUsd: 0 };
}

export function assertPermit(permit) {
  if (!permit || permit[PERMIT_MARK] !== true || !permit.active) throw new GateError('noPermit');
}

// Vor jedem einzelnen KI-Aufruf: prüft die Erlaubnis und verbraucht einen Aufruf
export function takeCall(permit) {
  assertPermit(permit);
  if (permit.callsLeft <= 0) throw new GateError('noCallsLeft');
  permit.callsLeft--;
}

export function closePermit(permit) {
  if (permit) permit.active = false;
}
