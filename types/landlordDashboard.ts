export type LandlordProperty = {
  _id: string;
  name: string;
  addressLine1: string;
  city: string;
  postcode: string;
  monthlyRent: number;
  status: "VACANT" | "OCCUPIED";
};

export type LandlordLease = {
  _id: string;
  leaseStart: string;
  leaseEnd: string;
  createdAt: string;
  monthlyRent?: number;
  firstName?: string;
  lastName?: string;
  property?: LandlordProperty | string | null;
  tenant?: { _id: string; fullName?: string; email?: string } | string | null;
};

export type LandlordPayment = {
  _id: string;
  lease: string;
  tenant?: { _id: string; fullName?: string } | string | null;
  amount: number;
  status: "PAID" | "PENDING" | "LATE";
  rentSubmission?: boolean;
  period?: string;
  paidAt?: string | null;
  createdAt: string;
};

export type LandlordRentLedger = {
  lease: string;
  tenant?: { _id: string; fullName?: string } | string | null;
  property?: LandlordProperty | string | null;
  status: "ACTIVE" | "ENDED";
  totalDue: number;
  totalPaid: number;
  awaitingConfirmation: number;
  outstanding: number;
  availableToPay: number;
  periods: {
    period: string;
    rentDue: number;
    electricityDue: number;
    paid: number;
    awaitingConfirmation: number;
    paymentCount: number;
  }[];
};

export type LandlordMaintenanceRequest = {
  _id: string;
  title: string;
  category: string;
  priority: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
};

export type LandlordInspection = {
  _id: string;
  type: string;
  scheduledAt: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
  property?: LandlordProperty | string | null;
};

export type LandlordDashboardMetrics = {
  propertyCount: number;
  occupiedProperties: number;
  vacantProperties: number;
  occupancyPercentage: number;
  activeTenantCount: number;
  expectedMonthlyRent: number;
  monthlyRevenue: number;
  annualRevenue: number;
  annualizedProjectedRent: number;
  rentCollection: {
    collected: number;
    pending: number;
    overdue: number;
    expected: number;
  };
  openMaintenanceCount: number;
  maintenanceCounts: {
    open: number;
    inProgress: number;
    resolved: number;
  };
  monthlyRevenueByMonth: { year: number; month: number; label: string; amount: number }[];
};

export type LandlordDashboardData = {
  landlordCode?: string;
  properties: LandlordProperty[];
  leases: LandlordLease[];
  payments: LandlordPayment[];
  rentLedgers: LandlordRentLedger[];
  maintenanceRequests: LandlordMaintenanceRequest[];
  inspections?: LandlordInspection[];
  metrics: LandlordDashboardMetrics;
};
