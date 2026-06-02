import { supabase } from './supabase';

export async function markReservationVisited(reservationId: string, visitRecordId?: string) {
  const { error } = await supabase
    .from('appointment_reservations')
    .update({
      status: 'visited',
      visit_record_id: visitRecordId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId);
  if (error) throw error;
  window.dispatchEvent(new Event('reservations-updated'));
}

export async function markMatchingReservationVisited(customerId: string, visitDate: string, visitRecordId?: string) {
  const { data, error } = await supabase
    .from('appointment_reservations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('reservation_date', visitDate)
    .eq('entry_kind', 'appointment')
    .neq('status', 'visited')
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(1);

  if (error) throw error;
  const reservationId = data?.[0]?.id;
  if (!reservationId) return false;

  await markReservationVisited(reservationId, visitRecordId);
  return true;
}

export async function syncReservationsVisitedByExistingVisits(startYmd: string, endYmd: string) {
  const { data: reservations, error: reservationError } = await supabase
    .from('appointment_reservations')
    .select('id, customer_id, reservation_date')
    .gte('reservation_date', startYmd)
    .lte('reservation_date', endYmd)
    .eq('entry_kind', 'appointment')
    .neq('status', 'visited')
    .neq('status', 'cancelled')
    .not('customer_id', 'is', null);

  if (reservationError) throw reservationError;
  if (!reservations?.length) return 0;

  const customerIds = [...new Set(reservations.map((r) => r.customer_id).filter(Boolean))] as string[];
  if (customerIds.length === 0) return 0;

  const { data: visits, error: visitError } = await supabase
    .from('visit_records')
    .select('id, customer_id, visit_date, created_at')
    .in('customer_id', customerIds)
    .gte('visit_date', startYmd)
    .lte('visit_date', endYmd)
    .order('created_at', { ascending: true });

  if (visitError) throw visitError;
  if (!visits?.length) return 0;

  const visitByCustomerDate = new Map<string, string>();
  visits.forEach((v) => {
    const key = `${v.customer_id}|${String(v.visit_date).slice(0, 10)}`;
    if (!visitByCustomerDate.has(key)) visitByCustomerDate.set(key, v.id);
  });

  const updates = reservations
    .map((r) => {
      const visitRecordId = visitByCustomerDate.get(`${r.customer_id}|${String(r.reservation_date).slice(0, 10)}`);
      return visitRecordId ? { reservationId: r.id, visitRecordId } : null;
    })
    .filter(Boolean) as Array<{ reservationId: string; visitRecordId: string }>;

  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from('appointment_reservations')
        .update({
          status: 'visited',
          visit_record_id: u.visitRecordId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', u.reservationId)
    )
  );
  const updateError = results.find((result) => result.error)?.error;
  if (updateError) throw updateError;

  return updates.length;
}
