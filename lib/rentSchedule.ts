const INDIA_TIME_ZONE = "Asia/Kolkata";
export const RENT_PAYMENT_START_DAY = 1;
export const RENT_PAYMENT_DUE_DAY = 10;

type DateParts = { year: number; month: number; day: number };

function getIndiaDateParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
  return { year: values.year, month: values.month, day: values.day };
}

function monthIndex({ year, month }: DateParts): number {
  return year * 12 + month - 1;
}

function dateAtIndiaMidday(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatIndiaDate(date: Date, includeYear = false): string {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: INDIA_TIME_ZONE,
  });
}

export function getIndiaBillingPeriod(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: INDIA_TIME_ZONE,
  }).format(date);
}

export function getFollowingRentDueDate(dueDate: Date): Date {
  const parts = getIndiaDateParts(dueDate);
  return new Date(Date.UTC(parts.year, parts.month, RENT_PAYMENT_DUE_DAY, 12));
}

export function getIndiaRentDueDate(date: Date): Date {
  const parts = getIndiaDateParts(date);
  return dateAtIndiaMidday(parts.year, parts.month, RENT_PAYMENT_DUE_DAY);
}

export function getIndiaCalendarDaysUntil(targetDate: Date, now = new Date()): number {
  const target = getIndiaDateParts(targetDate);
  const today = getIndiaDateParts(now);
  return Math.max(0, Math.round(
    (Date.UTC(target.year, target.month - 1, target.day)
      - Date.UTC(today.year, today.month - 1, today.day)) / 86400000,
  ));
}

export function getRentSchedule(leaseStart: string | Date | null | undefined, now = new Date()) {
  if (!leaseStart) {
    return {
      paymentStartDate: null,
      dueDate: null,
      daysUntilDue: 0,
      isCurrentBillingMonth: false,
      isPaymentWindowOpen: false,
    };
  }

  const start = leaseStart instanceof Date ? leaseStart : new Date(leaseStart);
  if (Number.isNaN(start.getTime())) {
    return {
      paymentStartDate: null,
      dueDate: null,
      daysUntilDue: 0,
      isCurrentBillingMonth: false,
      isPaymentWindowOpen: false,
    };
  }

  const startParts = getIndiaDateParts(start);
  const today = getIndiaDateParts(now);
  const currentMonthIndex = monthIndex(today);
  const leaseMonthIndex = monthIndex(startParts);

  let dueMonthIndex = currentMonthIndex < leaseMonthIndex ? leaseMonthIndex : currentMonthIndex;
  if (dueMonthIndex === leaseMonthIndex && startParts.day > RENT_PAYMENT_DUE_DAY) {
    dueMonthIndex += 1;
  }
  if (dueMonthIndex === currentMonthIndex && today.day > RENT_PAYMENT_DUE_DAY) {
    dueMonthIndex += 1;
  }

  const dueYear = Math.floor(dueMonthIndex / 12);
  const dueMonth = dueMonthIndex % 12 + 1;
  const isCurrentBillingMonth = dueMonthIndex === currentMonthIndex;
  const paymentStartDay = dueMonthIndex === leaseMonthIndex
    ? Math.max(RENT_PAYMENT_START_DAY, startParts.day)
    : RENT_PAYMENT_START_DAY;
  const paymentStartDate = dateAtIndiaMidday(dueYear, dueMonth, paymentStartDay);
  const dueDate = dateAtIndiaMidday(dueYear, dueMonth, RENT_PAYMENT_DUE_DAY);
  const daysUntilDue = getIndiaCalendarDaysUntil(dueDate, now);
  const leaseHasStarted = currentMonthIndex > leaseMonthIndex
    || (currentMonthIndex === leaseMonthIndex && today.day >= startParts.day);
  const isEarlyPaymentWindowOpen = dueMonthIndex > currentMonthIndex
    && today.day > RENT_PAYMENT_DUE_DAY
    && leaseHasStarted;

  return {
    paymentStartDate,
    dueDate,
    daysUntilDue,
    isCurrentBillingMonth,
    isEarlyPaymentWindowOpen,
    isPaymentWindowOpen: leaseHasStarted && (isEarlyPaymentWindowOpen
      || (isCurrentBillingMonth && today.day >= paymentStartDay)),
  };
}
