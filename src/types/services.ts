export type ServiceType =
  | 'ITR'
  | 'Vehicle Insurance'
  | 'RTO Road Tax'
  | 'State Border Tax'
  | 'E-Challan';

export type ServiceStage =
  | 'NEW_INQUIRY'
  | 'PORTAL_CHECK'
  | 'PAYMENT_PENDING'
  | 'PROCESSING'
  | 'COMPLETED';

export type ServicePaymentStatus = 'UNPAID' | 'PAID';

export interface ServiceCase {
  id: string;
  account_id?: string | null;
  customer_name: string;
  phone: string;
  service_type: ServiceType;
  vehicle_or_ref: string;
  notes?: string | null;
  fee_amount: number;
  govt_fee?: number;
  service_charge?: number;
  receipt_number?: string | null;
  payment_date?: string | null;
  payment_status: ServicePaymentStatus;
  stage: ServiceStage;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceCaseInput {
  customer_name: string;
  phone: string;
  service_type: ServiceType;
  vehicle_or_ref?: string;
  notes?: string;
  fee_amount?: number;
  govt_fee?: number;
  service_charge?: number;
  receipt_number?: string | null;
  payment_date?: string | null;
  payment_status?: ServicePaymentStatus;
  stage?: ServiceStage;
  account_id?: string;
}

export interface UpdateServiceCaseInput {
  customer_name?: string;
  phone?: string;
  service_type?: ServiceType;
  vehicle_or_ref?: string;
  notes?: string;
  fee_amount?: number;
  govt_fee?: number;
  service_charge?: number;
  receipt_number?: string | null;
  payment_date?: string | null;
  payment_status?: ServicePaymentStatus;
  stage?: ServiceStage;
}
