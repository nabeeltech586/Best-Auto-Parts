import { Suspense } from 'react';
import { Clock } from 'lucide-react';
import PayCheckoutClient from './PayCheckoutClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function PayCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Clock className="h-4 w-4 animate-spin text-teal-600" />
            <span>Loading Best Auto Parts Checkout...</span>
          </div>
        </div>
      }
    >
      <PayCheckoutClient />
    </Suspense>
  );
}
