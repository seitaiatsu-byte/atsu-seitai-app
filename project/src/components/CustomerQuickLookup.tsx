import { useState } from 'react';
import CustomerSearchPanel, { type CustomerRow } from './CustomerSearchPanel';

interface CustomerQuickLookupProps {
  onOpenChart: (customer: CustomerRow) => void;
}

export default function CustomerQuickLookup({ onOpenChart }: CustomerQuickLookupProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);

  return (
    <div className="bg-white rounded-xl shadow border border-slate-200 p-2.5 sm:p-3">
      <CustomerSearchPanel
        accent="blue"
        mode="lookup"
        compact
        selectedCustomer={selectedCustomer}
        onSelect={setSelectedCustomer}
        onClearSelection={() => setSelectedCustomer(null)}
        onOpenChart={onOpenChart}
      />
    </div>
  );
}
